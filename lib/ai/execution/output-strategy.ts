import {
  ModelOutputMode,
  getOutputModeForModel,
} from "../configurations";
import {
  OpenRouterOutputMode,
  type OpenRouterJsonSchemaFormat,
  type OpenRouterOutputStrategy,
} from "../openrouter";

export function outputStrategyForModel(
  modelId: string,
  jsonSchema: OpenRouterJsonSchemaFormat,
): OpenRouterOutputStrategy {
  const mode = getOutputModeForModel(modelId);
  if (mode === ModelOutputMode.JSON_SCHEMA) {
    return {
      mode: OpenRouterOutputMode.JSON_SCHEMA,
      jsonSchema,
    };
  }
  if (mode === ModelOutputMode.JSON_OBJECT) {
    return { mode: OpenRouterOutputMode.JSON_OBJECT };
  }
  return { mode: OpenRouterOutputMode.PROMPT_ONLY };
}
