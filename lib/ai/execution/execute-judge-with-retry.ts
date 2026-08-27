import { AttemptErrorType } from "./errors";
import {
  executeJudgeAttempt,
  type ExecuteJudgeAttemptDeps,
  type ExecuteJudgeAttemptInput,
  type JudgeAttemptResult,
} from "./execute-judge-attempt";
import {
  classifyRetry,
  defaultSleep,
  type RetryDecision,
} from "./retryability";
import type { SleepFn } from "./execute-representative-with-retry";
import type { JudgeResponse } from "../contracts";

export type ExecuteJudgeWithRetryInput = Omit<
  ExecuteJudgeAttemptInput,
  "attempt" | "includeOutputContractCorrection"
>;

export type ExecuteJudgeWithRetryDeps = ExecuteJudgeAttemptDeps & {
  sleep?: SleepFn;
};

export type JudgeRetryReport = {
  decided: boolean;
  reason: RetryDecision["reason"] | null;
  delayMs: number | null;
};

export type JudgeExecutionSuccess = {
  ok: true;
  response: JudgeResponse;
  successfulAttempt: 1 | 2;
  attemptsMade: 1 | 2;
  attempts: JudgeAttemptResult[];
  model: string;
  retry: JudgeRetryReport;
};

export type JudgeExecutionFailure = {
  ok: false;
  errorType: string;
  errorMessage: string;
  attemptsMade: 0 | 1 | 2;
  attempts: JudgeAttemptResult[];
  model: string | null;
  retry: JudgeRetryReport;
};

export type JudgeExecutionResult = JudgeExecutionSuccess | JudgeExecutionFailure;

function configurationFailure(error: unknown): JudgeExecutionFailure {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Invalid judge execution configuration.";
  return {
    ok: false,
    errorType: AttemptErrorType.INVALID_CONFIGURATION,
    errorMessage,
    attemptsMade: 0,
    attempts: [],
    model: null,
    retry: {
      decided: false,
      reason: "INVALID_CONFIGURATION",
      delayMs: null,
    },
  };
}

function failureFromAttempt(
  attempts: JudgeAttemptResult[],
  retry: JudgeRetryReport,
): JudgeExecutionFailure {
  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    errorType: last?.failure?.errorType ?? last?.record.errorType ?? "UNKNOWN",
    errorMessage:
      last?.failure?.errorMessage ??
      last?.record.errorMessage ??
      "Judge execution failed.",
    attemptsMade: attempts.length as 1 | 2,
    attempts,
    model: last?.record.model ?? null,
    retry,
  };
}

/**
 * Execute one Judge with at most two attempts.
 * Does not mark the Tribunal Run RUNNING, SUCCEEDED, or FAILED.
 */
export async function executeJudgeWithRetry(
  input: ExecuteJudgeWithRetryInput,
  deps: ExecuteJudgeWithRetryDeps,
): Promise<JudgeExecutionResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const noRetry: JudgeRetryReport = {
    decided: false,
    reason: null,
    delayMs: null,
  };

  let first: JudgeAttemptResult;
  try {
    first = await executeJudgeAttempt(
      {
        ...input,
        attempt: 1,
        includeOutputContractCorrection: false,
      },
      deps,
    );
  } catch (error) {
    return configurationFailure(error);
  }

  if (first.response) {
    return {
      ok: true,
      response: first.response,
      successfulAttempt: 1,
      attemptsMade: 1,
      attempts: [first],
      model: first.record.model,
      retry: noRetry,
    };
  }

  const decision = classifyRetry(
    {
      errorType:
        first.failure?.errorType ??
        first.record.errorType ??
        AttemptErrorType.INVALID_CONFIGURATION,
      httpStatus: first.failure?.httpStatus ?? null,
      retryAfterHeader: first.failure?.retryAfterHeader ?? null,
    },
    { now: deps.now },
  );

  if (!decision.retryable) {
    return failureFromAttempt([first], {
      decided: false,
      reason: decision.reason,
      delayMs: null,
    });
  }

  const retryReport: JudgeRetryReport = {
    decided: true,
    reason: decision.reason,
    delayMs: decision.delayMs,
  };

  if (decision.delayMs > 0) {
    await sleep(decision.delayMs);
  }

  let second: JudgeAttemptResult;
  try {
    second = await executeJudgeAttempt(
      {
        ...input,
        attempt: 2,
        includeOutputContractCorrection: decision.usesOutputContractCorrection,
      },
      deps,
    );
  } catch (error) {
    return {
      ...configurationFailure(error),
      attemptsMade: 1,
      attempts: [first],
      model: first.record.model,
      retry: retryReport,
    };
  }

  if (second.response) {
    return {
      ok: true,
      response: second.response,
      successfulAttempt: 2,
      attemptsMade: 2,
      attempts: [first, second],
      model: second.record.model,
      retry: retryReport,
    };
  }

  return failureFromAttempt([first, second], retryReport);
}
