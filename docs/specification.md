# Specification — AI Tribunal (initial)

Observable behavior for the product. Implementation details belong in architecture docs and code.

## 1. Goal and reason

**Goal:** Let a human reviewer submit one charge sheet file and obtain two comparable Tribunal analyses of that charge sheet: one using a single shared model for all agents, and one using a distinct model per agent.

**Reason:** Holding the tribunal procedure constant while varying only model assignment makes it possible to review how model choice affects advocacy, judging, and majority outcomes for the same charge sheet.

## 2. Testable success criteria

When the MVP is complete, the following must be observable:

1. The application presents a path to submit a charge sheet file as the only user-provided input.
2. Only Markdown `.md` charge sheets are accepted (case-insensitive extension); other formats are rejected visibly.
3. Every valid upload creates a new Case with a unique ID and stores the original file name.
4. Uploading identical content again creates another Case with another unique ID; the MVP does not deduplicate uploads.
5. A persisted Case can be retrieved by its unique ID without rerunning the Tribunal.
6. For each case, exactly two Tribunal runs execute: one `SAME_MODEL` and one `MIXED_MODELS`.
7. Both runs follow the same stage order: advocates complete before judges start; four advocates; then three judges; then a majority verdict for that run.
8. Within a run, the four advocates run concurrently; after they finish, the three judges run concurrently.
9. The two runs run concurrently with each other.
10. Every advocate output conforms to the single advocate response contract; non-conforming outputs are not treated as valid advocate results.
11. Every judge output conforms to the single judge response contract; non-conforming outputs are not treated as valid judge results.
12. Each run’s majority verdict follows the settled vote rule: exactly three judges vote; at least two `GUILTY` → run verdict `GUILTY`; at least two `NOT_GUILTY` → run verdict `NOT_GUILTY`.
13. That majority is the final verdict of the run. Incomplete or invalid judging never produces a valid verdict.
14. Both run majority verdicts are available to the human reviewer for the case as the two final AI outputs.
15. Every actual model API attempt—including retries and failed attempts that incurred usage—is recorded individually with Case, Tribunal Run, stage (`ADVOCATES` or `JUDGES`), agent role, attempt number, model, input/output/total tokens, input/output/total cost, duration, and success/failure, using OpenRouter-reported usage/cost.
16. Individual model-call records are the accounting source of truth, and the application can calculate totals per agent (including all attempts), per stage within a Tribunal Run, per complete Tribunal Run, and per Case across both runs.
17. Secrets, prompts, profiles, and model configuration are not exposed to the browser as editable client state.

**Charge-sheet Case persistence phase success:**

1. A reviewer can submit one `.md` charge sheet through the UI.
2. The server independently validates: file present, single file, `.md` extension (case-insensitive; not MIME-only), 1 MB or smaller, valid UTF-8 (malformed bytes rejected, not replaced), non-empty/non-whitespace content. Markdown is not parsed or rendered.
3. Every valid upload creates a new Case with a database-generated unique ID, stored original file name, stored validated Markdown text, and creation timestamp.
4. Identical content uploaded again creates another Case with another ID; there is no deduplication.
5. The original uploaded file/blob is not stored.
6. Valid uploads return a structured success response (status, Case ID, file name, character count) without echoing full file contents.
7. Invalid uploads return a structured error, create no Case, and are shown as failures in the UI.
8. A Case can be retrieved by unique ID without rerunning processing; unknown IDs are reported as not found; full Markdown text is not returned to the browser.
9. Focused validation and Case-persistence tests, lint, typecheck, and production build succeed.

**Tribunal Run persistence phase success:**

1. Every Case has exactly one `SAME_MODEL` run and exactly one `MIXED_MODELS` run.
2. Both runs have unique IDs and reference the owning Case.
3. Duplicate `(case_id, run_type)` combinations are rejected by the database.
4. Case and both initial Runs are created in one transaction; initialization failure leaves no partial Case/run graph.
5. Existing Cases are backfilled so they satisfy the same two-run invariant.
6. Newly created runs are stored as `PENDING` (AI execution has not started).
7. Case retrieval by ID includes both run IDs, kinds, and statuses without returning charge-sheet text, secrets, or model configuration.

## 3. Architectural guidance

