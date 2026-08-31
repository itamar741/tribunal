import {
  MIXED_MODELS_BY_ROLE,
  SAME_MODEL_ID,
  STANDBY_MODEL_IDS,
  type OpenRouterModelId,
} from "./models";

/**
 * Version-controlled structured-output strategy.
 *
 * Derived from a dated OpenRouter catalog snapshot, not probed at
 * runtime. Recheck `/api/v1/models` when model IDs change.
 * Zod remains the trust boundary in every mode.
 */
export const ModelOutputMode = {
  JSON_SCHEMA: "JSON_SCHEMA",
  JSON_OBJECT: "JSON_OBJECT",
  PROMPT_ONLY: "PROMPT_ONLY",
} as const;

export type ModelOutputMode =
  (typeof ModelOutputMode)[keyof typeof ModelOutputMode];

export const MODEL_OUTPUT_MODES = {
  "openai/gpt-4.1": ModelOutputMode.JSON_SCHEMA,
  "openai/gpt-4.1-mini": ModelOutputMode.JSON_SCHEMA,
  "meta-llama/llama-4-maverick": ModelOutputMode.JSON_SCHEMA,
  "mistralai/mistral-small-3.2-24b-instruct": ModelOutputMode.JSON_SCHEMA,
  "qwen/qwen3-30b-a3b-instruct-2507": ModelOutputMode.JSON_SCHEMA,
  "nvidia/nemotron-3-super-120b-a12b:free": ModelOutputMode.JSON_SCHEMA,
  "google/gemma-4-31b-it:free": ModelOutputMode.JSON_OBJECT,
  "cohere/north-mini-code:free": ModelOutputMode.PROMPT_ONLY,
  "minimax/minimax-m3:free": ModelOutputMode.JSON_OBJECT,
  "nvidia/nemotron-3.5-lightning:free": ModelOutputMode.PROMPT_ONLY,
  "inclusionai/ling-3.0-flash-fin:free": ModelOutputMode.PROMPT_ONLY,
  "z-ai/glm-5.2:free": ModelOutputMode.JSON_SCHEMA,
  "google/gemma-4-26b-a4b-it:free": ModelOutputMode.JSON_OBJECT,
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": ModelOutputMode.PROMPT_ONLY,
} as const satisfies Record<string, ModelOutputMode>;

export function listConfiguredModelIds(): readonly OpenRouterModelId[] {
  return [
    SAME_MODEL_ID,
    ...Object.values(MIXED_MODELS_BY_ROLE),
    ...STANDBY_MODEL_IDS,
  ];
}

export function getOutputModeForModel(modelId: string): ModelOutputMode {
  const mode =
    MODEL_OUTPUT_MODES[modelId as keyof typeof MODEL_OUTPUT_MODES];
  if (!mode) {
    throw new Error(`No output mode configured for model: ${modelId}`);
  }
  return mode;
}
