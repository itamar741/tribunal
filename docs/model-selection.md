# Model selection — AI Tribunal

This is the canonical rationale for the version-controlled OpenRouter model assignment. Runtime IDs live in `lib/ai/configurations/`. Profiles, prompt builders, response contracts, and UI do not contain model IDs.

The current selection is intentionally **free-first** for the course/MVP.

## Purpose

The project compares two Tribunal Runs that share one procedure and differ only by model assignment:

- **`SAME_MODEL`** — one homogeneous seven-agent Tribunal. Every seat uses the same concrete model ID.
- **`MIXED_MODELS`** — one heterogeneous seven-agent Tribunal. All seven seats use seven distinct concrete model IDs.

The purpose of model selection is therefore not simply to choose the seven strongest available models. The configuration must preserve the experimental distinction between a homogeneous run and a heterogeneous run. Changing a model ID changes that experimental identity and must remain an explicit, auditable configuration change.

## Catalog authority

Before any configuration change or live verification, every concrete model ID must be checked against OpenRouter’s live catalog:

`GET https://openrouter.ai/api/v1/models`

That catalog is the authoritative source for whether an ID is currently routable and whether its listed prompt/completion price is zero.

A model-detail webpage on openrouter.ai is **not** sufficient evidence. Web pages can describe a model family, a paid sibling, or a `:free` suffix that is not currently present in the API catalog. The first Phase 4B live request used `openai/gpt-oss-120b:free` and received HTTP 404; that failure was audited and is evidence of this distinction, not a successful Tribunal call.

The current IDs below were revalidated against the live `/api/v1/models` catalog after that 404. Recheck the catalog again before a later configuration change or live request.

## Selection constraints

- **OpenRouter is the AI gateway.** All model calls go through OpenRouter.
- **The current MVP uses free endpoints.** Every primary and standby ID ends with `:free`, and the live catalog must currently list zero prompt and completion prices for that exact ID.
- **Concrete model IDs are required** for reproducibility and audit. Each configured seat must name a specific OpenRouter model identity.
- **`openrouter/free` is inappropriate.** That router may choose different models dynamically. A Tribunal Run cannot treat a randomly selected model as a stable experimental condition.
- **Adequate context length is required.** A run later sends the charge sheet, role/profile instructions, the response contract, and — for judges — four validated advocate outputs. The selected windows are larger than those current Tribunal inputs.
- **Instruction following and reasoning matter** for both representative advocacy and judicial-method simulation.
- **Structured-output capability is desirable** because advocate and judge responses have strict Zod contracts. Not every free catalog entry advertises JSON Schema.
- **Zod remains authoritative.** Provider-side JSON Schema or JSON mode can reduce malformed output; it does not replace application validation. Extra fields, empty strings, and wrong shapes still fail closed. Later mixed-model execution must be able to support models that have only prompt-enforced structure.
- **Model diversity is intentional in `MIXED_MODELS`.** Distinct families and concrete IDs make the heterogeneous Tribunal meaningfully different from `SAME_MODEL`.
- **Free-endpoint availability can change.** OpenRouter’s free catalog and provider coverage are not a stable product contract.

## SAME_MODEL rationale

Invariant:

> Every one of the seven agents in that Tribunal Run must use the same concrete model ID.

Selected ID for all seven roles:

`minimax/minimax-m3:free`

This is the selected MVP baseline under the current constraints. It is not claimed to be objectively the best model. Its configured output mode is `JSON_OBJECT`.

### Why GLM 5.2 was previously selected

The previous baseline was `z-ai/glm-5.2:free`. It replaced `openai/gpt-oss-120b:free` after that ID was absent from the live catalog and returned HTTP 404 on the first Phase 4B request.

GLM 5.2 was selected then because:

- it was an active, routable free catalog ID with zero listed prompt/completion prices;
- it advertised a strong general-reasoning orientation (Z.ai GLM 5.2, long-horizon agent and reasoning work);
- the free catalog entry listed 256K context (256,000 tokens);
- the live catalog advertised `response_format` and `structured_outputs`, so the one-agent slice could send JSON Schema with `provider.require_parameters = true`;
- using one identical, currently routable model across all seven seats gave a fair homogeneous control.

