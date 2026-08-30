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

/**
 * Explicitly paid catalog IDs. Every other configured primary and
 * standby ID must remain a zero-price endpoint.
 */
export const EXPLICITLY_PAID_MODEL_IDS = [
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1",
  "meta-llama/llama-4-maverick",
] as const;

export function isExplicitlyPaidModelId(modelId: string): boolean {
  return (EXPLICITLY_PAID_MODEL_IDS as readonly string[]).includes(modelId);
}

export const MIXED_MODELS_BY_ROLE = {
  [TribunalAgentRole.DEFENSE_1]: "openai/gpt-4.1-mini",
  [TribunalAgentRole.DEFENSE_2]: "minimax/minimax-m2.7:free",
  [TribunalAgentRole.PROSECUTION_1]: "nvidia/nemotron-3-ultra-550b-a55b:free",
  [TribunalAgentRole.PROSECUTION_2]: "minimax/minimax-m3:free",
  [TribunalAgentRole.JUDGE_1]: "openai/gpt-4.1",
  [TribunalAgentRole.JUDGE_2]: "nvidia/nemotron-3-super-120b-a12b:free",
  [TribunalAgentRole.JUDGE_3]: "meta-llama/llama-4-maverick",
} as const;

/**
 * Approved emergency candidates for an explicit future configuration
 * change. Not consulted by role resolution.
 */
export const STANDBY_MODEL_IDS = [
  "google/gemma-4-31b-it:free",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3.5-lightning:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "z-ai/glm-5.2:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
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
