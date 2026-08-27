# AI Tribunal MVP Implementation Plan

## Purpose

This plan describes the dependency-ordered path from the repository’s current state to the completed MVP. It is a planning artifact and does not authorize implementation by itself.

## Current repository state

Completed and verified:

- Next.js 16 modular-monolith foundation.
- `.md` charge sheet as the only user input.
- Client convenience validation and server-authoritative validation.
- Case-insensitive `.md` extension check, 1 MB size limit, strict UTF-8 read, and empty/whitespace rejection.
- Upload transport separated from charge-sheet validation/read.
- Every valid upload creates a unique Case; identical uploads create separate Cases; original file name and validated Markdown text are stored; original file/blob is not.
- Version-controlled SQL migrations under `supabase/migrations/`, applied with `npm run migrate` via server-side `pg`.
- Case retrieval by unique ID without returning full Markdown text to the browser.
- Every Case has exactly two Tribunal Run records (`SAME_MODEL` and `MIXED_MODELS`), created atomically with the Case and backfilled for existing Cases.
- Newly created runs are `PENDING` (no AI execution yet). Unique `(case_id, run_type)` is enforced in PostgreSQL.
- Tribunal Run lifecycle can persist `PENDING`, `RUNNING`, `SUCCEEDED`, and `FAILED`, including nullable `final_verdict`, `started_at`, `completed_at`, and `failure_reason`. A failed run cannot store a fabricated verdict.
- Individual Model Call audit rows persist on `model_calls` (one row per actual API attempt) with Case/run association, stage, agent role, attempt, model, status, nullable usage/cost/duration/provider/error fields, and validated JSON only. Duplicate `(run_id, agent_role, attempt)` is rejected; `case_id` must match the run’s Case.
- Focused upload-validation, Case-persistence, Tribunal Run, lifecycle, and Model Call tests; `test`, `lint`, `typecheck`, `build`, and `migrate` scripts.
- Settled `SAME_MODEL` and `MIXED_MODELS` run-kind constants.
- Supabase PostgreSQL TLS with official CA and certificate verification enabled (`certs/prod-ca-2021.crt`).
- Settled advocate and judge response-contract logical shapes and runtime prompt-composition design (`docs/architecture.md`).
- Runtime Zod validators under `lib/ai/contracts/` for advocate and judge responses (trimmed non-empty strings; extra fields forbidden).
- Settled retry/failure policy (`docs/architecture.md`): at most two attempts per agent; independent run failure; no majority from incomplete stages. Bounded runtime retry for one representative is implemented under `lib/ai/execution/`.
- Canonical instructor Case T-001 charge sheet stored as a project fixture/reference (`fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md`). T-001 is the canonical example, not a generic Markdown grammar.
- Instructor source dossier preserved as documentation/provenance at `docs/reference/tribunal-running-project-info-package.txt`. Runtime code does not import or read that file.
- Seven instructor profiles version-controlled under `lib/ai/profiles/`: Jon Snow and Tyrion Lannister (defense), Daenerys Targaryen and Grey Worm (prosecution), and Aaron Barak, Menachem Elon, and Meir Shamgar (judges). Representative seats assign a procedural side only; the model reasons in character. Judge profiles are judicial-method simulations.
- Provider-agnostic runtime prompt builders under `lib/ai/prompts/`: one representative builder and one judge builder. Trusted instructions/configuration are separated from untrusted charge-sheet and advocate content. Model IDs are not part of prompt construction.
- Concrete OpenRouter model assignment under `lib/ai/configurations/`: one `SAME_MODEL` ID for all seven roles, seven distinct `MIXED_MODELS` IDs, and a standby pool that is not an automatic fallback. Canonical rationale: `docs/model-selection.md`.
- One-agent OpenRouter vertical slice: representative prompt → one Chat Completions attempt → JSON parse → Advocate Zod validation → one `model_calls` audit row.
- Bounded two-attempt representative retry: centralized retryability, injectable delay / capped Retry-After, same identity on retry, separate audit rows. Does not complete or fail the Tribunal Run.
- Parallel Advocate stage under `lib/tribunal`: four representatives start concurrently, each with its own bounded retry. The stage succeeds only with four valid Advocate responses. One permanent failure marks that Tribunal Run `FAILED` and blocks judges.
- Parallel Judge stage under `lib/tribunal`: three judges start concurrently, each with its own bounded retry. All three valid Judge responses are required. Majority consumes only validated verdicts. A 2-of-3 majority marks the Run `SUCCEEDED`. Permanent Judge failure marks `FAILED` with no majority.
- Single-run coordinator `executeTribunalRun`: Advocate stage, then Judge stage only after four valid Advocate responses. Reuses existing stage boundaries. A PENDING Run is claimed once by the atomic `markRunning` transition; non-PENDING or duplicate starts make no model requests. Dual-run orchestration and aggregate accounting are not implemented.