That earlier selection remains historically correct. GLM 5.2 was a valid/routable model. The later change below is not a claim that those reasons were wrong.

### Why the baseline was revised to Nemotron 3 Super

On 2026-08-26, two controlled Phase 4B live Chat Completions requests to `z-ai/glm-5.2:free` (`DEFENSE_1`, `SAME_MODEL`, attempt 1, no retry) both failed with provider/model HTTP 429. The second failure’s sanitized diagnostic was `Provider returned error` with `Retry-After: 5` and no platform `X-RateLimit-*` headers. Both attempts were audited as `FAILED` and were not retried.

That is operational evidence about current free-endpoint availability, not a catalog 404 and not an in-run fallback. The GLM ID remains in `MIXED_MODELS` (`JUDGE_1`). The baseline change is an explicit versioned configuration revision for future Runs.

Nemotron 3 Super was selected as the replacement because:

- it is an active free OpenRouter model ID with zero listed prompt/completion prices;
- the live catalog advertises `response_format` and `structured_outputs` (JSON Schema);
- 256K context (262,144 tokens) is adequate for current Tribunal inputs;
- it already appeared as a primary mixed-judge ID, so the catalog evidence for schema support and free pricing was already recorded;
- during the same verification window it showed materially stronger current free-endpoint availability than GLM 5.2.

Availability observations are dated research/verification evidence, not permanent guarantees. This change does not authorize runtime cross-model fallback, OpenRouter’s `models` array, or silent substitution inside an already-defined Tribunal Run.

### Why the baseline was revised to MiniMax M3

On 2026-08-26, a later controlled Phase 4B live request to `nvidia/nemotron-3-super-120b-a12b:free` reached OpenRouter and failed as `PROVIDER_RESPONSE_ERROR` with sanitized diagnostic `Upstream error from Nvidia: Internal server error (code=502)`. The attempt was audited and was not retried.

Nemotron Super remains a valid/routable `MIXED_MODELS` `JUDGE_2` ID. The SAME_MODEL change is an explicit versioned configuration revision for future Runs, not runtime fallback.

MiniMax M3 was selected because:

- it is an active free OpenRouter model ID with zero listed prompt/completion prices;
- it has 1M context (1,048,576 tokens);
- the live catalog advertises `response_format` JSON output, not JSON Schema;
- it showed substantially stronger current observed availability than GLM 5.2 (repeated provider 429s) and Nemotron Super (NVIDIA upstream 502) during the same verification window;
- Zod remains authoritative. The execution path now sends `response_format.type = json_object` for this ID and still requires JSON parse + Zod before `SUCCEEDED`.

Do not use `openrouter/free` or any other automatic model router for this run.

## MIXED_MODELS rationale

Invariant:

> All seven roles use seven distinct concrete model IDs.

Diversity across model families is deliberate so the heterogeneous Tribunal is meaningfully different from `SAME_MODEL`. One `MIXED_MODELS` seat (`PROSECUTION_2`) currently reuses the `SAME_MODEL` baseline ID (`minimax/minimax-m3:free`); the other six seats use different concrete IDs. `JUDGE_2` remains `nvidia/nemotron-3-super-120b-a12b:free` after the SAME_MODEL revision. The run still satisfies the seven-distinct-IDs invariant. Overlap between `SAME_MODEL` and one mixed role is allowed.

Provider-side structure is a hint to the gateway, not a substitute for Zod. Structured-output capability differs by model and is an explicit versioned configuration (`JSON_SCHEMA`, `JSON_OBJECT`, `PROMPT_ONLY`) in `lib/ai/configurations/`. The transport does not probe capabilities at runtime. Every mode still requires JSON parse + Zod.

