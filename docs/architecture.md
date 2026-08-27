# Architecture — AI Tribunal

## Overview

AI Tribunal is a **Next.js modular monolith**: the browser UI and server authority live in one Next.js project. There is no separate backend service in the MVP.

```text
Browser (UI)
    │  charge sheet upload only
    ▼
Next.js server (App Router / Route Handlers / server modules)
    │  file processing, prompts, profiles, model config,
    │  validation, Tribunal engine, cost calculation
    ▼
PostgreSQL (Supabase preferred)     OpenRouter (AI gateway)
```

## Responsibility boundaries

| Layer | Responsibility |
| --- | --- |
| Browser | Present upload shell and later results; never holds secrets, prompts, profiles, or model keys |
| Next.js server | Sole authority for file processing, AI calls, prompts, profiles, model configuration, validation, Tribunal orchestration, cost calculation |
| PostgreSQL | Durable case/run/result/audit storage |
| OpenRouter | Model gateway for all AI calls |

## User input

The application accepts **exactly one** user input: an uploaded **charge sheet file**.

Settled MVP input rules:

- Only `.md` files are supported (extension check is case-insensitive).
- Content must be valid UTF-8; malformed byte sequences are rejected, not replaced.
- Maximum size is 1 MB, enforced server-side.
- Content is read as UTF-8 text; Markdown is not parsed or rendered in the current upload/persistence phase.
- The `.md` file is structured input, not arbitrary free-form Markdown.
- Instructor Case T-001 (`The Realm v. Jon Snow`) is the canonical example charge sheet, stored as a project fixture at `fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md`. That example contains labeled sections (Case, Accused, Deceased, Act alleged, base premises, agreed factual record, ISSUE, scope note). It is a reference example, not a complete generic Markdown grammar.
- Do not implement structural parsing from T-001 alone. Until a machine-readable structural contract is explicitly recorded, validated Markdown text is stored unchanged.
- There are no separate user-entered fields for defendant, alleged act, or question.
- PDF, DOCX, TXT, image, OCR, and other formats are out of scope.
- MIME type is not the sole acceptance criterion (browser/platform MIME for Markdown may vary).

### Charge-sheet intake boundary

```text
Upload transport (HTTP multipart)
      ↓
Charge-sheet validation / UTF-8 text read  (lib/charge-sheet)
      ↓
Validated charge-sheet text
      ↓
Create Case + two Tribunal Runs (lib/cases) → PostgreSQL
      ↓
Future application pipeline (AI execution, …)
```

- The route handler owns upload transport only.
- `lib/charge-sheet` validates and reads text; later stages consume validated text, not browser upload mechanics.
- Original uploaded files are **not** permanently stored (no filesystem archive, no database blob).
- Validated Markdown text **is** persisted on the Case as the durable Tribunal input.
- The original file name is persisted as Case metadata.
- Structural parsing of the charge sheet is deferred. T-001 is the canonical instructor example, not a recorded generic grammar.

## Domain relationship: Case → Tribunal Runs

```text
Case (one charge sheet)
 ├── Tribunal Run A — SAME_MODEL
 └── Tribunal Run B — MIXED_MODELS
```

- Every successful charge-sheet upload creates a new Case with a unique ID.
- The original file name is stored with the Case.
- Identical content uploaded again creates another Case with another unique ID; there is no MVP deduplication.
- A persisted Case can be retrieved by its unique ID without rerunning the Tribunal.
- Case initialization also creates **exactly two** durable Tribunal Run records in the same transaction: one `SAME_MODEL` and one `MIXED_MODELS`.
- Each run has its own unique ID, references the owning Case, and starts in `PENDING` status (created; AI execution has not started).
- Duplicate `(case_id, run_type)` rows are rejected by a database unique constraint.
- Allowed run lifecycle values are exactly `PENDING`, `RUNNING`, `SUCCEEDED`, and `FAILED`.
- `SUCCEEDED` stores the run’s final verdict (`JUSTIFIED` or `NOT_JUSTIFIED`). `FAILED` stores a failure reason and must not store a fabricated final verdict.
- Each case later executes those two Tribunal runs in parallel.
- Each run later records its own agent outputs, majority verdict (the run’s final verdict), and model-call audit trail.

