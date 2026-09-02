# Architecture — AI Tribunal

## Overview

AI Tribunal is a **Next.js modular monolith**: the browser UI and server authority live in one Next.js project. There is no separate backend service in the MVP.

The MVP is implemented and deployed on Render. The accepted production dual-run E2E succeeded: both Tribunal Runs persisted `NOT_JUSTIFIED`, `/cases/{id}` reload reconstructed those results without new model calls, and duplicate execution is prevented. See [`docs/deployment.md`](deployment.md).

```text
Browser (UI)
    │  convene the canonical Case
    ▼
Next.js server (App Router / Route Handlers / server modules)
    │  canonical record, prompts, profiles, model config,
    │  validation, Tribunal engine, cost calculation
    ▼
PostgreSQL (Supabase preferred)     OpenRouter (AI gateway)
```

## Responsibility boundaries

| Layer | Responsibility |
| --- | --- |
| Browser | Present the launch action and results; never supplies charge-sheet text or holds secrets, prompts, profiles, or model keys |
| Next.js server | Sole authority for the canonical record, AI calls, prompts, profiles, model configuration, validation, Tribunal orchestration, cost calculation |
| PostgreSQL | Durable case/run/result/audit storage |
| OpenRouter | Model gateway for all AI calls |

## User input

The homepage accepts one action: **convene the Tribunal**. It does not accept a file or editable Case content.

The server owns the canonical T-001 charge sheet (`The Realm v. Jon Snow`) at `fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md`. Each launch reads that UTF-8 fixture, creates a fresh Case with exactly two `PENDING` Runs, navigates to the Case workspace, and starts both Runs. The browser cannot supply or replace the charge-sheet text. Existing Cases remain retrievable by ID without execution.

### Charge-sheet intake boundary

```text
Homepage launch (POST with no body)
      ↓
Server-owned canonical fixture read
      ↓
Validated charge-sheet text
      ↓
Create Case + two Tribunal Runs (lib/cases) → PostgreSQL
      ↓
Tribunal execution (lib/tribunal) + Model Call audit
```

- The creation route accepts no Case content from the browser.
- Canonical Markdown text **is** persisted on each Case as its durable Tribunal input.
- The canonical fixture name is persisted as Case metadata; no file/blob is uploaded or stored.
- Structural parsing of the charge sheet is deferred. T-001 is the canonical instructor example, not a recorded generic grammar.

## Domain relationship: Case → Tribunal Runs

```text
Case (one charge sheet)
 ├── Tribunal Run A — SAME_MODEL
 └── Tribunal Run B — MIXED_MODELS
```

- Every homepage launch creates a new Case with a unique ID.
- The original file name is stored with the Case.
- Repeated launches create separate Cases with separate IDs; there is no deduplication.
- A persisted Case can be retrieved by its unique ID without rerunning the Tribunal.
- Case initialization also creates **exactly two** durable Tribunal Run records in the same transaction: one `SAME_MODEL` and one `MIXED_MODELS`.
- Each run has its own unique ID, references the owning Case, and starts in `PENDING` status (created; AI execution has not started).
- Duplicate `(case_id, run_type)` rows are rejected by a database unique constraint.
- Allowed run lifecycle values are exactly `PENDING`, `RUNNING`, `SUCCEEDED`, and `FAILED`.
- `SUCCEEDED` stores the run’s final verdict (`JUSTIFIED` or `NOT_JUSTIFIED`). `FAILED` stores a failure reason and must not store a fabricated final verdict.
- Each Case executes those two Tribunal Runs in parallel through `executeCaseTribunals`. The Runs remain independent; one may succeed while the other fails. Case-level `ok` means both Runs succeeded, not that no usable Run result exists. A successful sibling keeps its validated outputs and final verdict. There is no Case-level combined verdict.
- Each run later records its own agent outputs, majority verdict (the run’s final verdict), and model-call audit trail.

## One reusable Tribunal engine