Not implemented:

- Simultaneous SAME_MODEL + MIXED_MODELS execution and Case-level orchestration.
- Token/cost aggregation services.
- Tribunal result UI, past-Case listing, and deployment.

## Recommended phase sequence

1. Persist and retrieve a unique Case for every accepted upload.
2. Add two durable Tribunal Run records and lifecycle state per Case.
3. Implement runtime contracts, encode profiles, build prompts, and complete model configuration.
4. Prove one audited OpenRouter advocate call end-to-end.
5. Add the four-advocate parallel stage to the reusable engine.
6. Add the three-judge stage and settled majority calculation.
7. Coordinate both runs, bounded attempts, durable results, and complete accounting.
8. Connect execution through the simplest reliable Next.js-compatible mechanism.
9. Present both AI run majority verdicts and accounting summaries.
10. Complete durable past-Case retrieval.
11. Deploy with production PostgreSQL/OpenRouter configuration.
12. Perform final end-to-end MVP verification.

## Phase 1 — Case persistence vertical slice

### Goal

Turn each valid upload into one durable Case with a unique ID, original file name, validated Markdown text, and creation timestamp, then retrieve it by ID.

### Why this phase comes now

Every run, call attempt, result, and retrieval path needs a stable Case identity before AI work begins.

### Scope

- Select a minimal PostgreSQL access and migration approach compatible with this Next.js project.
- Implement the existing `lib/db` server-only boundary.
- Add the initial Case migration.
- Persist validated text, not the original uploaded file/blob.
- Persist the original file name as Case metadata.
- Generate a new unique Case ID for every successful upload.
- Perform no hash/content lookup or deduplication.
- Return the new Case ID after a valid upload.
- Add retrieval by unique Case ID.
- Add creation, retrieval, not-found, invalid-upload, and duplicate-content integration tests.

### Explicitly out of scope

Tribunal Run rows, AI calls, OpenRouter, response contracts, profiles, structural parsing, results, and retries.

### Expected repository impact

The existing upload route, `lib/charge-sheet`, `lib/db`, a focused Case domain/repository boundary, migrations, and database test setup.

### Verification gate

- Every valid upload creates one new Case.
- Two identical uploads create two records with different IDs.
- Both records retain the submitted original file name and validated text.
- Invalid uploads create no Case.
- No original file/blob is written to filesystem or database.
- A known ID retrieves the Case; an unknown ID returns an explicit not-found result.
- Migration, tests, lint, typecheck, and build pass.

### Dependencies / blockers

- A PostgreSQL development/test instance (Supabase Database URI or local PostgreSQL).
- `DATABASE_URL` in a server-only env file; never committed.

Chosen for this phase: version-controlled SQL under `supabase/migrations/`, `pg` driver, `npm run migrate`. Validated Markdown text is persisted; original file/blob is not.

## Phase 2 — Tribunal Run persistence and lifecycle

