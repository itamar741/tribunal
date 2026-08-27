import { TribunalAgentRole } from "../profiles";
import { TribunalRunKind } from "./run-kinds";

/**
 * Version-controlled OpenRouter model assignment.
 *
 * Model IDs live here only — not in profiles, prompt builders,
 * response contracts, or UI. Role resolution never consults the
 * standby pool and never uses OpenRouter's `openrouter/free` router
 * or cross-model `models` fallback array.
 *
 * Canonical rationale: docs/model-selection.md
 */

export const SAME_MODEL_ID = "minimax/minimax-m3:free";

export const SAME_MODEL_BY_ROLE = {
  [TribunalAgentRole.DEFENSE_1]: SAME_MODEL_ID,
  [TribunalAgentRole.DEFENSE_2]: SAME_MODEL_ID,
  [TribunalAgentRole.PROSECUTION_1]: SAME_MODEL_ID,
  [TribunalAgentRole.PROSECUTION_2]: SAME_MODEL_ID,
  [TribunalAgentRole.JUDGE_1]: SAME_MODEL_ID,
  [TribunalAgentRole.JUDGE_2]: SAME_MODEL_ID,
  [TribunalAgentRole.JUDGE_3]: SAME_MODEL_ID,
} as const satisfies Record<TribunalAgentRole, typeof SAME_MODEL_ID>;

export const MIXED_MODELS_BY_ROLE = {
  [TribunalAgentRole.DEFENSE_1]: "thinkingmachines/inkling:free",
  [TribunalAgentRole.DEFENSE_2]: "minimax/minimax-m2.7:free",
  [TribunalAgentRole.PROSECUTION_1]: "google/gemma-4-31b-it:free",
  [TribunalAgentRole.PROSECUTION_2]: "minimax/minimax-m3:free",
  [TribunalAgentRole.JUDGE_1]: "z-ai/glm-5.2:free",
  [TribunalAgentRole.JUDGE_2]: "nvidia/nemotron-3-super-120b-a12b:free",
  [TribunalAgentRole.JUDGE_3]: "google/gemma-4-26b-a4b-it:free",
} as const;

/**
 * Approved emergency candidates for an explicit future configuration
 * change. Not consulted by role resolution.
 */
export const STANDBY_MODEL_IDS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "poolside/laguna-s-2.1:free",
  "thinkingmachines/inkling-small:free",
] as const;

export type OpenRouterModelId =
  | typeof SAME_MODEL_ID
  | (typeof MIXED_MODELS_BY_ROLE)[TribunalAgentRole]
  | (typeof STANDBY_MODEL_IDS)[number];

export type RoleModelAssignment = {
  readonly [Role in TribunalAgentRole]: OpenRouterModelId;
};

export const ROLE_MODEL_ASSIGNMENTS = {
  [TribunalRunKind.SAME_MODEL]: SAME_MODEL_BY_ROLE,
  [TribunalRunKind.MIXED_MODELS]: MIXED_MODELS_BY_ROLE,
} as const satisfies Record<TribunalRunKind, RoleModelAssignment>;

export function getModelIdForRole(
  runKind: TribunalRunKind,
  role: TribunalAgentRole,
): OpenRouterModelId {
  const assignment = ROLE_MODEL_ASSIGNMENTS[runKind];
  if (!assignment) {
    throw new Error(`Unknown Tribunal run kind: ${String(runKind)}`);
  }

  const modelId = assignment[role];
  if (!modelId) {
    throw new Error(
      `No model configured for ${runKind} role ${String(role)}`,
    );
  }

  return modelId;
}

export function getRoleModelAssignment(
  runKind: TribunalRunKind,
): RoleModelAssignment {
  const assignment = ROLE_MODEL_ASSIGNMENTS[runKind];
  if (!assignment) {
    throw new Error(`Unknown Tribunal run kind: ${String(runKind)}`);
  }
  return assignment;
}

export function listStandbyModelIds(): readonly OpenRouterModelId[] {
  return STANDBY_MODEL_IDS;
}
