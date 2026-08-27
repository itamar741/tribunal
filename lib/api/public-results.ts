import type { CaseResults, ModelCallAttemptView, RunResults } from "../results";

function iso(value: Date): string;
function iso(value: Date | null): string | null;
function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toPublicAttempt(attempt: ModelCallAttemptView) {
  return {
    ...attempt,
    createdAt: iso(attempt.createdAt),
  };
}

function toPublicRun(run: RunResults) {
  return {
    ...run,
    startedAt: iso(run.startedAt),
    completedAt: iso(run.completedAt),
    attempts: run.attempts.map(toPublicAttempt),
  };
}

export function toPublicCaseResults(results: CaseResults) {
  return {
    case: {
      id: results.case.id,
      originalFileName: results.case.originalFileName,
      createdAt: iso(results.case.createdAt),
    },
    runs: {
      SAME_MODEL: toPublicRun(results.runs.SAME_MODEL),
      MIXED_MODELS: toPublicRun(results.runs.MIXED_MODELS),
    },
    accounting: results.accounting,
  };
}

export type PublicCaseResults = ReturnType<typeof toPublicCaseResults>;
