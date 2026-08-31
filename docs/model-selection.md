# Model selection — AI Tribunal

This is the canonical rationale for the version-controlled OpenRouter model assignment. Runtime IDs live in `lib/ai/configurations/`. Profiles, prompt builders, response contracts, and UI do not contain model IDs.

The current selection is **no longer all-free**. SAME_MODEL and two MIXED seats remain free catalog endpoints. MIXED `DEFENSE_1`, `DEFENSE_2`, `PROSECUTION_1`, `JUDGE_1`, and `JUDGE_3` are explicitly paid IDs. Concrete IDs, output capabilities, and current pricing must be catalog-verified.

The accepted production dual-run E2E used this configuration. Both Runs succeeded and persisted `NOT_JUSTIFIED`. Paid MIXED seats exist for reliability, not because the Tribunal requires paid inference. Availability and listed prices remain operational configuration and must be revalidated against `GET /api/v1/models` before a later change.

## Purpose

The project compares two Tribunal Runs that share one procedure and differ only by model assignment:

- **`SAME_MODEL`** — one homogeneous seven-agent Tribunal. Every seat uses the same concrete model ID.
- **`MIXED_MODELS`** — one heterogeneous seven-agent Tribunal. All seven seats use seven distinct concrete model IDs.

The purpose of model selection is therefore not simply to choose the seven strongest available models. The configuration must preserve the experimental distinction between a homogeneous run and a heterogeneous run. Changing a model ID changes that experimental identity and must remain an explicit, auditable configuration change.

## Catalog authority

Before any configuration change or live verification, every concrete model ID must be checked against OpenRouter’s live catalog:

`GET https://openrouter.ai/api/v1/models`

That catalog is the authoritative source for whether an ID is currently routable and whether its listed prompt/completion price matches the expected free or paid configuration.

A model-detail webpage on openrouter.ai is **not** sufficient evidence. Web pages can describe a model family, a paid sibling, or a `:free` suffix that is not currently present in the API catalog. The first Phase 4B live request used `openai/gpt-oss-120b:free` and received HTTP 404; that failure was audited and is evidence of this distinction, not a successful Tribunal call.

The current IDs below were revalidated against the live `/api/v1/models` catalog after that 404. Recheck the catalog again before a later configuration change or live request.

## Selection constraints

- **OpenRouter is the AI gateway.** All model calls go through OpenRouter.
- **Model configuration may contain paid endpoints.** Concrete IDs, output capabilities, and current pricing must be explicitly documented and catalog-verified. Free-configured IDs must still list zero prompt and completion prices. The current paid primaries are `openai/gpt-4.1-mini`, `mistralai/mistral-small-3.2-24b-instruct`, `qwen/qwen3-30b-a3b-instruct-2507`, `openai/gpt-4.1`, and `meta-llama/llama-4-maverick`.
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
| `DEFENSE_1` | `openai/gpt-4.1-mini` | OpenAI GPT-4.1 Mini | paid | ~1M (1,047,576) | `JSON_SCHEMA` | Replaces paid GPT-OSS after two deployed completions with null assistant content and mandatory reasoning. Conventional text output; catalog lists `response_format` and `structured_outputs`. Provider-reported cost is audited. |
| `DEFENSE_2` | `mistralai/mistral-small-3.2-24b-instruct` | Mistral Small 3.2 24B | paid | 131K (131,072) | `JSON_SCHEMA` | Replaces the slow MiniMax M2.7 free endpoint. Low listed price, fast provider throughput, and improved structured-output/function-calling behavior. |
| `PROSECUTION_1` | `qwen/qwen3-30b-a3b-instruct-2507` | Qwen3 30B A3B Instruct | paid | 262K (262,144) | `JSON_SCHEMA` | Replaces Nemotron 3 Ultra after repeated long-running free-endpoint risk. Very low listed price, multilingual instruction following, and structured-output support. |
| `PROSECUTION_2` | `minimax/minimax-m3:free` | MiniMax M3 | `:free` | 1M (1,048,576) | `JSON_OBJECT` | Distinct MiniMax ID and a very large context. After the 2026-08-26 SAME_MODEL revision this ID also serves as the homogeneous baseline. Tradeoff: JSON mode rather than JSON Schema. |
| `JUDGE_1` | `openai/gpt-4.1` | OpenAI GPT-4.1 | paid | ~1M (1,047,576) | `JSON_SCHEMA` | Replaces `z-ai/glm-5.2:free` after both allowed deployed attempts returned upstream HTTP 429. Catalog lists `response_format` and `structured_outputs`. Provider-reported cost is audited. |
| `JUDGE_2` | `nvidia/nemotron-3-super-120b-a12b:free` | NVIDIA Nemotron 3 Super | `:free` | 256K (262,144) | `JSON_SCHEMA` | Open hybrid MoE with reasoning and schema support. Succeeded on attempt 1 in the latest deployed MIXED Judge stage and was not changed. |
| `JUDGE_3` | `meta-llama/llama-4-maverick` | Meta Llama 4 Maverick | paid | 1M (1,048,576) | `JSON_SCHEMA` | Replaces `google/gemma-4-26b-a4b-it:free` after both allowed deployed attempts returned upstream HTTP 429. Catalog lists `response_format` and `structured_outputs`. Provider-reported cost is audited. |

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