There is **one** Tribunal engine implementation under `lib/tribunal/`.

Both runs call that engine. The only intentional difference between runs is **configuration** (`SAME_MODEL` vs `MIXED_MODELS`) from `lib/ai/configurations/`.

### Bounded recovery

Each seat first receives at most two attempts on its persisted primary model. For `MIXED_MODELS` only, a model/provider/output-specific failure after that bound may receive one distinct, version-controlled standby model for at most two attempts. `SAME_MODEL` never substitutes a model. Every attempt records the actual model, `PRIMARY`/`FALLBACK` provenance, and recovery cycle; costs and unknown-usage accounting include all attempts. A failed Run has no verdict. A user may resume a failed Run only through an atomic claim, which starts a new bounded cycle for unresolved seats while retaining validated outputs and audit history. 401/403/configuration failures are not fallback eligible.

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

Each Judge returns one independently validated `JUSTIFIED` or `NOT_JUSTIFIED` opinion with reasons. All three valid opinions are required before the Run coordinator records its final result.

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

OpenRouter is the AI gateway for model calls and the **authoritative source** for token usage and cost on every actual API attempt. Concrete model IDs are version-controlled; see [`docs/model-selection.md`](model-selection.md). A server-only Chat Completions adapter, one-agent audited attempt, and bounded two-attempt representative and Judge retry exist under `lib/ai/openrouter/` and `lib/ai/execution/`. The four-advocate and three-judge parallel stages, two-of-three majority, single-run coordinator (`executeTribunalRun`), and Case-level dual-run coordinator (`executeCaseTribunals`) are implemented under `lib/tribunal`. Persisted Case results and token/cost aggregation are reconstructed from `cases`, `tribunal_runs`, and `model_calls` under `lib/results`. Do not maintain a separate model-pricing table unless later evidence shows OpenRouter cannot provide the required information.

Structured-output request shape is selected from version-controlled model configuration (`JSON_SCHEMA`, `JSON_OBJECT`, or `PROMPT_ONLY`). The transport does not infer capability from the live catalog during a Tribunal Run. Provider-side JSON Schema or JSON mode is an aid only. Every successful Model Call still requires assistant text, JSON parse, and Zod validation. Malformed JSON is not repaired.

Exact-length homogeneous collections (`arguments`, `key_reasons`) remain “exactly three” at the Zod contract. Provider JSON Schema exports a single `items` schema plus `minItems`/`maxItems`, not draft-07 tuple `items: [...]`. Zod remains the authoritative validator.

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
  model_source PRIMARY | FALLBACK
  recovery_cycle integer >= 1
  status SUCCEEDED | FAILED
  input_tokens / output_tokens / total_tokens nullable
  input_cost / output_cost / total_cost nullable numeric
  duration_ms nullable
  provider_call_id nullable
  validated_response nullable jsonb
  error_type / error_message nullable
  failure_classification nullable
  created_at timestamptz
  unique (run_id, agent_role, recovery_cycle, model_source, attempt)