### Goal

Give each Case exactly two durable run records—`SAME_MODEL` and `MIXED_MODELS`—with explicit lifecycle state.

### Why this phase comes now

Every model attempt must reference both a Case and Tribunal Run, so stable run identities must exist before OpenRouter calls.

### Scope

- Add a migration for Tribunal Runs linked to Cases.
- Enforce one run of each kind per Case.
- Define minimal pending/running/succeeded/failed lifecycle states (expanded in Phase 4A).
- Create both run records transactionally with Case initialization.
- Retrieve a Case with its two run IDs, kinds, and statuses.
- Continue schema evolution through append-only migrations.

### Explicitly out of scope

AI calls, agent outputs, majority calculation, retries, and results UI.

### Expected repository impact

Database migrations/repositories, Case application services, and existing `lib/ai/configurations` run kinds.

### Verification gate

- Every Case has exactly two runs, one of each kind.
- Constraints prevent a duplicate run kind for one Case.
- Initialization failure leaves no partial Case/run graph.
- Retrieval exposes safe run metadata without server configuration.

### Dependencies / blockers

Phase 1. Exact model assignments are not needed yet.

## Phase 3 — Runtime contracts, profiles, prompts, and model configuration

### Goal

Implement the settled runtime-validatable AI response contracts, encode instructor-provided character/profiles, build layered runtime prompts, and complete configuration-only model assignment.

### Why this phase comes now

No real AI call or orchestration should proceed without runtime validators matching the settled logical contracts. The shapes and prompt architecture are documented; this phase implements them.

### Scope

- Completed (Phase 3A): runtime validators under `lib/ai/contracts/` matching the advocate and judge logical shapes in `docs/architecture.md`.
- Keep TypeScript types aligned with those runtime validators.
- Completed (Phase 3B): encode instructor-provided character/profiles under `lib/ai/profiles` as hard-coded, server-only, version-controlled application code.
- Completed (Phase 3B): stable identities for two defense advocates, two prosecution advocates, and three judges, linked to instructor profile text without model IDs.
- Completed (Phase 3B): canonical instructor Case T-001 stored as a project fixture/reference. The dossier is treated as the canonical example, not a complete generic Markdown grammar.
- Completed (Phase 3C): runtime prompts assembled in application code from the settled layer model (advocate and judge compositions in `docs/architecture.md`). Trusted instructions are separated from untrusted charge-sheet/advocate content. Builders are provider-agnostic and do not include model IDs.
- Completed (Phase 3D): concrete OpenRouter models chosen ourselves: one model for all seven agents in `SAME_MODEL`; seven different models in `MIXED_MODELS`; standby IDs recorded but not used as automatic fallbacks. Rationale: `docs/model-selection.md`.
- Keep model assignment in configuration, not orchestration branches.
- Test schema acceptance/rejection with valid and invalid examples.
- Test that `SAME_MODEL` assigns one model to all seven agents and `MIXED_MODELS` assigns seven distinct models.

### Explicitly out of scope

OpenRouter networking, orchestration, database output writes, UI, and inventing the charge-sheet structural contract if it is not yet recorded.

### Expected repository impact

Existing `lib/ai/contracts`, `lib/ai/profiles`, `lib/ai/prompts`, `lib/ai/configurations`, the T-001 fixture under `fixtures/charge-sheets/`, and focused tests.

### Verification gate

- Runtime validators exist; valid examples pass and malformed/missing/extra fields fail.
- Every advocate uses the same advocate contract and every judge uses the same judge contract.
- Seven instructor profiles are encoded once per seat, with no model IDs and with the representative simulation rule preserved.
- Prompts are assembled from explicit layers, not seven unrelated static files.
- Configuration, not orchestration branching, accounts for run differences.
- Profiles, prompts, and configuration remain absent from client bundles.

### Dependencies / blockers

