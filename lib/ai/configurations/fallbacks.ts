import { TribunalAgentRole } from "../profiles";
import { TribunalRunKind } from "./run-kinds";
import { STANDBY_MODEL_IDS, type OpenRouterModelId } from "./models";

/**
 * Select only from the version-controlled standby list.  The caller supplies
 * all models already active in the mixed run, including any fallback chosen
 * earlier in the same stage, so a fallback never duplicates an active seat.
 */
export function selectMixedFallbackModel(
  role: TribunalAgentRole,
  activeModels: readonly string[],
): OpenRouterModelId | null {
  if (!Object.values(TribunalAgentRole).includes(role)) {
    throw new Error(`Invalid Tribunal agent role: ${String(role)}`);
  }
  return (
    STANDBY_MODEL_IDS.find((modelId) => !activeModels.includes(modelId)) ??
    null
  );
}

export function mayUseFallback(runKind: TribunalRunKind): boolean {
  return runKind === TribunalRunKind.MIXED_MODELS;
}