```

`case_id` must match the Case owned by `run_id`; this is enforced with a composite foreign key `(run_id, case_id) → tribunal_runs(id, case_id)`.

A successful Model Call means the output passed the applicable runtime response contract. `validated_response` stores only that structured output. Failed calls normally store `NULL` there. `model_source` and `recovery_cycle` preserve primary/fallback provenance across Resume cycles; `failure_classification` stores only a safe normalized category. Prompts, raw/malformed model output, hidden reasoning, and provider request payloads are not persisted.

Unknown usage/cost is `NULL`, never falsely stored as zero. A provider-reported zero is a known zero. Agent, stage, run, and Case totals are calculated from these rows by `getCaseResults`; this table remains the source data. Each aggregatable metric is `{ value, complete }`: `value` is the sum of known non-null contributions, and `complete` is false when any contributing attempt left that metric unknown. Missing values are not estimated. Completeness is per metric. An empty attempt set is `{ value: 0, complete: true }` with `attemptCount: 0`.

## Persisted Case results

`getCaseResults` under `lib/results/` reconstructs a completed or failed Case from `cases`, `tribunal_runs`, and `model_calls` only. It does not execute models, rerun prompts, derive verdicts from prose, or replace a persisted `tribunal_runs.final_verdict`. Charge-sheet text is omitted, matching the public Case retrieval contract.

```text
CaseResults
├── case
│   ├── id
│   ├── originalFileName
│   └── createdAt
│
├── runs
│   ├── SAME_MODEL
│   │   ├── id / status / finalVerdict / failureReason
│   │   ├── advocates (validated outputs, or null)
│   │   ├── judges (validated outputs, or null)
│   │   ├── attempts (every Model Call row)
│   │   └── accounting (per agent, advocate stage, judge stage, run)
│   │
│   └── MIXED_MODELS
│       └── ...
│
└── accounting
    └── Case total across both Runs