- Prompt builders are in place under `lib/ai/prompts/`. They consume raw validated Markdown; do not invent a generic charge-sheet grammar from T-001.
- Model selection is recorded in `lib/ai/configurations/` with rationale in `docs/model-selection.md`.

## Phase 4A — Model-call audit persistence and Tribunal Run lifecycle

### Goal

Add durable persistence for Tribunal Run lifecycle and every individual AI API attempt as a separate auditable Model Call, without making any AI calls.

### Why this phase comes now

OpenRouter execution and orchestration must write to stable run-state and attempt-audit records. Those tables and repositories are implemented here so later execution code does not invent schema or generic run updates.

### Scope

- Completed: expand `tribunal_runs.status` to `PENDING`, `RUNNING`, `SUCCEEDED`, and `FAILED`.
- Completed: nullable `final_verdict`, `started_at`, `completed_at`, and `failure_reason`, with `final_verdict` limited to `JUSTIFIED` / `NOT_JUSTIFIED` and no fabricated verdict on failed runs.
- Completed: `model_calls` table and `pg` repository for insert plus retrieval by Tribunal Run and Case.
- Completed: unique `(run_id, agent_role, attempt)` and a composite foreign key so `case_id` cannot disagree with the Case belonging to `run_id`.
- Completed: explicit run-lifecycle operations (`markRunning`, `markSucceeded`, `markFailed`).
- Completed: focused schema, Model Call, and lifecycle persistence tests.

### Explicitly out of scope

OpenRouter requests, API keys, concrete model IDs, instructor profiles, prompt builders, retries, advocate/judge execution, majority calculation, dual-run orchestration, token/cost aggregation services, and UI/API result changes.

### Expected repository impact

Append-only migrations, `lib/cases` run-lifecycle types/repository, and `lib/model-calls`.

### Verification gate

- Existing Cases and PENDING runs survive the lifecycle migration.
- Invalid run status and invalid final verdict are rejected.
- Successful and failed Model Calls persist; unknown usage/cost remains null; validated JSON round-trips.
- Invalid stage, agent role, attempt, foreign keys, duplicate attempts, and mismatched `case_id` / `run_id` are rejected.
- PENDING → RUNNING, success with verdict, and failure with reason (no verdict) persist.

### Dependencies / blockers

Phases 2 and 3A. No OpenRouter credentials are required.

## Phase 4 — Audited OpenRouter one-agent vertical slice

### Goal

Execute one real advocate attempt through a server-only OpenRouter adapter, validate its response, and persist a complete model-call audit record using the Phase 4A schema.

### Why this phase comes now

One controlled call isolates gateway authentication, structured output, runtime validation, token/cost accounting, and failure recording before concurrency multiplies cost. The audit table and run-lifecycle operations already exist.

### Scope

- Completed (Phase 4B): add a narrow server-only OpenRouter adapter.
- Treat every actual API attempt as a separate immutable source-of-truth record (write to the existing `model_calls` table).
- Record at least:
  - Case association;
  - Tribunal Run association;
  - stage (`ADVOCATES` or `JUDGES`);
  - agent role;
  - attempt number;
  - model;
  - input, output, and total tokens;
  - input, output, and total cost;
  - duration;
  - success/failure.
- Preserve failed attempts that incurred usage/cost.
- Record OpenRouter-reported usage/cost for every actual API attempt; do not maintain a separate pricing table unless OpenRouter cannot provide the required information.
- Validate the response through the central advocate contract.
- Persist validated structured output separately from audit metadata.
- Completed (Phase 4B): begin with no hidden automatic retry; one invocation means one audited attempt until retry policy is implemented.
- Completed (Phase 4B): add fake-provider tests and a controlled live smoke-test procedure (`npm run verify:openrouter-slice`).
- Completed (Phase 4C): implement bounded two-attempt retry around one representative (`executeRepresentativeWithRetry`). Live check: `npm run verify:openrouter-retry`.

### Explicitly out of scope

