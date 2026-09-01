# Specification — AI Tribunal (initial)

Observable behavior for the product. Implementation details belong in architecture docs and code.

## 1. Goal and reason

**Goal:** Let a human reviewer start a fresh hearing of the fixed T-001 charge sheet with one homepage action and obtain two comparable Tribunal analyses: one using a single shared model for all agents, and one using a distinct model per agent.

**Reason:** Holding the tribunal procedure constant while varying only model assignment makes it possible to review how model choice affects advocacy, judging, and majority outcomes for the same charge sheet.

## 2. Testable success criteria

The MVP is complete. The following criteria were observed in automated tests and the accepted production dual-run E2E:

1. The homepage presents one primary action that creates and starts a hearing of the server-owned canonical T-001 record.
2. The UI exposes no file upload or editable charge-sheet content.
3. Every launch creates a new Case with a unique ID and the canonical fixture name.
4. Repeated launches create separate Cases; the MVP does not deduplicate them.
5. A persisted Case can be retrieved by its unique ID without rerunning the Tribunal.
6. For each case, exactly two Tribunal runs execute: one `SAME_MODEL` and one `MIXED_MODELS`.
7. Both runs follow the same stage order: advocates complete before judges start; four advocates; then three judges; then a majority verdict for that run.
8. Within a run, the four advocates run concurrently; after they finish, the three judges run concurrently.
9. The two runs run concurrently with each other.
10. Every advocate output conforms to the single advocate response contract; non-conforming outputs are not treated as valid advocate results.
11. Every judge output conforms to the single judge response contract; non-conforming outputs are not treated as valid judge results.
12. Each run’s majority verdict follows the settled vote rule: exactly three valid judge outputs are required; each judge returns `JUSTIFIED` or `NOT_JUSTIFIED`; at least two `JUSTIFIED` → run verdict `JUSTIFIED`; at least two `NOT_JUSTIFIED` → run verdict `NOT_JUSTIFIED`; if a judge permanently fails under the retry policy, no majority is calculated and the run fails.
13. That majority is the final verdict of the run. Incomplete or invalid judging never produces a valid verdict.
14. Both run majority verdicts are available to the human reviewer for the case as the two final AI outputs.
15. Every actual model API attempt—including retries and failed attempts that incurred usage—is recorded individually with Case, Tribunal Run, stage (`ADVOCATES` or `JUDGES`), agent role, attempt number, model, input/output/total tokens, input/output/total cost, duration, and success/failure, using OpenRouter-reported usage/cost.
16. Individual model-call records are the accounting source of truth, and the application can calculate totals per agent (including all attempts), per stage within a Tribunal Run, per complete Tribunal Run, and per Case across both runs.
17. Secrets, prompts, profiles, and model configuration are not exposed to the browser as editable client state.

**Charge-sheet Case persistence phase success:**

1. A reviewer can convene T-001 through one homepage action without selecting a file.
2. The server reads the fixed UTF-8 fixture from the deployed project; the browser sends no charge-sheet content.
3. Every launch creates a new Case with a database-generated unique ID, canonical fixture name, canonical Markdown text, and creation timestamp.
4. Repeated launches create separate Cases; there is no deduplication.
5. No uploaded file/blob exists or is stored.
6. Successful creation returns Case metadata without echoing full charge-sheet contents.
7. Creation or canonical-source failures are shown visibly and do not start a Tribunal.
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

**Model-call audit and run-lifecycle persistence phase success:**

1. `tribunal_runs.status` accepts exactly `PENDING`, `RUNNING`, `SUCCEEDED`, and `FAILED`; other status values are rejected.
2. `final_verdict`, when present, is exactly `JUSTIFIED` or `NOT_JUSTIFIED`; a `FAILED` run has no final verdict.
3. Existing Cases and Tribunal Runs remain valid after the lifecycle migration.
4. Every actual AI attempt can be stored as one `model_calls` row with Case, Tribunal Run, stage, agent role, attempt (1 or 2), model, status (`SUCCEEDED` or `FAILED`), nullable usage/cost/duration/provider/error fields, and nullable validated JSON.
5. Duplicate `(run_id, agent_role, recovery_cycle, model_source, attempt)` rows are rejected; `case_id` cannot disagree with the Case belonging to `run_id`.
6. Unknown usage/cost is stored as null, not zero. Prompts and raw model output are not stored.
7. Repository operations can mark a run `RUNNING`, `SUCCEEDED` with a final verdict, or `FAILED` with a failure reason, and can insert/retrieve Model Calls for a run or Case.
8. `MIXED_MODELS` may use one distinct version-controlled fallback per unresolved seat after an eligible primary failure; `SAME_MODEL` never substitutes a model.
9. Resume atomically claims one failed Run, preserves validated seats and audit history, and starts a new recovery cycle only for unresolved seats.

## 3. Architectural guidance

