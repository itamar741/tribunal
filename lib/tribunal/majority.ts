import type { JudgeVerdict } from "../ai/contracts";

/**
 * Two-of-three majority from exactly three validated Judge verdicts.
 * Consumes only verdict values. Does not inspect prose or weight seats.
 */
export function calculateMajority(
  verdicts: readonly [JudgeVerdict, JudgeVerdict, JudgeVerdict],
): JudgeVerdict {
  const justified = verdicts.filter((verdict) => verdict === "JUSTIFIED").length;
  return justified >= 2 ? "JUSTIFIED" : "NOT_JUSTIFIED";
}
