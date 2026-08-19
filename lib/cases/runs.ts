import { TribunalRunKind } from "../ai/configurations";
import type { TribunalRunRecord } from "./types";

export const INITIAL_RUN_TYPES = [
  TribunalRunKind.SAME_MODEL,
  TribunalRunKind.MIXED_MODELS,
] as const;

const RUN_TYPE_ORDER: Record<(typeof INITIAL_RUN_TYPES)[number], number> = {
  [TribunalRunKind.SAME_MODEL]: 0,
  [TribunalRunKind.MIXED_MODELS]: 1,
};

export function sortInitialRuns(
  runs: TribunalRunRecord[],
): TribunalRunRecord[] {
  return [...runs].sort(
    (left, right) =>
      RUN_TYPE_ORDER[left.runType] - RUN_TYPE_ORDER[right.runType],
  );
}

export function hasRequiredRunKinds(runs: TribunalRunRecord[]): boolean {
  if (runs.length !== INITIAL_RUN_TYPES.length) {
    return false;
  }

  const types = new Set(runs.map((run) => run.runType));
  return INITIAL_RUN_TYPES.every((runType) => types.has(runType));
}