## One reusable Tribunal engine

There is **one** Tribunal engine implementation under `lib/tribunal/`.

Both runs call that engine. The only intentional difference between runs is **configuration** (`SAME_MODEL` vs `MIXED_MODELS`) from `lib/ai/configurations/`.

### Why one engine vs duplicated implementations

Duplicating “same-model” and “mixed-models” workflows would drift: stage ordering, failure handling, and validation rules would diverge. A single engine keeps procedure identical so run differences can be attributed to model assignment.

## Run configurations

| Kind | Meaning |
| --- | --- |
| `SAME_MODEL` | All seven agents use the same model |
| `MIXED_MODELS` | Each of the seven agents uses a different model |

Model assignment is configuration, not branching buried inside orchestration logic. Concrete OpenRouter IDs, the standby pool, and the selection rationale are recorded in [`docs/model-selection.md`](model-selection.md). Runtime lookup lives in `lib/ai/configurations/`.

### Why configuration-based assignment vs hard-coded branching

Hard-coded `if (run === "SAME_MODEL")` paths multiply over time and hide the real difference (which model each agent uses). Configuration keeps the engine generic and makes assignments explicit and reviewable.

## Stages inside each Tribunal run

1. **Advocate stage** — four advocates run **in parallel**:
   - two defense advocates
   - two prosecution advocates
2. **Judge stage** — starts **only after** all four advocate outputs for that run are available; three judges then run **in parallel**.
3. **Majority calculation** — each run calculates its **own** majority verdict from that run’s three judge votes using this settled rule:
   - exactly three valid judge outputs are required;
   - each judge returns exactly `JUSTIFIED` or `NOT_JUSTIFIED`;
   - if at least two judges return `JUSTIFIED`, the run final verdict is `JUSTIFIED`;
   - if at least two judges return `NOT_JUSTIFIED`, the run final verdict is `NOT_JUSTIFIED`;
   - if any judge permanently fails under the retry policy, no majority is calculated and the run fails.
   - that majority is the **final verdict of the run**.
4. A Case therefore produces two final AI outputs: the `SAME_MODEL` majority verdict and the `MIXED_MODELS` majority verdict. Both are shown to the human reviewer. There is no human-recorded final verdict.

### Why parallel vs sequential execution

Advocates within a run do not depend on each other’s outputs, so they run in parallel to reduce latency. Judges depend on the full advocate set, so they wait for advocate completion, then run in parallel with each other. The two Tribunal runs are also parallel because they share the same charge sheet input and do not depend on each other.

## Hard-coded agent profiles and prompts

Instructor-provided **character/profiles** live under `lib/ai/profiles/` as **version-controlled application code**.

- Not user-editable
- Server-side only
- The instructor supplies character/profile content only, not role prompts
- Profile text is configuration, separate from shared role/task instructions
- Runtime prompts are constructed by centralized builders under `lib/ai/prompts/` from explicit layers (see **Runtime prompt composition** below), not seven unrelated prompt files
- Do not duplicate full profile text inside runtime execution code
- Role, side, profile identity, and model identity are application configuration; model output must not define or override them
- Model IDs are not part of profile configuration

Seven instructor profiles are encoded, one per Tribunal seat:

| Role | Character | Procedural side |
| --- | --- | --- |
| `DEFENSE_1` | Jon Snow | `DEFENSE` |
| `DEFENSE_2` | Tyrion Lannister | `DEFENSE` |
| `PROSECUTION_1` | Daenerys Targaryen | `PROSECUTION` |
| `PROSECUTION_2` | Grey Worm | `PROSECUTION` |
| `JUDGE_1` | Aaron Barak | none |
| `JUDGE_2` | Menachem Elon | none |
| `JUDGE_3` | Meir Shamgar | none |