Four-agent concurrency, judges, majority calculation, dual-run coordination, and browser AI controls.

### Expected repository impact

`lib/ai`, the existing model-call/run-lifecycle repositories, and a server-only one-agent application service or test harness.

### Verification gate

- A valid call creates one complete successful attempt record and one validated output.
- A timeout, provider error, or malformed response creates a failed attempt record and no valid output.
- Failed attempts retain any reported usage/cost.
- Token arithmetic and cost arithmetic reconcile within the attempt.
- Agent-level totals include all that agent’s attempts.
- No key, prompt, profile, or full charge-sheet text reaches browser payloads/logs.

### Dependencies / blockers

Phases 2, 3, and 4A, OpenRouter credentials, and designed advocate contract plus at least one configured advocate profile/model. Usage/cost values come from OpenRouter. The audit schema and run-lifecycle writes already exist.

## Phase 5 — Reusable engine: advocate stage

### Goal

Use one reusable Tribunal engine to execute exactly four advocates in parallel for one run and persist four validated outputs.

### Why this phase comes now

The one-call boundary is proven; the advocate stage is the smallest independent concurrency unit.

### Scope

- Completed: reusable Advocate-stage entry point under `lib/tribunal`.
- Completed: two defense and two prosecution advocates start concurrently.
- Completed: each agent receives the same charge-sheet text plus its configured profile, constructed prompt, and model via the existing representative executor.
- Completed: validate every response through the single advocate contract.
- Completed: persist outputs and individual attempt records on `model_calls`.
- Deferred: per-agent and advocate-stage token/cost aggregation services.
- Completed: if any advocate lacks a valid result after allowed attempts, do not start judges and mark the run failed.
- Completed: concurrency and fail-closed tests with deterministic fakes.

### Explicitly out of scope

Judges, majority calculation, second-run coordination, and results UI.

### Expected repository impact

`lib/tribunal`, AI configuration/call boundaries, run lifecycle, output persistence, accounting queries, and tests.

### Verification gate

- Exactly four configured advocate calls overlap in time.
- All four outputs satisfy the same advocate contract.
- Every real attempt has a distinct complete audit row.
- Agent totals and the advocate-stage total equal sums from those rows.
- Any failed/malformed advocate prevents the judge stage and a successful verdict.

### Dependencies / blockers

Phase 4, designed advocate contract, advocate profiles/configurations, constructed prompts, and the settled retry/attempt policy in `docs/architecture.md`.

## Phase 6 — Reusable engine: judges and majority

### Goal

Complete one Tribunal Run by waiting for four advocates, running exactly three judges in parallel, and persisting the settled majority.

### Why this phase comes now

Judges depend on the complete advocate set, and majority calculation must consume only validated judge votes.

### Scope

- Completed: Judge attempt and bounded retry reuse the existing transport and `classifyRetry()`.
- Completed: three configured judges start concurrently.
- Completed: validate every response through the one judge contract.
- Completed: pure two-of-three majority function from validated verdicts only.
- Completed: persist judge outputs and a majority only after three valid votes; mark the Run `SUCCEEDED`.
- Deferred: per-judge, judge-stage, and complete-run token/cost aggregation services.
- Completed: fail closed when any required judge result remains invalid/missing; mark the Run `FAILED` with no majority.
- Completed: vote-combination, concurrency, and fail-closed tests. Accounting reconciliation is deferred.

### Explicitly out of scope

Two-run coordination, Case totals, and results UI.

### Expected repository impact

Reusable engine, judge contract/profile/configuration, output/result persistence, accounting queries, and tests.

### Verification gate

- No judge starts before four valid advocate outputs exist.
- Exactly three judge calls overlap.
- All eight possible three-vote combinations yield the settled majority.
- Missing/malformed judge output yields no valid majority.
- Per-judge, judge-stage, and complete run totals exactly reconcile to individual attempt rows.

### Dependencies / blockers