### Why MIXED `DEFENSE_1` was Nemotron 3.5 Lightning

`nvidia/nemotron-3.5-lightning:free` was selected after the Inkling 403 because:

- the live `/api/v1/models` catalog listed the exact ID with zero prompt/completion prices;
- the catalog listed neither `response_format` nor `structured_outputs` (`PROMPT_ONLY`);
- it is a distinct concrete ID from `JUDGE_2` (`nvidia/nemotron-3-super-120b-a12b:free`);
- the catalog did not mark it as agentic-harness-only (unlike the Inkling 403).

That selection remains historically correct. It is no longer the primary mixed defense ID.

### Second deployed dual-run E2E (2026-08-27)

`SAME_MODEL` (`minimax/minimax-m3:free`) completed a full successful 7-agent Run. All seven seats succeeded on attempt 1. SAME_MODEL is accepted and was not changed.

`MIXED_MODELS`:

- `DEFENSE_2` `minimax/minimax-m2.7:free` succeeded.
- `PROSECUTION_1` `poolside/laguna-s-2.1:free` succeeded.
- `PROSECUTION_2` `minimax/minimax-m3:free` succeeded.
- `DEFENSE_1` `nvidia/nemotron-3.5-lightning:free` failed permanently: attempt 1 `TIMEOUT` after 90,000 ms; attempt 2 returned provider usage but `MALFORMED_JSON`. The Run correctly failed before Judges.

Lightning was therefore removed from the primary MIXED assignment and recorded as standby only. No automatic fallback occurred.

### Why MIXED `DEFENSE_1` was Dots3-Note Preview

`dots-studio/dots-3-note-preview:free` was selected only after live `/api/v1/models` verification:

- exact ID present;
- `pricing.prompt = 0` and `pricing.completion = 0`;
- 512K context (512,000 tokens);
- catalog listed both `response_format` and `structured_outputs` → configured `JSON_SCHEMA`;
- not marked agentic-harness-only.

The OpenRouter catalog and model page scheduled that free endpoint to go away on **2026-09-30**. It is no longer the primary mixed defense ID.

### Later deployed MIXED `DEFENSE_1` failure (Dots3)

A later deployed Case used `dots-studio/dots-3-note-preview:free` as MIXED `DEFENSE_1` and failed with HTTP 400. Combined with the 2026-09-30 expiration, Dots3 was removed from the primary MIXED assignment and was **not** added to standby.

`SAME_MODEL` (`minimax/minimax-m3:free`) remains a complete successful deployed 7-agent Run and was not changed.

### Why MIXED `DEFENSE_1` was Liquid LFM2.5-2.6B

`liquid/lfm-2.5-2.6b:free` was selected only after live `/api/v1/models` verification on 2026-08-29:

- exact ID present;
- `pricing.prompt = 0` and `pricing.completion = 0`;
- 64K context (65,536 tokens), sufficient for current Advocate-stage Tribunal prompts;
- catalog listed both `response_format` and `structured_outputs` → configured `JSON_SCHEMA`;
- no catalog `expiration_date`;
- not marked agentic-harness-only.

OpenRouter’s model page states that prompts and outputs may be retained and used to train Liquid models. This remains a course/MVP configuration, not a privacy-sensitive production recommendation.

This is an explicit versioned configuration change before a fresh Case. It is not runtime fallback.

### Later deployed MIXED `DEFENSE_1` failure (Liquid)

A later deployed Case used `liquid/lfm-2.5-2.6b:free` as MIXED `DEFENSE_1`. Both allowed attempts returned a valid OpenRouter completion envelope with no provider error, `message.content = null`, reasoning present, and no usable assistant JSON. Tribunal output remains assistant content → JSON → Zod. The parser was not changed to consume reasoning. Liquid is therefore unsuitable for this response boundary and was removed from the primary MIXED assignment. It was not added to standby.

`SAME_MODEL` (`minimax/minimax-m3:free`) remains a complete successful deployed 7-agent Run and was not changed.

### Why MIXED `DEFENSE_1` was paid GPT-OSS 120B

`openai/gpt-oss-120b` was selected only after live `/api/v1/models` verification on 2026-08-29 and a sanitized OpenRouter key/credits diagnostic that confirmed paid credit is available:

- exact ID present (this is the paid sibling; `openai/gpt-oss-120b:free` remains absent and is not used);
- listed `pricing.prompt = 0.000000037` and `pricing.completion = 0.00000017`;
- 128K context (131,072 tokens);
- catalog listed both `response_format` and `structured_outputs` → configured `JSON_SCHEMA`;
- not marked agentic-harness-only;
- ordinary API access, not harness-only.

This seat is paid because the remaining MIXED Advocate-stage failure was isolated to a free endpoint that returned null assistant content. GPT-OSS 120B offers JSON Schema support and substantially more robust provider routing than the failed free defense candidates (Inkling 403, Lightning timeout + malformed JSON, Dots3 HTTP 400, Liquid null content). Provider-reported usage/cost remains audited; execution does not calculate the charge.

This is an explicit versioned configuration revision before a fresh Case. It is not runtime fallback.

### Later deployed MIXED `DEFENSE_1` failure (paid GPT-OSS)

A later deployed Case used `openai/gpt-oss-120b` as MIXED `DEFENSE_1`. Both allowed attempts returned a normal OpenRouter completion envelope with no provider error, `message.content = null`, and `reasoning` present. The live catalog marks this ID as mandatory-reasoning. The Tribunal response boundary remains assistant content → JSON parse → Zod. The parser was not changed to consume `message.reasoning`. GPT-OSS is therefore unsuitable for this seat and was removed from the primary MIXED assignment. It was not added to standby.

`SAME_MODEL` (`minimax/minimax-m3:free`) remains a complete successful deployed 7-agent Run and was not changed.

### Why MIXED `DEFENSE_1` is paid GPT-4.1 Mini

`openai/gpt-4.1-mini` was selected only after live `/api/v1/models` verification on 2026-08-29:

- exact ID present;
- listed `pricing.prompt = 0.0000004` and `pricing.completion = 0.0000016`;
- ~1M context (1,047,576 tokens);
- catalog listed both `response_format` and `structured_outputs` → configured `JSON_SCHEMA`;
- catalog listed no `reasoning`, `include_reasoning`, or `reasoning_effort` parameters and no reasoning object;
- output modality is text;
- not marked agentic-harness-only.

GPT-4.1 Mini is a conventional text-output model with JSON Schema support and high current availability. It was chosen after two free/paid reasoning-style endpoints (Liquid and GPT-OSS) returned null assistant content. Provider-reported usage/cost remains audited; execution does not calculate the charge.