| Tribunal role | Concrete model ID | Provider / family | Free | Context size | Structured-output level | Selection rationale / tradeoff |
| --- | --- | --- | --- | --- | --- | --- |
| `DEFENSE_1` | `nvidia/nemotron-3.5-lightning:free` | NVIDIA Nemotron 3.5 Lightning | `:free` | 1M (1,000,000) | `PROMPT_ONLY` | Replaces Inkling after a hard deployed 403 (agentic-harness-only). Distinct from `JUDGE_2` Nemotron Super. Tradeoff: no `response_format`; JSON parse + Zod required. |
| `DEFENSE_2` | `minimax/minimax-m2.7:free` | MiniMax M2.7 | `:free` | 192K (196,608) | `JSON_OBJECT` | Different MiniMax generation from M3. Tradeoff: smaller window than M3; structure is JSON mode, not JSON Schema. |
| `PROSECUTION_1` | `poolside/laguna-s-2.1:free` | Poolside Laguna S 2.1 | `:free` | 256K (262,144) | `PROMPT_ONLY` | Promoted from standby after Gemma 4 31B returned provider 429s on both allowed attempts. Tradeoff: no `response_format`; JSON parse + Zod required. |
| `PROSECUTION_2` | `minimax/minimax-m3:free` | MiniMax M3 | `:free` | 1M (1,048,576) | `JSON_OBJECT` | Distinct MiniMax ID and a very large context. After the 2026-08-26 SAME_MODEL revision this ID also serves as the homogeneous baseline. Tradeoff: JSON mode rather than JSON Schema. |
| `JUDGE_1` | `z-ai/glm-5.2:free` | Z.ai GLM 5.2 | `:free` | 256K (256,000) | `JSON_SCHEMA` | Remains a distinct mixed-judge ID. Live catalog advertises schema support. Not used as an automatic fallback. |
| `JUDGE_2` | `nvidia/nemotron-3-super-120b-a12b:free` | NVIDIA Nemotron 3 Super | `:free` | 256K (262,144) | `JSON_SCHEMA` | Open hybrid MoE with reasoning and schema support. No longer the SAME_MODEL baseline after the NVIDIA upstream 502. |
| `JUDGE_3` | `google/gemma-4-26b-a4b-it:free` | Google Gemma 4 (26B A4B MoE) | `:free` | 256K (262,144) | `JSON_OBJECT` | Distinct concrete ID from `PROSECUTION_1` (MoE vs dense Gemma 4). Tradeoff: same vendor family appears twice; diversity is still seven IDs, not seven vendors. |

`JSON_SCHEMA` means the live catalog listed `structured_outputs`. `JSON_OBJECT` means `response_format` was listed without `structured_outputs`. `PROMPT_ONLY` means neither parameter was listed. These modes are versioned configuration, not permanent OpenRouter claims. In every case the application still validates with Zod before treating a response as a valid advocate or judge output.

### First deployed dual-run E2E (2026-08-27)

The first production Case completed correctly at the system level: both Runs started concurrently, failed closed in the Advocate stage, and did not start Judges. SAME_MODEL was not changed.

`SAME_MODEL` (`minimax/minimax-m3:free`):

- `DEFENSE_1`, `PROSECUTION_1`, and `PROSECUTION_2` succeeded.
- `DEFENSE_2` received HTTP 429 with `Retry-After: 60` on both allowed attempts and failed permanently.
- One seat being rate-limited twice does not justify another SAME_MODEL baseline replacement.

`MIXED_MODELS`:

- `DEFENSE_1` `thinkingmachines/inkling:free` failed permanently on attempt 1 with HTTP 403: the ID “is only available on agentic harnesses.” That is a hard compatibility problem with this deployed web application, not a transient provider failure. Inkling was removed from the primary mixed assignment.
- `PROSECUTION_1` `google/gemma-4-31b-it:free` received HTTP 429 on both allowed attempts and failed permanently. The ID remains a valid free catalog endpoint and was demoted to the standby pool, not deleted.
- The other mixed representative seats succeeded.

The replacements below are an explicit versioned configuration change before the next fresh Case. They are not runtime fallback and do not alter retry policy.

### Why MIXED `DEFENSE_1` is Nemotron 3.5 Lightning