Phase 5 plus designed judge contract, judge profiles, and constructed judge prompts.

## Single-run orchestration

Completed: `executeTribunalRun` sequences the existing Advocate and Judge stages for one PENDING Tribunal Run. Judges start only after four valid Advocate responses. The coordinator does not duplicate prompt construction, model resolution, retry, audit, majority, or Run lifecycle writes. Dual-run and Case-level orchestration remain later.

## Phase 7 — Dual-run coordination, retries, durable results, and Case totals

### Goal

Execute both configured runs through the same engine in parallel, persist independent outcomes, enforce bounded attempts, and calculate Case-wide usage/cost.

### Why this phase comes now

Single-run behavior and accounting are proven before coordinating fourteen baseline calls plus retries.

### Scope

- Add a Case execution service that invokes the same engine twice with configuration data.
- Start `SAME_MODEL` and `MIXED_MODELS` concurrently.
- Persist stage progress, outputs, majorities, failures, and timestamps incrementally.
- Use the existing per-agent bounded retry primitive (`lib/ai/execution/`) when coordinating both runs.
- Record every retry as another real attempt with the next attempt number.
- Preserve failed attempts and their usage/cost.
- Protect against accidental duplicate execution/idempotency failures.
- Keep run outcomes independent; one may succeed while the other fails.
- Derive complete Case token/cost totals across both runs from individual attempt records.
- Add concurrency, partial-failure, duplicate-trigger, retry-limit, and accounting tests.

### Explicitly out of scope

Results presentation, past-Case UI, authentication, and user-selectable models.

### Expected repository impact

Case execution service, engine, run/output/audit repositories, accounting queries, lifecycle migrations, and tests.

### Verification gate

- Both run kinds overlap and use the same engine implementation.
- `SAME_MODEL` uses one model; `MIXED_MODELS` uses seven distinct configured models.
- Partial failure remains explicit and never fabricates a verdict.
- Repeated triggers cannot exceed the approved attempt policy.
- Agent, stage, run, and Case totals reconcile exactly to individual attempt rows, including failed/retried calls.

### Dependencies / blockers

Phase 6 and the settled retry/attempt policy in `docs/architecture.md`.

## Phase 8 — Execution trigger and result-query API

### Goal

Connect Case creation to reliable Tribunal execution and expose server-authoritative status/results by Case ID.

### Why this phase comes now

The modular execution service is proven before transport/runtime choices are introduced.

### Scope

- Keep Tribunal execution as a modular server-side application service.
- Start with the simplest Next.js-compatible execution mechanism.
- Trigger exactly one pair of runs per Case with idempotency protection.
- Expose Case/run status and result retrieval by unique Case ID.
- Define structured pending/running/partial-failure/complete states.
- Measure real execution time and deployment interruption behavior.
- Introduce queue/job/background infrastructure only if measurements show the simple path cannot complete reliably.

### Explicitly out of scope

Pre-committing to queues/workers, unrelated backend services, progress streaming, and UI polish.

### Expected repository impact

Next.js server routes/modules, Case execution service, status/result DTOs, and repositories. Extra job infrastructure is conditional, not assumed.

### Verification gate

- Upload creates a Case and initiates its two runs exactly once.
- Repeated requests do not create uncontrolled model attempts.
- A Case can be retrieved by ID without rerunning it.
- Completed/failed results and accounting summaries are returned without secrets.
- Measured runtime evidence supports the simple mechanism, or documents why minimal additional infrastructure is required.

### Dependencies / blockers

Phase 7. Concrete host limits are measured here rather than assumed beforehand.

## Phase 9 — Two-run results UI

### Goal

Show both independent AI Tribunal results and their usage/cost summaries to the reviewer.

### Why this phase comes now

The UI should consume stable persisted status/result/accounting contracts rather than infer transient execution state.

### Scope