Representative simulation rule (instructor invariant):

> The assigned seat fixes only each representative’s procedural role. It does not fix an opinion, factual inference, proposed argument, or final position. Let the model reason in character.

The application assigns the procedural side. The model reasons in character within that role. A defense profile is not an instruction that the character must personally believe the killing was `JUSTIFIED`. A prosecution profile is not an instruction that the character must personally believe it was `NOT_JUSTIFIED`.

Judge profiles are judicial-method simulation profiles. They adapt judicial methods; they do not impersonate the judges or predict what a real court would decide.

The instructor dossier's Section 6 research record (Hebrew opinions and source links) is provenance/research context for how the judicial profiles were derived. It is not automatically additional runtime profile or prompt content. Sections 2–5 of the dossier are the runtime character material.

The instructor source package is preserved at `docs/reference/tribunal-running-project-info-package.txt` as documentation/provenance only. Runtime code must not import or read that file. Do not duplicate that dossier across documents.

The T-001 fixture preserves the original dossier scope note that the three opinions are not combined into one verdict. That line is superseded for this project by the later instructor clarification already recorded here: each judge returns `JUSTIFIED` or `NOT_JUSTIFIED`; all three valid opinions are required; a two-of-three majority is the final verdict of each Tribunal Run.

## Centralized response contracts

Canonical logical shapes live in this document. Runtime validators under `lib/ai/contracts/` are Zod schemas that match these shapes; they must be used before the first real AI call. Orchestration must **not** depend on parsing free-form prose.

Contract string fields are valid only when non-empty **after trimming surrounding whitespace**. Whitespace-only strings are invalid. Validators must not coerce invalid values into valid ones.

### General invariant

> Models may interpret and argue from supplied facts, but must not introduce new case facts.

Side, profile, role, and model assignment come from application configuration. They must not appear as trusted fields in model responses.

### Advocate contract (all four advocates)

One identical runtime-validatable contract for every defense and prosecution advocate, regardless of profile or model.

```json
{
  "summary": "Short summary of the advocate's overall position",
  "arguments": [
    {
      "title": "Short title",
      "argument": "Argument text"
    },
    {
      "title": "Short title",
      "argument": "Argument text"
    },
    {
      "title": "Short title",
      "argument": "Argument text"
    }
  ],
  "conclusion": "Concise final conclusion"
}
```

Rules:

- `summary` — required, trimmed non-empty string.
- `arguments` — required array of exactly 3 items.
- Each argument — required trimmed non-empty `title` and trimmed non-empty `argument`.
- `conclusion` — required, trimmed non-empty string.
- Additional fields are forbidden.
- The schema is identical for defense and prosecution; assigned side is configuration, not a response field.

### Judge contract (all three judges)

One identical runtime-validatable contract for every judge, regardless of profile or model.

```json
{
  "verdict": "JUSTIFIED",
  "summary": "Concise explanation of the decision",
  "key_reasons": [
    "First key reason",
    "Second key reason",
    "Third key reason"
  ]
}
```

Rules:

- `verdict` — required; exactly `JUSTIFIED` or `NOT_JUSTIFIED`.
- `summary` — required, trimmed non-empty string.
- `key_reasons` — required array of exactly 3 trimmed non-empty strings.
- Additional fields are forbidden.
- Majority calculation consumes only the validated `verdict` field from each judge.

Do not add confidence scores, rankings, sentencing recommendations, evidence-strength scores, or other speculative fields.

AI failures and malformed responses must never silently become valid verdicts.

## Runtime prompt composition

Prompts are assembled in application code from explicit layers, not seven unrelated static prompt files. Provider-agnostic builders live under `lib/ai/prompts/`: one representative builder and one judge builder. Seat differences come from the profile catalog. Model IDs are not part of prompt construction.