```

Validated Advocate and Judge slots come from the single `SUCCEEDED` `model_calls.validated_response` for that role, re-checked with the existing Zod contracts. Execution records at most one success per `(run_id, agent_role)`. Duplicate successes, a `SUCCEEDED` row whose stored JSON fails the contract, or a `SUCCEEDED` Run missing four Advocate outputs, three Judge outputs, or a persisted `final_verdict` fail closed as `INTEGRITY_VIOLATION`. Failed-attempt JSON is not used as an output. Attempts are ordered by agent role, then attempt number. Each accounting metric is `{ value, complete }` as above. Costs stay exact decimal strings.

## Execution mechanism

Tribunal execution remains a modular server-side application service independent of browser transport. HTTP is only a trigger and query boundary.

```text
POST /api/cases                 → create canonical Case + two PENDING Runs (no request body)
GET  /api/cases/recent          → five most recently executed Cases (read-only)
GET  /api/cases/{id}            → Case metadata (no charge-sheet text)
POST /api/cases/{id}/execute    → executeCaseTribunals(persisted charge sheet)
GET  /api/cases/{id}/results    → getCaseResults (read-only)
```

- `POST /api/cases` reads the canonical fixture on the server. Its request has no body and cannot override Case content.
- `POST /api/cases/{id}/execute` uses the Case ID in the route as authority. It loads the persisted `charge_sheet_text` and `OPENROUTER_API_KEY` on the server. The client cannot supply Run IDs, model IDs, profiles, charge-sheet text, retry parameters, or verdicts.
- HTTP **200** is used for every completed execution request: both Runs succeeded, one succeeded, or both failed. The JSON body is authoritative. `ok: true` means both Runs succeeded. `ok: false` with `reason: "RUN_FAILURE"` still includes both independent Run outcomes. Provider/model failures are not converted into an opaque 500.
- Duplicate execute requests keep the existing per-Run `PENDING → RUNNING` claim. Already-started or terminal Runs return `NOT_PENDING` and make no additional model requests. There is no Case-level lock.
- `GET /api/cases/recent` is a homepage convenience. It returns at most five Cases that have at least one Tribunal Run with `started_at`, ordered by `MAX(tribunal_runs.started_at) DESC`. It never executes a model or mutates Run state. Charge-sheet text, prompts, raw provider output, and secrets are omitted. Manual known-Case retrieval remains the supported reopen path.
- `GET /api/cases/{id}/results` is read-only. It never executes a model or mutates Run state. Charge-sheet text is omitted. There is no Case-level combined verdict.
- Invalid Case ID is 400; missing Case is 404; missing OpenRouter or database configuration is 503; invalid durable topology is 409; persisted integrity failure is 500 with `INTEGRITY_VIOLATION`. Unexpected failures return a safe 500 without secrets, stack traces, prompts, or raw provider payloads.
- Keep execution in the synchronous Next.js route. The browser may poll the existing read-only results endpoint or request the optional SSE response transport to reveal transient progress and already-persisted seats. Neither transport creates a background job or changes the durable source of truth.
- A complete initial Case has 14 model calls when every primary succeeds on attempt 1. The bounded maximum is 42 attempts: up to 14 in `SAME_MODEL`, plus up to 14 primary and 14 fallback attempts in `MIXED_MODELS`. Later user-triggered Resume cycles are separately bounded and auditable. Host request-duration limits must be verified against the serialized fallback bound before production deployment. SSE remains attached to the synchronous request; do not introduce fire-and-forget, queue, worker, or additional durable background infrastructure until measurements require it.

### Public execution cost guard

Case launch and eligible failed-Run Resume are the only public actions that authorize new model work. When enabled, both pass through one PostgreSQL-backed fixed-window guard: five actions per HMAC-hashed client address per hour. Case creation reserves the action used by its automatic initial execution, so `/execute` does not count a second time. Resume validates that the persisted Run exists and is `FAILED` before consuming an action. Read routes never consume quota.

The limiter decision and increment are one atomic database statement. A denied action returns `429` and `Retry-After`; it does not begin model execution. The raw address is not stored. This protects bounded demo cost but does not replace authentication, a global provider budget, or distributed abuse controls; see `docs/security.md`.
- Regardless of transport, idempotency and per-attempt auditing must prevent accidental duplicate calls and hidden cost.

## Failure handling and retry policy

Canonical-record read failures, processing failures, timeouts, malformed responses, and partial run failures must surface as failures. They must **not** be coerced into successful majority verdicts.

Retry/attempt behavior is settled below. Bounded runtime retry for a single representative or Judge is implemented under `lib/ai/execution/`. Those helpers do not mark the Tribunal Run `SUCCEEDED` or `FAILED`. The Advocate-stage coordinator marks a run `FAILED` when any representative permanently fails and leaves a successful stage `RUNNING`. The Judge-stage coordinator calculates two-of-three majority from validated `verdict` fields only after three valid Judge responses, then marks `SUCCEEDED`. Any permanent Judge failure marks `FAILED` with no majority and a null final verdict. `executeTribunalRun` sequences those stages for one existing Run and does not add extra lifecycle writes. A fresh execution is claimed by the existing atomic `PENDING → RUNNING` transition; a Run that is already `RUNNING`, `SUCCEEDED`, or `FAILED` is rejected with no model requests and no new audit rows. `executeCaseTribunals` starts the Case’s two existing Runs concurrently and independently. `getCaseResults` reconstructs persisted outputs and accounting without executing models or replacing `tribunal_runs.final_verdict`.

### Maximum attempts

Each model assignment for one seat may make at most **2 attempts**: 1 initial attempt and 1 retry. `MIXED_MODELS` may then assign one eligible, distinct fallback to that unresolved seat for at most 2 more attempts in the same recovery cycle. `SAME_MODEL` never substitutes a model. Unbounded retries are forbidden.

A normal Tribunal Run has 7 successful primary calls. Initial-execution maxima:

- `SAME_MODEL`: 14 attempts
- `MIXED_MODELS`: 28 attempts (14 primary + 14 fallback)
- complete Case: 42 attempts across both Runs

Each explicit Resume starts a new atomic recovery cycle and executes only unresolved seats. It does not reset or hide the prior bound, successful outputs, attempts, or cost.

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

For HTTP 429, respect `Retry-After` when OpenRouter provides it. Delta-seconds and HTTP-date are accepted; the delay is capped at **60 seconds** so an absurd header cannot stall execution. When Retry-After is missing or unusable, wait 1 second. For timeout, transient network, and transient 5xx failures, wait 1 second. For invalid model output, retry immediately. The sleep is injectable for tests.

### Non-retryable failures

Do not retry:

- authentication/authorization failures such as 401/403;
- invalid model/configuration;
- invalid internal application configuration;
- other failures known to be permanent rather than transient.

### Retry invariants

A retry must use the same Case, Tribunal Run, agent identity, role, side where applicable, profile, and model. Do not switch models on retry.

For an invalid structured response, attempt 2 adds a short trusted system correction that the previous response failed the required output contract and that the required JSON structure must be followed exactly. The raw invalid response is not included. Character, side, task, charge sheet, and contract are unchanged. Transport, network, and provider failures reuse the original prompt.

### Stage failure

A successful **advocate stage** requires all four advocates to produce valid contracted responses. If any advocate still fails after its second attempt: the advocate stage fails; judges do not start; that Tribunal Run becomes failed; no verdict is fabricated.

A successful **judge stage** requires three valid judge responses. If any judge still fails after its second attempt: the judge stage fails; no majority is calculated; that Tribunal Run becomes failed. Do not calculate a majority from only two judges.

### Independent Tribunal Runs

`SAME_MODEL` and `MIXED_MODELS` fail independently. A valid result from one run remains available even if the other run fails. A Case does not require both runs to succeed in order to preserve a valid result from one run.

### Audit and accounting for retries

Every actual API attempt is a separate auditable Model Call. Retries are not hidden. All attempts, including failed attempts that consumed billable usage, contribute to agent, stage, Tribunal Run, and Case totals. Missing OpenRouter usage/cost is stored as unknown/null, not zero.

### Timeout

The initial MVP timeout is **90 seconds per individual API attempt**, not one timeout for the entire advocate or judge stage. It may become configurable later if measured behavior justifies it.

### Recovery versus rerun

There is no unrestricted rerun of a completed or active Tribunal Run. A durable `FAILED` Run alone exposes Resume: one atomic claim starts a new recovery cycle for unresolved seats while retaining every successful seat, prior attempt, and cost record. A fresh complete hearing still requires the homepage launch, which creates a new Case and two new Runs.

## Project structure (foundation)

```text
app/                 # Next.js UI and route handlers
components/          # UI components
lib/
  charge-sheet/      # Canonical metadata; legacy validators are not wired to HTTP/UI
  cases/             # Create/retrieve Case records and their two Tribunal Runs
  model-calls/       # Persist/retrieve individual AI attempt audit rows
  rate-limit/        # PostgreSQL-backed public execution cost guard
  tribunal/          # Reusable Tribunal engine
  ai/
    profiles/        # Instructor hard-coded profiles
    contracts/       # Central advocate/judge response contracts
    prompts/         # Provider-agnostic runtime prompt builders
    configurations/  # Run kinds and model assignment config
  db/                # PostgreSQL access and migration runner