- Use a Next.js modular monolith (UI + server in one project).
- Accept only `.md` charge sheets as user input (valid UTF-8, 1 MB maximum; do not parse/render Markdown in the upload phase); keep upload transport separate from validation/read (`lib/charge-sheet`) and from later Tribunal stages.
- Treat the Markdown charge sheet as structured input whose exact structural contract must be recorded before structural parsing is implemented; until then, persist the validated Markdown text unchanged.
- Persist validated Markdown text and the original file name on a new unique Case for every successful upload; do not store the original file/blob; do not deduplicate.
- Create exactly one `SAME_MODEL` and one `MIXED_MODELS` Tribunal Run with each Case, in the same transaction; enforce unique `(case_id, run_type)` in PostgreSQL.
- Use PostgreSQL (Supabase preferred) with version-controlled SQL migrations and server-side `pg` access; do not introduce an ORM without an explicit requirement.
- Keep file processing, AI calls, prompts, profiles, model configuration, validation, and cost calculation on the server.
- Use one reusable Tribunal engine; differentiate `SAME_MODEL` and `MIXED_MODELS` by configuration only.
- Choose concrete models ourselves: one model for all seven agents in `SAME_MODEL`, seven different models in `MIXED_MODELS`.
- Apply the settled majority-vote rule per run: three judges; ≥2 `GUILTY` → `GUILTY`; ≥2 `NOT_GUILTY` → `NOT_GUILTY`. That majority is the run’s final verdict.
- Treat each model API attempt as an immutable audit/accounting event; record OpenRouter-reported usage/cost; calculate aggregate totals from those records rather than unnecessarily duplicating stored totals.
- Preserve a modular Tribunal execution service and begin with the simplest reliable Next.js-compatible execution path; add queue/background-job infrastructure only if measured runtime/deployment limits require it.
- Keep instructor-provided character/profiles version-controlled and server-side; construct runtime prompts in application code.
- Keep advocate and judge response contracts centralized; the settled logical shapes are in `docs/architecture.md`; validate at runtime with the Zod schemas in `lib/ai/contracts/` before the first AI call; do not parse free-form prose for orchestration. Contract strings must be non-empty after trimming.
- Models may interpret and argue from supplied facts but must not introduce new case facts.
- Use PostgreSQL for the deployed application; Supabase is the preferred provider.
- Use OpenRouter as the AI gateway and as the authoritative source of token/cost information.
- Prefer failure visibility over silent fallback verdicts.

## 4. Validation approach

Validate against observable criteria:

- **Upload:** missing file, non-`.md` (including `.txt`), empty, whitespace-only, over 1 MB, and malformed UTF-8 charge sheets are rejected; valid `.md` creates a unique Case with structured success feedback.
- **Manual:** upload path is clear; both run majority verdicts are reviewable when implemented.
- **Contract:** advocate/judge responses fail closed when they do not match the settled central schemas in `docs/architecture.md`.
- **Run integrity:** a run without successful contracted judge outputs does not present a successful majority verdict.
- **Majority vote:** given three valid judge votes, the run verdict is `GUILTY` iff at least two are `GUILTY`, otherwise `NOT_GUILTY` when at least two are `NOT_GUILTY`. That verdict is the run’s final output.
- **Audit:** every actual attempt has the complete required Case/run/stage/agent/attempt/model/token/cost/duration/outcome fields; retries remain separate records; usage/cost come from OpenRouter.
- **Accounting:** sums derived from call records reconcile at agent, stage, run, and Case levels, including failed attempts that incurred usage.
- **Retrieval:** a persisted Case can be loaded by unique Case ID without creating new model calls.
- **Runs:** every Case has exactly two run records (`SAME_MODEL`, `MIXED_MODELS`); duplicate kinds are rejected; initialization is transactional.
- **Regression:** changing model assignment config does not require duplicating tribunal workflow code.
- **Foundation:** `npm run lint`, `npm run build`, and app start succeed.

## 5. Known pitfalls

| Pitfall | Observable risk | Expected handling direction |
| --- | --- | --- |
| Invalid or unsupported uploaded file | Non-`.md`, missing, empty, whitespace-only, over 1 MB, or malformed UTF-8 input | Reject or fail visibly before Tribunal execution; do not persist a Case |
| Charge sheet cannot be processed | No reliable case content for agents | Fail visibly; do not invent case facts |
| Model timeout | Missing agent output | Record failure; do not treat as a valid contracted response |
| Malformed model response | Output does not match central contract | Validation failure; never coerce into a valid verdict |
| Partial Tribunal failure | Some agents succeed, others fail | Run must not silently produce a “successful” majority from incomplete/invalid data |
| Retry causing uncontrolled extra model calls or cost | Repeated failures amplify spend and duplicate work | Retry policy must be explicit and bounded before multi-agent execution |

Do not invent the charge-sheet structural contract. Advocate and judge logical contracts are settled in `docs/architecture.md` and implemented as Zod schemas under `lib/ai/contracts/`.