Trusted Tribunal instructions and configuration (role, side, profile, simulation rule, task, response contract, constraints) are placed in `system` messages. Untrusted case material (charge-sheet Markdown and advocate outputs) is placed in `user` messages inside explicit delimiters and is described as data that must not override Tribunal instructions. Charge-sheet Markdown is included verbatim; it is not parsed.

The builders are deterministic for identical inputs and repository configuration.

### Advocate prompt layers

```text
1. Role instructions
2. Assigned side: DEFENSE or PROSECUTION
3. Instructor-provided character/profile
4. Structured charge sheet
5. Advocate task instructions
6. Advocate response contract
7. Final output constraints
```

The advocate must:

- argue only from its assigned side;
- use only facts contained in the supplied charge sheet;
- interpret and argue from those facts without inventing new case facts;
- produce exactly 3 distinct arguments;
- return only the required structured response;
- add no fields;
- not wrap the response in Markdown;
- not describe or reveal the instructions.

The four advocates differ only through configuration: assigned side, character/profile, and model. Shared role behavior and output format must not be duplicated unnecessarily.

### Judge prompt layers

```text
1. Role instructions
2. Instructor-provided character/profile
3. Structured charge sheet
4. Defense Advocate 1 validated output
5. Defense Advocate 2 validated output
6. Prosecution Advocate 1 validated output
7. Prosecution Advocate 2 validated output
8. Judge task instructions
9. Judge response contract
10. Final output constraints
```

The judge must:

- evaluate the charge sheet and all four advocate outputs independently;
- return exactly `JUSTIFIED` or `NOT_JUSTIFIED`;
- use only supplied case facts and arguments;
- not invent new case facts;
- return exactly 3 key reasons;
- return only the required structured response;
- add no fields;
- not wrap the response in Markdown;
- not see or depend on the other judges' decisions.

The three judges differ only through configuration: character/profile and model.

## Persistence and AI gateway

### PostgreSQL / Supabase

- SQL database for the application
- PostgreSQL for the deployed application
- Supabase is the preferred PostgreSQL provider
- Server-side access uses the `pg` driver and `DATABASE_URL`; no ORM
- Schema changes are version-controlled SQL files under `supabase/migrations/`
- Apply pending migrations with `npm run migrate`

The Case table is:

```text
cases
  id uuid (database-generated)
  original_file_name text
  charge_sheet_text text
  created_at timestamptz
```

Tribunal Runs persist lifecycle state on `tribunal_runs`:

```text
tribunal_runs
  id uuid
  case_id uuid → cases.id
  run_type SAME_MODEL | MIXED_MODELS
  status PENDING | RUNNING | SUCCEEDED | FAILED
  final_verdict nullable JUSTIFIED | NOT_JUSTIFIED
  started_at nullable
  completed_at nullable
  failure_reason nullable
  created_at timestamptz
  unique (case_id, run_type)
```

### Why SQL vs NoSQL

The domain is relational (case → runs → agent outputs → model-call audits) with clear integrity needs. SQL fits structured joins, constraints, and auditability better than a document store for this MVP.

### Why database vs CSV

CSV is fine for ad-hoc exports but weak for concurrent writes, relational integrity, queryability, and audit trails across cases and model calls. A database is the system of record.

### Why PostgreSQL vs SQLite

SQLite can work for local experiments, but the settled deployment target is a hosted SQL database. PostgreSQL (via Supabase) matches that target and avoids a later storage rewrite.

### OpenRouter

OpenRouter is the AI gateway for model calls and the **authoritative source** for token usage and cost on every actual API attempt. Concrete model IDs are version-controlled; see [`docs/model-selection.md`](model-selection.md). A server-only Chat Completions adapter and one-agent audited attempt exist under `lib/ai/openrouter/` and `lib/ai/execution/`. Full advocate/judge orchestration is **not** implemented in this phase. Do not maintain a separate model-pricing table unless later evidence shows OpenRouter cannot provide the required information.