supabase/migrations/ # Append-only SQL migrations
fixtures/charge-sheets/ # Server-owned canonical T-001 record
docs/                # Framing, architecture, specification
docs/reference/      # Instructor source dossier (provenance only)
```

## Post-MVP / future work

The following are intentionally out of the completed MVP:

- Authentication and access control
- Browsable Case listing/search (the homepage five-item recent list is an MVP convenience, not this)
- Asynchronous or background execution if host limits later require it
- Privacy/retention policy hardening for persisted charge-sheet text
- Replacing volatile or free model endpoints (catalog revalidation remains operational work)
- Richer observability
- Manual rerun or versioned re-execution of an existing Tribunal Run
- A recorded generic Markdown charge-sheet structural grammar (T-001 remains the canonical example, not a parser contract)

Settled for the MVP:

- Advocate and judge response-contract logical shapes
- Runtime prompt layer composition and provider-agnostic builders (`lib/ai/prompts/`)
- Zod as the runtime validation library under `lib/ai/contracts/`
- Retry/failure policy (this document)
- Concrete OpenRouter model assignment (`lib/ai/configurations/`; rationale in [`docs/model-selection.md`](model-selection.md))
- Concrete deployment topology ([`docs/deployment.md`](deployment.md): Render Free Web Service + Supabase transaction pooler + OpenRouter)