`nvidia/nemotron-3.5-lightning:free` was selected because:

- the live `/api/v1/models` catalog listed the exact ID with zero prompt/completion prices;
- the catalog listed neither `response_format` nor `structured_outputs` (`PROMPT_ONLY`);
- it is a distinct concrete ID from `JUDGE_2` (`nvidia/nemotron-3-super-120b-a12b:free`);
- the catalog did not mark it as agentic-harness-only (unlike the Inkling 403).

### Why MIXED `PROSECUTION_1` is Laguna S 2.1

`poolside/laguna-s-2.1:free` was previously standby slot 2. It is now a primary mixed seat because:

- the live catalog listed the exact ID with zero prompt/completion prices;
- the catalog listed neither `response_format` nor `structured_outputs` (`PROMPT_ONLY`);
- promoting a recorded standby ID keeps the change auditable;
- Gemma 4 31B remains a valid free ID and is now standby only.

## Structured-output modes

Runtime request shape is selected from centralized configuration, not by probing the provider during a Tribunal Run.

| Mode | Request behavior | Trust boundary |
| --- | --- | --- |
| `JSON_SCHEMA` | `response_format.type = json_schema`, Zod-derived schema, `strict: true`, `provider.require_parameters = true` | JSON parse → Zod |
| `JSON_OBJECT` | `response_format.type = json_object`; no JSON Schema | JSON parse → Zod |
| `PROMPT_ONLY` | no `response_format` | JSON parse → Zod |

Do not repair malformed JSON, infer missing fields, or use response healing. Provider-side structured output is an optimization, not the Tribunal trust boundary.

## Standby pool

Currently approved emergency candidates, in recorded order:

1. `nvidia/nemotron-3-ultra-550b-a55b:free` — larger Nemotron 3 sibling; 1M context; catalog listed neither `response_format` nor `structured_outputs`.
2. `google/gemma-4-31b-it:free` — demoted from `MIXED_MODELS` `PROSECUTION_1` after both allowed attempts returned provider 429s in the 2026-08-27 deployed E2E. The ID remains a valid free catalog endpoint.
3. `thinkingmachines/inkling-small:free` — smaller Inkling sibling; 1M context; prompt-enforced structure only.

`nvidia/nemotron-3-super-120b-a12b:free` remains a primary `MIXED_MODELS` `JUDGE_2` ID and is not a standby candidate. Standby IDs are classified `PROMPT_ONLY` from the same catalog snapshot.

These are standby candidates only. They are **not** automatic runtime model fallbacks.

They exist because free-model availability is volatile. An unavailable primary model must not be silently replaced inside an already-defined Tribunal Run. The normal attempt/retry/failure policy applies. The standby pool is for an explicit future configuration change and a new execution. The new effective configuration must remain auditable.

Do not use OpenRouter’s cross-model `models` fallback array in the Tribunal execution design.

## Provider failover vs model replacement

Two different OpenRouter behaviors must stay distinct:

| Behavior | What changes | Tribunal policy |
| --- | --- | --- |
| Same-model provider failover | Model X / Provider A → Model X / Provider B | Acceptable. Concrete model identity is preserved. |
| Cross-model fallback | Model X → Model Y (including a `models` array) | Not automatic. This changes experimental identity. |

If every provider for a selected free model is unavailable:

- apply the normal attempt/retry/failure policy;
- do not silently substitute another model;
- use the standby pool only through an explicit configuration change and a new Case/execution;
- keep the effective configuration auditable.

Later execution must record the actual model identity returned by OpenRouter so provider failover can be distinguished from an unintended model replacement.

## Cost rationale

- All currently selected primary and standby IDs use the `:free` suffix and were confirmed at zero listed prompt/completion price in the live catalog.
- While those free endpoints remain available, MVP inference cost is zero.
- Free requests remain subject to OpenRouter limits and availability. Capacity, latency, and rate limits can change without notice.
- Zero price is a current operational property of this course/demo configuration, not a permanent product guarantee.

Do not treat any dated free-tier request quota as an architectural invariant.

