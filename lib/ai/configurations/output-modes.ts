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
  "z-ai/glm-5.2:free": ModelOutputMode.JSON_SCHEMA,
  "openai/gpt-4.1-mini": ModelOutputMode.JSON_SCHEMA,
  "nvidia/nemotron-3-super-120b-a12b:free": ModelOutputMode.JSON_SCHEMA,
  "minimax/minimax-m2.7:free": ModelOutputMode.JSON_OBJECT,
  "google/gemma-4-31b-it:free": ModelOutputMode.JSON_OBJECT,
  "minimax/minimax-m3:free": ModelOutputMode.JSON_OBJECT,
  "google/gemma-4-26b-a4b-it:free": ModelOutputMode.JSON_OBJECT,
  "nvidia/nemotron-3.5-lightning:free": ModelOutputMode.PROMPT_ONLY,
  "nvidia/nemotron-3-ultra-550b-a55b:free": ModelOutputMode.PROMPT_ONLY,
  "poolside/laguna-s-2.1:free": ModelOutputMode.PROMPT_ONLY,
  "thinkingmachines/inkling-small:free": ModelOutputMode.PROMPT_ONLY,
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
