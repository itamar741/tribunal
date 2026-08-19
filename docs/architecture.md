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
- The `.md` file is structured input, not arbitrary free-form Markdown. The exact structural contract is not yet recorded in the repository and must be supplied/recorded before structural parsing is implemented.
- Until that contract is recorded, validated Markdown text is stored unchanged.
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
- Structural parsing of the charge sheet is deferred until the exact structural contract is recorded.

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

Model assignment is configuration, not branching buried inside orchestration logic.

### Why configuration-based assignment vs hard-coded branching

Hard-coded `if (run === "SAME_MODEL")` paths multiply over time and hide the real difference (which model each agent uses). Configuration keeps the engine generic and makes assignments explicit and reviewable.

## Stages inside each Tribunal run

1. **Advocate stage** — four advocates run **in parallel**:
   - two defense advocates
   - two prosecution advocates
2. **Judge stage** — starts **only after** all four advocate outputs for that run are available; three judges then run **in parallel**.
3. **Majority calculation** — each run calculates its **own** majority verdict from that run’s three judge votes using this settled rule:
   - exactly three judges vote;
   - if at least two judges return `GUILTY`, the run majority verdict is `GUILTY`;
   - if at least two judges return `NOT_GUILTY`, the run majority verdict is `NOT_GUILTY`.
   - that majority is the **final verdict of the run**.
4. A Case therefore produces two final AI outputs: the `SAME_MODEL` majority verdict and the `MIXED_MODELS` majority verdict. Both are shown to the human reviewer. There is no human-recorded final verdict.

### Why parallel vs sequential execution

Advocates within a run do not depend on each other’s outputs, so they run in parallel to reduce latency. Judges depend on the full advocate set, so they wait for advocate completion, then run in parallel with each other. The two Tribunal runs are also parallel because they share the same charge sheet input and do not depend on each other.

## Hard-coded agent profiles and prompts

Instructor-provided **character/profiles** live under `lib/ai/profiles/` as **version-controlled application code**.

- Not user-editable
- Server-side only
- The instructor supplies character/profile content only, not role prompts
- Runtime prompts are constructed by the application and combine, as appropriate: role instructions, instructor-provided character/profile, structured charge-sheet content, previous-stage outputs, and exact response-format instructions
- Concrete profile contents: **unresolved** (not yet supplied)

## Centralized response contracts

Under `lib/ai/contracts/`:

- One exact response schema shared by **all** advocates (defense or prosecution, any model)
- One exact response schema shared by **all** judges (any profile or model)

These contracts are **our design responsibility**, not instructor input. They must be designed and made runtime-validatable before the first real AI call. Orchestration must **not** depend on parsing free-form prose.

Exact schema fields: **unresolved pending our design** — do not implement them until that design step.

AI failures and malformed responses must never silently become valid verdicts.

## Persistence and AI gateway

### PostgreSQL / Supabase

- SQL database for the application
- PostgreSQL for the deployed application
- Supabase is the preferred PostgreSQL provider
- Server-side access uses the `pg` driver and `DATABASE_URL`; no ORM
- Schema changes are version-controlled SQL files under `supabase/migrations/`
- Apply pending migrations with `npm run migrate`

The initial Case table is:

```text
cases
  id uuid (database-generated)
  original_file_name text
  charge_sheet_text text
  created_at timestamptz
```

### Why SQL vs NoSQL

The domain is relational (case → runs → agent outputs → model-call audits) with clear integrity needs. SQL fits structured joins, constraints, and auditability better than a document store for this MVP.

### Why database vs CSV

CSV is fine for ad-hoc exports but weak for concurrent writes, relational integrity, queryability, and audit trails across cases and model calls. A database is the system of record.

### Why PostgreSQL vs SQLite

SQLite can work for local experiments, but the settled deployment target is a hosted SQL database. PostgreSQL (via Supabase) matches that target and avoids a later storage rewrite.

### OpenRouter

OpenRouter is the AI gateway for model calls and the **authoritative source** for token usage and cost on every actual API attempt. Integration is **not** implemented in this phase. Do not maintain a separate model-pricing table unless later evidence shows OpenRouter cannot provide the required information.

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

OpenRouter-reported usage and cost are the source of truth for each attempt. The physical audit schema remains to be implemented.

## Execution mechanism

Tribunal execution remains a modular server-side application service independent of browser transport.

- Start with the simplest Next.js-compatible mechanism that can reliably execute the two parallel Tribunal Runs.
- Do not pre-commit the MVP to a queue, job system, or additional durable background infrastructure.
- Measure the selected deployment/runtime limits against real execution duration and interruption behavior.
- Introduce additional background/job infrastructure only if those measurements show the simpler path cannot complete reliably.
- Regardless of transport, idempotency and per-attempt auditing must prevent accidental duplicate calls and hidden cost.

## Failure handling boundary

- Invalid uploads, processing failures, timeouts, malformed responses, and partial run failures must surface as failures.
- They must **not** be coerced into successful majority verdicts.
- Retry policy: **internal open decision** (our design; must be settled before multi-agent execution; must avoid uncontrolled extra calls/cost).

## Project structure (foundation)

```text
app/                 # Next.js UI and route handlers (upload transport)
components/          # UI components
lib/
  charge-sheet/      # Validate/read .md → validated text (no MD parse)
  cases/             # Create/retrieve Case records and their two Tribunal Runs
  tribunal/          # Reusable Tribunal engine (later)
  ai/
    profiles/        # Instructor hard-coded profiles (later)
    contracts/       # Central advocate/judge response contracts
    configurations/  # Run kinds and model assignment config
  db/                # PostgreSQL access and migration runner
supabase/migrations/ # Append-only SQL migrations
docs/                # Framing, architecture, specification
```

## Unresolved decisions

Internal design still required:

- Exact advocate and judge response-contract fields
- Concrete OpenRouter model IDs for both run configurations
- Runtime prompt composition details
- Retry/attempt policy (must be settled before multi-agent execution)
- Past-case listing/authentication/access policy beyond retrieval by known Case ID
- Retention/privacy rules for persisted validated Markdown text
- Concrete deployment configuration

Waiting on instructor input or an explicit recorded contract:

- Character/profile content for each of the seven agents
- Exact Markdown charge-sheet structural contract (structure is defined, but not yet recorded here)