A deployed MIXED `DEFENSE_1` attempt against this ID returned HTTP 400. That failure was traced to Tribunal-generated draft-07 tuple JSON Schema (`items: [schema, schema, schema]`) for exact-length Advocate `arguments`. The logical exact-three contract did not change. Provider JSON Schema now uses a homogeneous `items` object plus `minItems`/`maxItems`. Zod remains authoritative. GPT-4.1 Mini is not treated as an incompatible model on that evidence.

This is an explicit versioned configuration revision before a fresh Case. It is not runtime fallback.

### Later deployed MIXED Advocate success and Judge-stage rate limits

A later deployed Case proved that the MIXED Advocate stage now succeeds completely after the GPT-4.1 Mini schema correction:

- `DEFENSE_1` / `openai/gpt-4.1-mini` succeeded.
- `DEFENSE_2` / `minimax/minimax-m2.7:free` failed the advocate contract on attempt 1 and succeeded on attempt 2.
- `PROSECUTION_1` / `poolside/laguna-s-2.1:free` succeeded.
- `PROSECUTION_2` / `minimax/minimax-m3:free` succeeded.

The MIXED Judge stage then failed closed because two free Judge endpoints were rate-limited on both allowed attempts:

- `JUDGE_1` / `z-ai/glm-5.2:free` received HTTP 429 twice. OpenRouter reported the free upstream provider as temporarily rate-limited.
- `JUDGE_2` / `nvidia/nemotron-3-super-120b-a12b:free` succeeded on attempt 1 and was not changed.
- `JUDGE_3` / `google/gemma-4-26b-a4b-it:free` received HTTP 429 twice. OpenRouter reported Google AI Studio free upstream as temporarily rate-limited.

Those are provider-capacity failures, not application failures. SAME_MODEL and all Advocate assignments were not changed. There is no automatic cross-model fallback.

### Why MIXED `JUDGE_1` is paid GPT-4.1

`openai/gpt-4.1` was selected only after live `/api/v1/models` verification on 2026-08-29:

- exact ID present;
- listed `pricing.prompt = 0.000002` and `pricing.completion = 0.000008`;
- ~1M context (1,047,576 tokens);
- catalog listed both `response_format` and `structured_outputs` → configured `JSON_SCHEMA`;
- catalog listed no `reasoning`, `include_reasoning`, or `reasoning_effort` parameters;
- output modality is text;
- not marked agentic-harness-only.

This seat is paid because the remaining MIXED failure was isolated to a free Judge endpoint that exhausted both allowed attempts with upstream 429s. Provider-reported usage/cost remains audited; execution does not calculate the charge.

This is an explicit versioned configuration revision before a fresh Case. It is not runtime fallback.

### Why MIXED `JUDGE_3` is paid Llama 4 Maverick

`meta-llama/llama-4-maverick` was selected only after live `/api/v1/models` verification on 2026-08-29:

- exact ID present;
- listed `pricing.prompt = 0.0000002` and `pricing.completion = 0.0000008`;
- 1M context (1,048,576 tokens);
- catalog listed both `response_format` and `structured_outputs` → configured `JSON_SCHEMA`;
- catalog listed no `reasoning`, `include_reasoning`, or `reasoning_effort` parameters;
- output modality is text;
- not marked agentic-harness-only.

This seat is paid because the remaining MIXED failure was isolated to a free Judge endpoint that exhausted both allowed attempts with upstream 429s. Provider-reported usage/cost remains audited; execution does not calculate the charge.

This is an explicit versioned configuration revision before a fresh Case. It is not runtime fallback.

### Why MIXED `PROSECUTION_1` is Laguna S 2.1

`poolside/laguna-s-2.1:free` was previously standby slot 2. It is now a primary mixed seat because:

- the live catalog listed the exact ID with zero prompt/completion prices;
- the catalog listed neither `response_format` nor `structured_outputs` (`PROMPT_ONLY`);
- promoting a recorded standby ID keeps the change auditable;
- Gemma 4 31B remains a valid free ID and is now standby only.