## Privacy / provider-policy caveat

Free endpoints can differ from paid endpoints — and from each other — in logging, retention, and data-use policies.

- This model set is appropriate for the current course/demo configuration.
- It must not be interpreted as a privacy guarantee for sensitive production data.
- The free NVIDIA Nemotron endpoint is not appropriate for confidential production data.
- Provider data policies must be reviewed before production or privacy-sensitive use.

This document does not resolve the project’s broader retention/privacy decision for persisted charge-sheet text.

## Research snapshot

**Research snapshot: 2026-08-27 (MIXED seats revised after first deployed dual-run E2E)**

Observed on the deployed Case (system-correct Advocate-stage failures; no Judges):

- `thinkingmachines/inkling:free` returned HTTP 403 on attempt 1 (agentic-harness-only). Removed from primary MIXED `DEFENSE_1`.
- `google/gemma-4-31b-it:free` returned HTTP 429 on both allowed attempts. Demoted from MIXED `PROSECUTION_1` to standby.
- `nvidia/nemotron-3.5-lightning:free` and `poolside/laguna-s-2.1:free` were present in the live catalog with `pricing.prompt = 0` and `pricing.completion = 0`, no `response_format`, and no harness-only catalog mark. Both are configured `PROMPT_ONLY` + Zod.
- SAME_MODEL remained `minimax/minimax-m3:free`.

These observations are dated operational evidence, not permanent availability guarantees.

**Research snapshot: 2026-08-26 (revalidated after first live 404; SAME_MODEL revised after GLM 429s and a Nemotron Super 502)**

The context sizes, free prices, and structured-output levels above were observed from `GET https://openrouter.ai/api/v1/models` on that date. They are research notes, not runtime configuration and not architectural invariants.

Observations from that revalidation:

- Stale configured `:free` IDs were **absent** from the live catalog: `openai/gpt-oss-120b:free`, `inclusionai/ling-3.0-flash:free`, `openai/gpt-oss-20b:free`, and `nex-agi/nex-n2-pro:free`. Paid base IDs existed for some of those families; a webpage or paid sibling is not a routable free endpoint.
- The first Phase 4B Chat Completions request to `openai/gpt-oss-120b:free` returned HTTP 404, was audited as `FAILED`, and was not retried. That is a closed failure, not a successful call.
- Every replacement primary and standby ID existed in the live catalog with `pricing.prompt = 0` and `pricing.completion = 0`.
- `z-ai/glm-5.2:free` and `nvidia/nemotron-3-super-120b-a12b:free` advertised both `response_format` and `structured_outputs`.
- Two later controlled Phase 4B requests to `z-ai/glm-5.2:free` failed with provider/model HTTP 429 and were audited without retry. That operational evidence prompted an explicit SAME_MODEL revision to `nvidia/nemotron-3-super-120b-a12b:free`.
- A later controlled Phase 4B request to `nvidia/nemotron-3-super-120b-a12b:free` failed as `PROVIDER_RESPONSE_ERROR` with NVIDIA upstream HTTP 502 and was audited without retry. That prompted an explicit SAME_MODEL revision to `minimax/minimax-m3:free`. Neither change is runtime fallback or a permanent availability guarantee.
- Several mixed and standby IDs advertised only JSON mode or neither structured-output parameter. Zod remains required.
- OpenRouter’s free catalog and provider availability are dynamic. Recheck `/api/v1/models` before changing or deploying this configuration.

Do not present transient uptime, latency, or daily quota numbers as architectural invariants.

## Replacement criteria

Revisit model selection when any of the following is true:

- a selected model is removed or deprecated;
- the exact ID is absent from the live `/api/v1/models` catalog;
- the free endpoint is no longer listed at zero prompt/completion price;
- availability problems persist after the normal retry policy;
- structured-output behavior is incompatible with the Tribunal contracts;
- contract-validation failure rate is excessive;
- privacy or provider-policy requirements change;
- course requirements change.

A replacement is a new version-controlled configuration. It is not an in-run substitution.