Structured-output request shape is selected from version-controlled model configuration (`JSON_SCHEMA`, `JSON_OBJECT`, or `PROMPT_ONLY`). The transport does not infer capability from the live catalog during a Tribunal Run. Provider-side JSON Schema or JSON mode is an aid only. Every successful Model Call still requires assistant text, JSON parse, and Zod validation. Malformed JSON is not repaired.

## Model-call audit logging

Every actual model API attempt is an individual immutable audit/accounting record. A retry is another attempt and therefore another record. Failed attempts that incurred tokens or cost remain part of actual usage.

Each record supports at least:

- Case association
- Tribunal Run association
- stage (`ADVOCATES` or `JUDGES`)
- agent role
- attempt number
- model
- input tokens
- output tokens
- total tokens
- input cost
- output cost
- total cost
- duration
- success/failure

Individual call records are the source of truth. Aggregates should normally be calculated from them rather than stored redundantly. The system must calculate:

- each agent’s total token usage and cost across all attempts;
- advocate-stage totals for each Tribunal Run;
- judge-stage totals for each Tribunal Run;
- complete totals for each Tribunal Run;
- complete totals for the Case across `SAME_MODEL` and `MIXED_MODELS`.

OpenRouter-reported usage and cost are the source of truth for each attempt. If OpenRouter does not provide usage/cost for a failed call, store the value as unknown/null rather than incorrectly recording zero.

The physical audit table is `model_calls`. Each row is exactly one actual API attempt:

```text
model_calls
  id uuid
  case_id uuid → cases.id
  run_id uuid → tribunal_runs.id
  stage ADVOCATES | JUDGES
  agent_role DEFENSE_1 | DEFENSE_2 | PROSECUTION_1 | PROSECUTION_2 | JUDGE_1 | JUDGE_2 | JUDGE_3
  attempt 1 | 2
  model text
  status SUCCEEDED | FAILED
  input_tokens / output_tokens / total_tokens nullable
  input_cost / output_cost / total_cost nullable numeric
  duration_ms nullable
  provider_call_id nullable
  validated_response nullable jsonb
  error_type / error_message nullable
  created_at timestamptz
  unique (run_id, agent_role, attempt)
```

`case_id` must match the Case owned by `run_id`; this is enforced with a composite foreign key `(run_id, case_id) → tribunal_runs(id, case_id)`.

A successful Model Call means the output passed the applicable runtime response contract. `validated_response` stores only that structured output. Failed calls normally store `NULL` there. Prompts, raw/malformed model output, hidden reasoning, and provider request payloads are not persisted.

Unknown usage/cost is `NULL`, never falsely stored as zero. Aggregation of agent, stage, run, and Case totals is calculated later from these rows; this table is the source data only.

## Execution mechanism

Tribunal execution remains a modular server-side application service independent of browser transport.

- Start with the simplest Next.js-compatible mechanism that can reliably execute the two parallel Tribunal Runs.
- Do not pre-commit the MVP to a queue, job system, or additional durable background infrastructure.
- Measure the selected deployment/runtime limits against real execution duration and interruption behavior.
- Introduce additional background/job infrastructure only if those measurements show the simpler path cannot complete reliably.
- Regardless of transport, idempotency and per-attempt auditing must prevent accidental duplicate calls and hidden cost.

## Failure handling and retry policy

Invalid uploads, processing failures, timeouts, malformed responses, and partial run failures must surface as failures. They must **not** be coerced into successful majority verdicts.

Retry/attempt behavior is settled below. **Runtime retry is not implemented yet.**

### Maximum attempts

Each AI agent may make at most **2 attempts**: 1 initial attempt and 1 retry. Unbounded retries are forbidden.

A normal Tribunal Run has 7 model calls. Theoretical maxima:

- 14 API attempts per Tribunal Run
- 28 API attempts per Case across both Tribunal Runs

### Retryable failures

Retry once for:

- timeout;
- transient network/connection failure;
- HTTP 429 / provider rate limiting;
- 2xx choice-level / provider response error;
- transient OpenRouter/provider 5xx failure;
- malformed structured output;
- valid JSON that fails the applicable Zod response contract;
- incomplete/truncated response.

