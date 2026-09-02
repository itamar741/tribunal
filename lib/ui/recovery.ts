export type RecoveryRunView = {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  recoveryCycle?: number;
  attempts: readonly { status: "SUCCEEDED" | "FAILED" }[];
};

/** A concise, truthful outcome summary; detailed provenance stays in the record. */
export function recoverySummary(run: RecoveryRunView): string | null {
  if (run.status !== "SUCCEEDED") {
    return null;
  }

  const failedAttempts = run.attempts.filter(
    (attempt) => attempt.status === "FAILED",
  ).length;
  if (failedAttempts === 0) {
    return null;
  }

  const attemptLabel = `${failedAttempts} failed ${
    failedAttempts === 1 ? "attempt" : "attempts"
  }`;
  if ((run.recoveryCycle ?? 1) > 1) {
    return `Recovered in recovery cycle ${run.recoveryCycle} after ${attemptLabel}.`;
  }
  return `Recovered after ${attemptLabel}.`;
}
