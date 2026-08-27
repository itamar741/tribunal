import { sanitizeOpenRouterErrorText } from "../ai/openrouter";
import type { TribunalRunKind } from "../ai/configurations";
import type {
  CaseTribunalRunFailure,
  CaseTribunalRunResult,
  CaseTribunalSuccess,
} from "../tribunal";

export type PublicRunExecutionSuccess = {
  ok: true;
  finalVerdict: Extract<CaseTribunalRunResult, { ok: true }>["finalVerdict"];
  advocates: Extract<CaseTribunalRunResult, { ok: true }>["advocates"];
  advocateAgents: Extract<CaseTribunalRunResult, { ok: true }>["advocateAgents"];
  judges: Extract<CaseTribunalRunResult, { ok: true }>["judges"];
  judgeAgents: Extract<CaseTribunalRunResult, { ok: true }>["judgeAgents"];
};

export type PublicRunExecutionFailure = {
  ok: false;
  failedStage: "ADVOCATES" | "JUDGES" | "RUN";
  reason?: "NOT_PENDING" | "UNEXPECTED";
  errorMessage?: string;
  failedRoles?: string[];
  failures?: Array<{
    role: string;
    errorType: string;
    errorMessage: string;
    attemptsMade: 0 | 1 | 2;
  }>;
};

export type PublicRunExecution = PublicRunExecutionSuccess | PublicRunExecutionFailure;

export type PublicExecutionSuccess = {
  ok: true;
  caseId: string;
  runs: {
    readonly [TribunalRunKind.SAME_MODEL]: PublicRunExecutionSuccess;
    readonly [TribunalRunKind.MIXED_MODELS]: PublicRunExecutionSuccess;
  };
};

export type PublicExecutionRunFailure = {
  ok: false;
  reason: "RUN_FAILURE";
  caseId: string;
  runs: {
    readonly [TribunalRunKind.SAME_MODEL]: PublicRunExecution;
    readonly [TribunalRunKind.MIXED_MODELS]: PublicRunExecution;
  };
};

export type PublicExecutionBody = PublicExecutionSuccess | PublicExecutionRunFailure;

function sanitizeFailureMessage(message: string): string {
  return sanitizeOpenRouterErrorText(message);
}

function toPublicRun(result: CaseTribunalRunResult): PublicRunExecution {
  if (result.ok) {
    return {
      ok: true,
      finalVerdict: result.finalVerdict,
      advocates: result.advocates,
      advocateAgents: result.advocateAgents,
      judges: result.judges,
      judgeAgents: result.judgeAgents,
    };
  }

  if (result.failedStage === "RUN") {
    return {
      ok: false,
      failedStage: "RUN",
      reason: result.reason,
      errorMessage: sanitizeFailureMessage(result.errorMessage),
    };
  }

  return {
    ok: false,
    failedStage: result.failedStage,
    failedRoles: [...result.failedRoles],
    failures: result.failures.map((failure) => ({
      role: failure.role,
      errorType: failure.errorType,
      errorMessage: sanitizeFailureMessage(failure.errorMessage),
      attemptsMade: failure.attemptsMade,
    })),
  };
}

export function toPublicExecution(
  caseId: string,
  result: CaseTribunalSuccess | CaseTribunalRunFailure,
): PublicExecutionBody {
  if (result.ok) {
    return {
      ok: true,
      caseId,
      runs: {
        SAME_MODEL: toPublicRun(result.runs.SAME_MODEL) as PublicRunExecutionSuccess,
        MIXED_MODELS: toPublicRun(result.runs.MIXED_MODELS) as PublicRunExecutionSuccess,
      },
    };
  }

  return {
    ok: false,
    reason: "RUN_FAILURE",
    caseId,
    runs: {
      SAME_MODEL: toPublicRun(result.runs.SAME_MODEL),
      MIXED_MODELS: toPublicRun(result.runs.MIXED_MODELS),
    },
  };
}