- Navigate from upload success to the new Case.
- Show each run’s status, failures, validated outputs, and majority verdict (the run’s final verdict) separately.
- Show model-call/accounting summaries derived from source records:
  - per agent including all attempts;
  - advocate and judge stage per run;
  - complete totals per run;
  - complete Case totals.
- Poll/refresh the Phase 8 retrieval boundary until terminal state.
- Add component/route/accessibility tests.

### Explicitly out of scope

Editable profiles, model selectors, prompts, and a browsable past-Case list unless that product decision is already made.

### Expected repository impact

Existing `app`/`components`, result DTOs, and accounting query/presentation code; no orchestration in client components.

### Verification gate

- Both run outcomes are correctly labeled and distinguishable.
- Failed runs are displayed as failures, not verdicts.
- Accounting summaries reconcile with persisted individual calls.
- Refresh/reopen reconstructs the same Case without new model attempts.
- No server-only configuration leaks.

### Dependencies / blockers

Phase 8 and the designed response contracts.

## Phase 10 — Durable past-Case retrieval

### Goal

Ensure a persisted Case and its results can be reopened by unique Case ID without rerunning the Tribunal.

### Why this phase comes now

Case detail, both AI run majority verdicts, and accounting are stable and can be reconstructed from persistence.

### Scope

- Finalize the unique-ID Case detail retrieval path.
- Return persisted run results, accounting summaries, failures, and both run majority verdicts.
- Reuse the Case results view.
- A browsable list, authentication, and public/private access remain internal product decisions; implement a list only if that decision is made.

### Explicitly out of scope

Full-text search, exports, analytics, admin tooling, bulk actions, and a public global list unless the access model explicitly allows it.

### Expected repository impact

Case query repository, Next.js Case detail route/page, and optionally a minimal list query/page.

### Verification gate

- A known Case ID reopens the persisted Case without new model calls.
- Identical uploads remain separate retrievable Cases with distinct IDs.
- Stored original file name, two runs, audits/totals, and both majority verdicts are correctly associated.
- Any list is bounded and exposes only approved metadata.

### Dependencies / blockers

Phase 9. Retrieval by known Case ID is settled. Browsable listing, authentication, and list metadata are internal product decisions.

## Phase 11 — Deployment and operational configuration

### Goal

Deploy the modular monolith with managed PostgreSQL (Supabase preferred), OpenRouter, migrations, and a measured reliable execution path.

### Why this phase comes now

Deployment validates the complete vertical product and provides real evidence about runtime limits.

### Scope

- Select the Next.js host and Supabase topology.
- Configure server-only secrets and document environment variables without values.
- Apply versioned migrations through a controlled release step.
- Deploy the simplest execution mechanism proven in Phase 8.
- Measure end-to-end duration, interruptions, database behavior, and OpenRouter egress.
- Add minimal Case/run/call-ID operational logging without sensitive content.
- Introduce additional job/background infrastructure only if measurements prove necessary.
- Document rollback and migration recovery.

### Explicitly out of scope

Speculative queues, multi-region systems, autoscaling architecture, admin tooling, and analytics platforms.

### Expected repository impact

Minimal deployment/provider configuration and operational documentation; the application remains one Next.js modular monolith.

### Verification gate

- Production-like upload creates a unique Case and exactly two runs.
- Secrets do not appear in client bundles, logs, or source control.
- Migrations apply cleanly to a fresh PostgreSQL database.
- A controlled Case completes or fails visibly with complete attempt audits and reconciled totals.
- Measured evidence confirms the simple execution path or justifies the smallest necessary addition.

### Dependencies / blockers

Provider accounts/credentials, concrete deployment topology, data privacy/access decisions, and cost controls.

## Phase 12 — Final MVP verification

### Goal

Prove all settled MVP behavior end-to-end without adding features.

### Why this phase comes now

All layers and deployment assumptions must exist before acceptance.

### Scope