- Use a Next.js modular monolith (UI + server in one project).
- Use the server-owned T-001 fixture (`fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md`) as the only charge sheet. Do not expose file upload or editable Case content.
- Persist that canonical Markdown text and fixture name on a new unique Case for every launch; do not deduplicate.
- Create exactly one `SAME_MODEL` and one `MIXED_MODELS` Tribunal Run with each Case, in the same transaction; enforce unique `(case_id, run_type)` in PostgreSQL.
- Use PostgreSQL (Supabase preferred) with version-controlled SQL migrations and server-side `pg` access; do not introduce an ORM without an explicit requirement.
- Keep file processing, AI calls, prompts, profiles, model configuration, validation, and cost calculation on the server.
- Use one reusable Tribunal engine; differentiate `SAME_MODEL` and `MIXED_MODELS` by configuration only.
- Choose concrete models ourselves: one model for all seven agents in `SAME_MODEL`, seven different models in `MIXED_MODELS`. Canonical IDs and rationale: [`docs/model-selection.md`](model-selection.md); runtime assignment is `lib/ai/configurations/`.
- Apply the settled majority-vote rule per run: three valid judge outputs; each judge returns `JUSTIFIED` or `NOT_JUSTIFIED`; ≥2 `JUSTIFIED` → `JUSTIFIED`; ≥2 `NOT_JUSTIFIED` → `NOT_JUSTIFIED`; a permanently failed judge yields no majority and a failed run. That majority is the run’s final verdict.
- Treat each model API attempt as an immutable audit/accounting event; record OpenRouter-reported usage/cost; calculate aggregate totals from those records rather than unnecessarily duplicating stored totals.
- Preserve a modular Tribunal execution service and begin with the simplest reliable Next.js-compatible execution path; add queue/background-job infrastructure only if measured runtime/deployment limits require it.
- Keep instructor-provided character/profiles version-controlled and server-side under `lib/ai/profiles/`; construct runtime prompts in application code (`lib/ai/prompts/`). Trusted instructions/configuration are separated from untrusted charge-sheet Markdown and advocate outputs. Assigned representative side is a procedural seat only; the model reasons in character. Judge profiles are judicial-method simulations, not impersonation claims. Dossier Section 6 research citations are provenance, not automatic runtime prompt content.
- Keep advocate and judge response contracts centralized; the settled logical shapes are in `docs/architecture.md`; validate at runtime with the Zod schemas in `lib/ai/contracts/` before the first AI call; do not parse free-form prose for orchestration. Contract strings must be non-empty after trimming.
- Models may interpret and argue from supplied facts but must not introduce new case facts.
- Use PostgreSQL for the deployed application; Supabase is the preferred provider.
- Use OpenRouter as the AI gateway and as the authoritative source of token/cost information.
- Prefer failure visibility over silent fallback verdicts.
- Bound each agent to at most two API attempts (one retry); do not fabricate a majority from incomplete stages; treat the two Tribunal Runs as independent. Canonical retry/failure policy: `docs/architecture.md`.

## 4. Validation approach

Validate against observable criteria:

- **Launch:** one click creates a unique canonical Case with no request body and begins both Runs after navigation.
- **Manual:** no upload control is present; both Run majority verdicts remain reviewable.
- **Contract:** advocate/judge responses fail closed when they do not match the settled central schemas in `docs/architecture.md`.
- **Run integrity:** a run without successful contracted judge outputs does not present a successful majority verdict.
- **Majority vote:** given three valid judge votes, the run verdict is `JUSTIFIED` iff at least two are `JUSTIFIED`, otherwise `NOT_JUSTIFIED` when at least two are `NOT_JUSTIFIED`. That verdict is the run’s final output. A permanently failed judge yields no majority.
- **Audit:** every actual attempt has the complete required Case/run/stage/agent/attempt/model/token/cost/duration/outcome fields; retries remain separate records; usage/cost come from OpenRouter; missing usage/cost is unknown/null, not zero.
- **Accounting:** sums derived from call records reconcile at agent, stage, run, and Case levels, including failed attempts that incurred usage.
- **Retries:** each agent has at most two attempts; 401/403 and other permanent failures are not retried; a failed advocate stage blocks judges; a failed judge stage yields no majority; `SAME_MODEL` and `MIXED_MODELS` fail independently.
- **Retrieval:** a persisted Case can be loaded by unique Case ID without creating new model calls.
- **Runs:** every Case has exactly two run records (`SAME_MODEL`, `MIXED_MODELS`); duplicate kinds are rejected; initialization is transactional.
- **Regression:** changing model assignment config does not require duplicating tribunal workflow code.
- **Foundation:** `npm run lint`, `npm run build`, and app start succeed.

## 5. Known pitfalls

| Pitfall | Observable risk | Expected handling direction |
| --- | --- | --- |
| Canonical fixture unavailable or empty | The server cannot load reliable Case content | Fail visibly before Tribunal execution; do not persist a Case |
| Charge sheet cannot be processed | No reliable case content for agents | Fail visibly; do not invent case facts |
| Model timeout | Missing agent output | Record failure; do not treat as a valid contracted response |
| Malformed model response | Output does not match central contract | Validation failure; never coerce into a valid verdict |
| Partial Tribunal failure | Some agents succeed, others fail | Run must not silently produce a “successful” majority from incomplete/invalid data |
| Retry causing uncontrolled extra model calls or cost | Repeated failures amplify spend and duplicate work | At most two attempts per agent; see `docs/architecture.md` |

Do not invent a generic charge-sheet structural contract from the T-001 example. Advocate and judge logical contracts are settled in `docs/architecture.md` and implemented as Zod schemas under `lib/ai/contracts/`.