### Why MIXED `PROSECUTION_1` is now Nemotron 3 Ultra

`poolside/laguna-s-2.1:free` subsequently failed in deployed use and was removed from both the primary assignment and standby pool. On 2026-08-30, the public OpenRouter catalog confirmed that the already approved standby `nvidia/nemotron-3-ultra-550b-a55b:free`:

- is present under that exact concrete ID;
- lists zero prompt and completion prices;
- has a 1,000,000-token context window;
- lists no `response_format` or structured-output capability, so it remains `PROMPT_ONLY`; and
- remains distinct from all six other `MIXED_MODELS` seat IDs.

Promoting this version-controlled standby is an explicit configuration revision for future Cases. It does not create an in-run fallback, change the same-model retry policy, or alter the advocate/judge contracts.

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

1. `google/gemma-4-31b-it:free` — demoted from `MIXED_MODELS` `PROSECUTION_1` after both allowed attempts returned provider 429s in the 2026-08-27 deployed E2E. The ID remains a valid free catalog endpoint.
2. `cohere/north-mini-code:free` — added on 2026-08-30 after the official catalog confirmed the exact zero-priced, direct model ID and a 256K context window. It exposes no structured-output parameter, so it uses `PROMPT_ONLY` plus JSON parse and Zod validation. It replaces `thinkingmachines/inkling-small:free`, which a deployed web Run proved is restricted to agentic harnesses and is therefore incompatible with Tribunal.
3. `nvidia/nemotron-3.5-lightning:free` — demoted from `MIXED_MODELS` `DEFENSE_1` after the second deployed E2E: attempt 1 `TIMEOUT`, attempt 2 `MALFORMED_JSON`. Prompt-enforced structure only. Not used automatically.
4. `inclusionai/ling-3.0-flash-fin:free` — added on 2026-08-30 after public catalog verification: exact zero-priced ID, 262,144-token context, and no `response_format`/`structured_outputs` capability (`PROMPT_ONLY`). It is a bounded recovery candidate, not an OpenRouter router or a primary seat.
5. `z-ai/glm-5.2:free` — catalog-verified zero-priced 256K candidate with `JSON_SCHEMA`; previously rate-limited primary use remains historical availability evidence, not an automatic exclusion from a bounded recovery pool.
6. `google/gemma-4-26b-a4b-it:free` — catalog-verified zero-priced 256K candidate with `JSON_OBJECT`; never used as an OpenRouter model router.
7. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` — catalog-verified zero-priced 256K candidate with `PROMPT_ONLY` output handling.

`nvidia/nemotron-3-super-120b-a12b:free` remains a primary `MIXED_MODELS` `JUDGE_2` ID and is not a standby candidate. Each standby's explicit output strategy is version-controlled in `lib/ai/configurations/output-modes.ts`.

These candidates are used only by the bounded `MIXED_MODELS` recovery coordinator after an eligible primary failure exhausts its two attempts. They are never passed to OpenRouter as a router/fallback array, and `SAME_MODEL` never substitutes a candidate.

### Current low-cost reliability revision

On 2026-08-30, the two slowest/problematic MIXED Advocate assignments were replaced before a fresh Case. `DEFENSE_2` moved from `minimax/minimax-m2.7:free` to Mistral Small 3.2, and `PROSECUTION_1` moved from Nemotron 3 Ultra free to Qwen3 30B A3B Instruct. Both replacements are paid endpoints, but their listed per-token prices are low enough that a complete Tribunal run remains in the cents-or-less range at current prompt sizes. The change is configuration-only: retries, recovery, persistence, streaming, and SAME_MODEL behavior are unchanged.

The OpenRouter model pages currently list Mistral Small 3.2 at $0.075/$0.20 per million input/output tokens and Qwen3 30B A3B at approximately $0.048/$0.193 per million during the displayed promotion. These prices and provider performance are operational observations and must be rechecked before a later change.

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

- SAME_MODEL, the other four MIXED seats, and the standby pool remain `:free` IDs and must still list zero prompt/completion prices in the live catalog.
- MIXED `DEFENSE_1` is the paid ID `openai/gpt-4.1-mini`. On 2026-08-29 the catalog listed `pricing.prompt = 0.0000004` and `pricing.completion = 0.0000016`.
- MIXED `JUDGE_1` is the paid ID `openai/gpt-4.1`. On 2026-08-29 the catalog listed `pricing.prompt = 0.000002` and `pricing.completion = 0.000008`.
- MIXED `JUDGE_3` is the paid ID `meta-llama/llama-4-maverick`. On 2026-08-29 the catalog listed `pricing.prompt = 0.0000002` and `pricing.completion = 0.0000008`.
- Provider-reported usage and cost for those Model Calls are persisted as returned. Execution does not calculate the charge.
- Free requests remain subject to OpenRouter limits and availability. Capacity, latency, rate limits, and listed prices can change without notice.
- Zero price on free-configured IDs is a current operational property, not a permanent product guarantee.

Do not treat any dated free-tier request quota as an architectural invariant.

## Privacy / provider-policy caveat

Free endpoints can differ from paid endpoints — and from each other — in logging, retention, and data-use policies.

- This model set is appropriate for the current course/demo configuration.
- It must not be interpreted as a privacy guarantee for sensitive production data.
- The free NVIDIA Nemotron endpoint is not appropriate for confidential production data.
- The free Liquid LFM2.5-2.6B endpoint states that prompts and outputs may be retained and used to train Liquid models. It is a course/MVP choice, not a privacy-sensitive production recommendation.
- Provider data policies must be reviewed before production or privacy-sensitive use.

This document does not resolve the project’s broader retention/privacy decision for persisted charge-sheet text.

## Research snapshot

**Research snapshot: 2026-08-29 (accepted production dual-run E2E)**

- A fresh T-001 Case executed on the deployed Render + Supabase + OpenRouter topology.
- `SAME_MODEL` (`minimax/minimax-m3:free` for all seven roles) succeeded with persisted `NOT_JUSTIFIED`. One Judge retried after an upstream 429.
- `MIXED_MODELS` succeeded with persisted `NOT_JUSTIFIED` using the current paid/free assignment, including `openai/gpt-4.1-mini`, `openai/gpt-4.1`, and `meta-llama/llama-4-maverick`.
- Reload reconstructed both Runs from persistence with no additional model calls.
- Provider-reported MIXED cost was `$0.012415312`. Case totals remained incomplete because a failed SAME_MODEL attempt returned no usage.

**Research snapshot: 2026-08-29 (MIXED `JUDGE_1` and `JUDGE_3` revised to paid endpoints after deployed 429s)**

- The MIXED Advocate stage completed successfully in a later deployed Case. SAME_MODEL and all Advocate assignments were not changed.
- MIXED `JUDGE_1` `z-ai/glm-5.2:free` failed both allowed attempts with HTTP 429; OpenRouter reported the free upstream as temporarily rate-limited.
- MIXED `JUDGE_2` `nvidia/nemotron-3-super-120b-a12b:free` succeeded on attempt 1 and remains unchanged.
- MIXED `JUDGE_3` `google/gemma-4-26b-a4b-it:free` failed both allowed attempts with HTTP 429; OpenRouter reported Google AI Studio free upstream as temporarily rate-limited.
- `openai/gpt-4.1` was present with non-zero `pricing.prompt = 0.000002`, `pricing.completion = 0.000008`, `response_format`, `structured_outputs`, ~1M context (1,047,576), and text output. Configured `JSON_SCHEMA`.
- `meta-llama/llama-4-maverick` was present with non-zero `pricing.prompt = 0.0000002`, `pricing.completion = 0.0000008`, `response_format`, `structured_outputs`, 1M context (1,048,576), and text output. Configured `JSON_SCHEMA`.
- Neither replacement is automatic runtime fallback. Cost remains provider-reported and audited.

**Research snapshot: 2026-08-29 (MIXED `DEFENSE_1` revised to paid `openai/gpt-4.1-mini` after GPT-OSS null content)**

- `SAME_MODEL` `minimax/minimax-m3:free` remains a complete successful deployed 7-agent Run and was not changed.
- MIXED `DEFENSE_1` `openai/gpt-oss-120b` failed in a later deployed Case: both allowed attempts returned a normal completion envelope with `message.content = null` and reasoning present. The live catalog marks GPT-OSS as mandatory-reasoning. The parser was not changed to consume reasoning. Removed from primary use; not added to standby.
- `openai/gpt-4.1-mini` was present with non-zero `pricing.prompt = 0.0000004`, `pricing.completion = 0.0000016`, `response_format`, `structured_outputs`, ~1M context (1,047,576), text output, and no catalog reasoning parameters. Configured `JSON_SCHEMA`.

**Research snapshot: 2026-08-29 (MIXED `DEFENSE_1` revised to paid `openai/gpt-oss-120b` after Liquid null content)**

- `SAME_MODEL` `minimax/minimax-m3:free` remains a complete successful deployed 7-agent Run and was not changed.
- MIXED `DEFENSE_1` `liquid/lfm-2.5-2.6b:free` failed in a later deployed Case: both allowed attempts returned a valid completion envelope with `message.content = null`, reasoning present, and no usable assistant JSON. Removed from primary use; not added to standby.
- `openai/gpt-oss-120b` was present in the live catalog with non-zero `pricing.prompt = 0.000000037`, `pricing.completion = 0.00000017`, `response_format`, `structured_outputs`, and 128K context (131,072). Configured `JSON_SCHEMA`.
- The project no longer requires every primary ID to be a `:free` endpoint. Free-configured IDs must still verify as zero-price. Paid IDs must be explicit and catalog-verified.

**Research snapshot: 2026-08-29 (MIXED `DEFENSE_1` revised to Liquid LFM2.5-2.6B after Dots3 HTTP 400)**

- `SAME_MODEL` `minimax/minimax-m3:free` remains a complete successful deployed 7-agent Run and was not changed.
- MIXED `DEFENSE_1` `dots-studio/dots-3-note-preview:free` failed in a later deployed Case with HTTP 400. The free endpoint was also scheduled to expire 2026-09-30. Removed from primary use; not added to standby.
- `liquid/lfm-2.5-2.6b:free` was present in the live catalog with `pricing.prompt = 0`, `pricing.completion = 0`, `response_format`, `structured_outputs`, 64K context (65,536), and no `expiration_date`. Configured `JSON_SCHEMA`. Course/MVP only: prompts/outputs may be retained to train Liquid models.

**Research snapshot: 2026-08-27 (MIXED `DEFENSE_1` revised to Dots3 after second deployed E2E)**

- `SAME_MODEL` `minimax/minimax-m3:free` completed all seven agents on attempt 1.
- MIXED `DEFENSE_1` `nvidia/nemotron-3.5-lightning:free` failed: attempt 1 `TIMEOUT` (90,000 ms), attempt 2 `MALFORMED_JSON`. Demoted to standby.
- Later proposed `:free` IDs `openai/gpt-oss-120b:free` and `qwen/qwen-2.5-7b-instruct:free` were absent from the live catalog and were not selected.
- `dots-studio/dots-3-note-preview:free` was present with `pricing.prompt = 0`, `pricing.completion = 0`, `response_format`, `structured_outputs`, 512K context, and `expiration_date = 2026-09-30`. Configured `JSON_SCHEMA`. Temporary MVP/E2E choice only.

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
- a free-configured ID is no longer listed at zero prompt/completion price;
- a paid-configured ID is absent, becomes unroutable, or no longer lists non-zero pricing;
- availability problems persist after the normal retry policy;
- structured-output behavior is incompatible with the Tribunal contracts;
- contract-validation failure rate is excessive;
- privacy or provider-policy requirements change;
- course requirements change.

A replacement is a new version-controlled configuration. It is not an in-run substitution.
