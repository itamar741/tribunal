# Model selection — AI Tribunal

This is the canonical rationale for the version-controlled OpenRouter model assignment. Runtime IDs live in `lib/ai/configurations/`. Profiles, prompt builders, response contracts, and UI do not contain model IDs.

The current selection is intentionally **free-first** for the course/MVP.

## Purpose

The project compares two Tribunal Runs that share one procedure and differ only by model assignment:

- **`SAME_MODEL`** — one homogeneous seven-agent Tribunal. Every seat uses the same concrete model ID.
- **`MIXED_MODELS`** — one heterogeneous seven-agent Tribunal. All seven seats use seven distinct concrete model IDs.

The purpose of model selection is therefore not simply to choose the seven strongest available models. The configuration must preserve the experimental distinction between a homogeneous run and a heterogeneous run. Changing a model ID changes that experimental identity and must remain an explicit, auditable configuration change.

## Selection constraints

- **OpenRouter is the AI gateway.** All later model calls go through OpenRouter. This phase records configuration only; it does not make requests.
- **The current MVP uses free endpoints.** Every primary and standby ID ends with `:free`.
- **Concrete model IDs are required** for reproducibility and audit. Each configured seat must name a specific OpenRouter model identity.
- **`openrouter/free` is inappropriate.** That router may choose different models dynamically. A Tribunal Run cannot treat a randomly selected model as a stable experimental condition.
- **Adequate context length is required.** A run later sends the charge sheet, role/profile instructions, the response contract, and — for judges — four validated advocate outputs. The selected windows are larger than those current Tribunal inputs.
- **Instruction following and reasoning matter** for both representative advocacy and judicial-method simulation.
- **Structured-output capability is desirable** because advocate and judge responses have strict Zod contracts.
- **Zod remains authoritative.** Provider-side JSON Schema or JSON mode can reduce malformed output; it does not replace application validation. Extra fields, empty strings, and wrong shapes still fail closed.
- **Model diversity is intentional in `MIXED_MODELS`.** Distinct families and concrete IDs make the heterogeneous Tribunal meaningfully different from `SAME_MODEL`.
- **Free-endpoint availability can change.** OpenRouter’s free catalog and provider coverage are not a stable product contract.

## SAME_MODEL rationale

Invariant:

> Every one of the seven agents in that Tribunal Run must use the same concrete model ID.

Selected ID for all seven roles:

`openai/gpt-oss-120b:free`

This is the selected MVP baseline under the current constraints. It is not claimed to be objectively the best model.

Reasons for this baseline:

- Strong general-reasoning orientation (open-weight gpt-oss 120B-class MoE, designed for high-reasoning and general-purpose use).
- 131K context (131,072 tokens) is more than sufficient for the current Tribunal inputs.
- Free OpenRouter endpoint (`:free`).
- Structured-output / JSON Schema support is advertised for this model family (`structured_outputs` / `response_format`), which is useful for the advocate and judge contracts.
- Using one identical, reasonably capable model across all seven seats gives a fair homogeneous control: differences versus `MIXED_MODELS` can be attributed to model assignment rather than to a weak or inconsistent baseline.

Do not use `openrouter/free` or any other automatic model router for this run.

## MIXED_MODELS rationale

Invariant:

> All seven roles use seven distinct concrete model IDs.

Diversity across model families is deliberate so the heterogeneous Tribunal is meaningfully different from `SAME_MODEL`. One `MIXED_MODELS` seat (`DEFENSE_1`) reuses the `SAME_MODEL` baseline ID; the other six seats use different families or, for Gemma, a different concrete member of that family. The run still satisfies the seven-distinct-IDs invariant.

Provider-side structure is a hint to the gateway, not a substitute for Zod.