- Run unit, integration, migration, contract, orchestration, UI, and controlled end-to-end tests.
- Exercise invalid upload, duplicate upload, malformed response, timeout, partial failure, retry limit, and interruption scenarios.
- Reconcile all token/cost aggregation levels with individual OpenRouter-backed call records.
- Verify Case retrieval by unique ID without rerunning the Tribunal.
- Check client/server secrecy boundaries.
- Reconcile implementation with the specification, architecture, and `AGENTS.md`.

### Explicitly out of scope

New features, speculative optimization, and unrelated cleanup.

### Expected repository impact

Focused fixtures/harnesses and completion documentation only; failures are fixed in their owning phase/module.

### Verification gate

The MVP Completion Gate below passes in a production-like environment, along with `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

### Dependencies / blockers

Phases 1–11, runtime contract implementation, encoded instructor profiles, and provider credentials.

## Open Decisions

Internal design still required:

- Past-Case public-list/authentication/access policy and safe list metadata; retrieval by known unique ID is settled
- Retention/privacy rules for persisted validated Markdown text
- Concrete deployment topology

Settled:

- Advocate and judge response-contract logical shapes (`docs/architecture.md`)
- Runtime prompt layer composition and provider-agnostic builders (`lib/ai/prompts/`, Phase 3C)
- Zod runtime validators under `lib/ai/contracts/` (Phase 3A)
- Retry/failure policy (`docs/architecture.md`; single-representative runtime retry is implemented)
- Concrete OpenRouter model assignment (`lib/ai/configurations/`, Phase 3D; rationale in `docs/model-selection.md`)

Waiting on an explicit recorded contract:

- Exact Markdown charge-sheet structural contract (T-001 is the canonical example fixture; it is not a generic grammar)

## Instructor Dependencies

- The exact Markdown charge-sheet structural contract, recorded before structural parsing is implemented. Profile acquisition is complete.

## MVP Completion Gate

The MVP is complete only when all of the following work end-to-end:

- A valid `.md` upload creates a new durable Case with a unique ID and stored original file name; identical content creates another Case; invalid uploads create none; original files/blobs are not stored.
- A persisted Case can be retrieved by unique Case ID without rerunning model calls.
- Every Case has one `SAME_MODEL` and one `MIXED_MODELS` run, both using one reusable engine and able to execute concurrently.
- Each run executes four advocates concurrently, waits for four valid outputs, then executes exactly three judges concurrently.
- All advocate/judge outputs pass their centralized runtime contracts.
- Three valid judge votes produce the settled two-of-three majority; that majority is the run’s final verdict; incomplete/malformed stages produce no valid verdict.
- A Case’s two final AI outputs are the `SAME_MODEL` majority and the `MIXED_MODELS` majority.
- Every actual API attempt, including retries and failed attempts with usage, has an immutable record containing Case, run, stage, role, attempt, model, input/output/total tokens, input/output/total cost, duration, and outcome, using OpenRouter-reported usage/cost.
- Totals derived from those records reconcile per agent, per advocate/judge stage, per Tribunal Run, and across the Case.
- Bounded attempts/idempotency prevent accidental duplicate calls and uncontrolled cost; partial failures remain visible.
- The browser presents both AI run majority verdicts and accounting summaries after refresh/reopen.
- Past Case detail can be reopened by unique ID without rerunning the Tribunal.
- The simplest Next.js-compatible execution mechanism is used unless measured deployment limits justify additional job/background infrastructure.
- Production migration, recovery, security-boundary, test, lint, typecheck, and build checks pass.

## Deferred / Non-MVP Work

Authentication unless required by the final access model, admin panels, editable profiles/prompts, client model selectors, multi-round debates, PDF/DOCX/TXT/image/OCR input, inventing an unrecorded charge-sheet structure, a human-recorded final verdict or approval decision, public global Case listing without an approved access model, analytics dashboards, full-text history search, exports, and scaling infrastructure without measured need.