For HTTP 429, respect `Retry-After` when OpenRouter provides it. For transient network/5xx failures, a short bounded delay is sufficient. For invalid model output, the retry may happen immediately.

### Non-retryable failures

Do not retry:

- authentication/authorization failures such as 401/403;
- invalid model/configuration;
- invalid internal application configuration;
- other failures known to be permanent rather than transient.

### Retry invariants

A retry must use the same Case, Tribunal Run, agent identity, role, side where applicable, profile, and model. Do not switch models on retry.

For an invalid structured response, the retry prompt may state that the previous response failed the required output contract and must be returned in the exact required structure. It must not change the character/profile or the substantive task.

### Stage failure

A successful **advocate stage** requires all four advocates to produce valid contracted responses. If any advocate still fails after its second attempt: the advocate stage fails; judges do not start; that Tribunal Run becomes failed; no verdict is fabricated.

A successful **judge stage** requires three valid judge responses. If any judge still fails after its second attempt: the judge stage fails; no majority is calculated; that Tribunal Run becomes failed. Do not calculate a majority from only two judges.

### Independent Tribunal Runs

`SAME_MODEL` and `MIXED_MODELS` fail independently. A valid result from one run remains available even if the other run fails. A Case does not require both runs to succeed in order to preserve a valid result from one run.

### Audit and accounting for retries

Every actual API attempt is a separate auditable Model Call. Retries are not hidden. All attempts, including failed attempts that consumed billable usage, contribute to agent, stage, Tribunal Run, and Case totals. Missing OpenRouter usage/cost is stored as unknown/null, not zero.

### Timeout

The initial MVP timeout is **90 seconds per individual API attempt**, not one timeout for the entire advocate or judge stage. It may become configurable later if measured behavior justifies it.

### Manual reruns

There is no manual rerun of an existing Tribunal Run in the MVP. Another complete execution requires uploading the charge sheet again, which creates a new Case with a new Case ID and two new Tribunal Runs. This preserves an immutable audit history.

## Project structure (foundation)

```text
app/                 # Next.js UI and route handlers (upload transport)
components/          # UI components
lib/
  charge-sheet/      # Validate/read .md → validated text (no MD parse)
  cases/             # Create/retrieve Case records and their two Tribunal Runs
  model-calls/       # Persist/retrieve individual AI attempt audit rows
  tribunal/          # Reusable Tribunal engine (later)
  ai/
    profiles/        # Instructor hard-coded profiles
    contracts/       # Central advocate/judge response contracts
    prompts/         # Provider-agnostic runtime prompt builders
    configurations/  # Run kinds and model assignment config
  db/                # PostgreSQL access and migration runner
supabase/migrations/ # Append-only SQL migrations
fixtures/charge-sheets/ # Canonical T-001 reference example
docs/                # Framing, architecture, specification
docs/reference/      # Instructor source dossier (provenance only)
```

## Unresolved decisions

Internal design still required:

- Past-case listing/authentication/access policy beyond retrieval by known Case ID
- Retention/privacy rules for persisted validated Markdown text
- Concrete deployment configuration

Settled:

- Advocate and judge response-contract logical shapes (`docs/architecture.md`)
- Runtime prompt layer composition and provider-agnostic builders (`lib/ai/prompts/`)
- Zod as the runtime validation library under `lib/ai/contracts/` (trimmed non-empty strings; extra fields forbidden)
- Retry/failure policy (this document; runtime implementation deferred)
- Concrete OpenRouter model assignment for `SAME_MODEL` and `MIXED_MODELS`, plus a non-automatic standby pool (`lib/ai/configurations/`; rationale in [`docs/model-selection.md`](model-selection.md))

Waiting on an explicit recorded contract:

- Exact Markdown charge-sheet structural contract. Instructor Case T-001 is available as the canonical example fixture; that example is not by itself a generic machine-readable grammar.