| Tribunal role | Concrete model ID | Provider / family | Free | Context size | Structured-output level | Selection rationale / tradeoff |
| --- | --- | --- | --- | --- | --- | --- |
| `DEFENSE_1` | `openai/gpt-oss-120b:free` | OpenAI gpt-oss | `:free` | 131K (131,072) | JSON Schema (`structured_outputs`) | Anchors one mixed seat to the homogeneous baseline so a shared model can be compared in a mixed panel. |
| `DEFENSE_2` | `inclusionai/ling-3.0-flash:free` | InclusionAI Ling 3.0 | `:free` | 256K (262,144) | JSON mode (`response_format`; catalog snapshot did not list `structured_outputs`) | Different open MoE family with a large context; flash/agentic orientation for a second defense voice. Tradeoff: structure is less strictly schema-enforced than gpt-oss. |
| `PROSECUTION_1` | `google/gemma-4-31b-it:free` | Google Gemma 4 (dense 31B) | `:free` | 256K (262,144) | JSON mode on the free variant | Instruction-tuned Gemma 4 with configurable reasoning. Tradeoff: the free endpoint listed `response_format` but not `structured_outputs`; Zod still validates. |
| `PROSECUTION_2` | `minimax/minimax-m3:free` | MiniMax M3 | `:free` | 1M (1,048,576) | JSON mode on the free variant | Distinct vendor and a very large context window. Tradeoff: free-variant catalog listed JSON mode rather than JSON Schema. |
| `JUDGE_1` | `z-ai/glm-5.2:free` | Z.ai GLM 5.2 | `:free` | 256K (256,000) | JSON Schema (`structured_outputs`) | Reasoning-oriented judge seat from a different family; schema support is useful for the verdict contract. Tradeoff: the free window is smaller than the paid GLM 5.2 listing. |
| `JUDGE_2` | `nvidia/nemotron-3-super-120b-a12b:free` | NVIDIA Nemotron 3 Super | `:free` | 256K (262,144) | JSON Schema (`structured_outputs`) | Open hybrid MoE with reasoning and schema support for a second judicial method. Tradeoff: the free window is smaller than the paid Nemotron listing. |
| `JUDGE_3` | `google/gemma-4-26b-a4b-it:free` | Google Gemma 4 (26B A4B MoE) | `:free` | 256K (262,144) | JSON mode on the free variant | Distinct concrete ID from `PROSECUTION_1` (MoE vs dense Gemma 4). Tradeoff: same vendor family appears twice; diversity is still seven IDs and two Gemma architectures, not seven vendors. |

`JSON Schema` means the OpenRouter catalog listed `structured_outputs` (typically `response_format.type = json_schema`). `JSON mode` means `response_format` was listed without `structured_outputs` (JSON object / prompt-adjacent structure). In both cases the application still validates with Zod before treating a response as a valid advocate or judge output.

## Standby pool

Currently approved emergency candidates, in recorded order:

1. `openai/gpt-oss-20b:free` — smaller gpt-oss sibling; 131K context; JSON Schema on the catalog snapshot of the base ID.
2. `nex-agi/nex-n2-pro:free` — distinct Nex AGI / Qwen-family MoE; 256K context; catalog snapshot of the base ID listed neither `response_format` nor `structured_outputs` (prompt-enforced structure only).
3. `minimax/minimax-m2.7:free` — MiniMax sibling of M3; about 192K context on the free variant (196,608 tokens); JSON mode on the free variant.

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

- All currently selected primary and standby IDs use the `:free` suffix.
- While those free endpoints remain available, MVP inference cost is zero.
- Free requests remain subject to OpenRouter limits and availability. Capacity, latency, and rate limits can change without notice.
- Zero price is a current operational property of this course/demo configuration, not a permanent product guarantee.

Do not treat any dated free-tier request quota as an architectural invariant.

## Privacy / provider-policy caveat

Free endpoints can differ from paid endpoints — and from each other — in logging, retention, and data-use policies.

- This model set is appropriate for the current course/demo configuration.
- It must not be interpreted as a privacy guarantee for sensitive production data.
- Provider data policies must be reviewed before production or privacy-sensitive use.

This document does not resolve the project’s broader retention/privacy decision for persisted charge-sheet text.

## Research snapshot

**Research snapshot: 2026-08-26**

The context sizes, free/paid parameter differences, and structured-output levels above were observed from OpenRouter’s public model catalog on that date. They are research notes, not runtime configuration and not architectural invariants.

Observations from that snapshot:

- Several configured IDs appear as first-class `:free` catalog entries (`google/gemma-4-31b-it:free`, `minimax/minimax-m3:free`, `z-ai/glm-5.2:free`, `nvidia/nemotron-3-super-120b-a12b:free`, `google/gemma-4-26b-a4b-it:free`, `minimax/minimax-m2.7:free`).
- Some configured `:free` request IDs were listed only as base IDs in the catalog dump (`openai/gpt-oss-120b`, `inclusionai/ling-3.0-flash`, `openai/gpt-oss-20b`, `nex-agi/nex-n2-pro`). The version-controlled request identity remains the `:free` suffix specified in `lib/ai/configurations/`.
- Free variants sometimes advertised fewer structured-output parameters than the paid sibling of the same model. Application Zod validation is therefore required even when a paid listing shows JSON Schema.
- OpenRouter’s free catalog and provider availability are dynamic. Recheck them before changing or deploying this configuration.

Do not present transient uptime, latency, or daily quota numbers as architectural invariants.

## Replacement criteria

Revisit model selection when any of the following is true:

- a selected model is removed or deprecated;
- the free endpoint is no longer available;
- availability problems persist after the normal retry policy;
- structured-output behavior is incompatible with the Tribunal contracts;
- contract-validation failure rate is excessive;
- privacy or provider-policy requirements change;
- course requirements change.

A replacement is a new version-controlled configuration. It is not an in-run substitution.
