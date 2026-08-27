import { AttemptErrorType } from "./errors";
import {
  executeRepresentativeAttempt,
  type ExecuteRepresentativeAttemptDeps,
  type ExecuteRepresentativeAttemptInput,
  type RepresentativeAttemptResult,
} from "./execute-representative-attempt";
import {
  classifyRetry,
  defaultSleep,
  type RetryDecision,
} from "./retryability";
import type { AdvocateResponse } from "../contracts";

export type SleepFn = (ms: number) => Promise<void>;

export type ExecuteRepresentativeWithRetryInput = Omit<
  ExecuteRepresentativeAttemptInput,
  "attempt" | "includeOutputContractCorrection"
>;

export type ExecuteRepresentativeWithRetryDeps = ExecuteRepresentativeAttemptDeps & {
  sleep?: SleepFn;
};

export type RepresentativeRetryReport = {
  decided: boolean;
  reason: RetryDecision["reason"] | null;
  delayMs: number | null;
};

export type RepresentativeExecutionSuccess = {
  ok: true;
  response: AdvocateResponse;
  successfulAttempt: 1 | 2;
  attemptsMade: 1 | 2;
  attempts: RepresentativeAttemptResult[];
  model: string;
  retry: RepresentativeRetryReport;
};

export type RepresentativeExecutionFailure = {
  ok: false;
  errorType: string;
  errorMessage: string;
  attemptsMade: 0 | 1 | 2;
  attempts: RepresentativeAttemptResult[];
  model: string | null;
  retry: RepresentativeRetryReport;
};

export type RepresentativeExecutionResult =
  | RepresentativeExecutionSuccess
  | RepresentativeExecutionFailure;

function configurationFailure(
  error: unknown,
): RepresentativeExecutionFailure {
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Invalid representative execution configuration.";
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
  attempts: RepresentativeAttemptResult[],
  retry: RepresentativeRetryReport,
): RepresentativeExecutionFailure {
  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    errorType: last?.failure?.errorType ?? last?.record.errorType ?? "UNKNOWN",
    errorMessage:
      last?.failure?.errorMessage ??
      last?.record.errorMessage ??
      "Representative execution failed.",
    attemptsMade: attempts.length as 1 | 2,
    attempts,
    model: last?.record.model ?? null,
    retry,
  };
}

/**
 * Execute one representative with at most two attempts.
 *
 * Marks the Tribunal Run RUNNING on attempt 1. Does not mark the run
 * SUCCEEDED or FAILED — a later stage coordinator owns run completion.
 */
export async function executeRepresentativeWithRetry(
  input: ExecuteRepresentativeWithRetryInput,
  deps: ExecuteRepresentativeWithRetryDeps,
): Promise<RepresentativeExecutionResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const noRetry: RepresentativeRetryReport = {
    decided: false,
    reason: null,
    delayMs: null,
  };

  let first: RepresentativeAttemptResult;
  try {
    first = await executeRepresentativeAttempt(
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

  const retryReport: RepresentativeRetryReport = {
    decided: true,
    reason: decision.reason,
    delayMs: decision.delayMs,
  };

  if (decision.delayMs > 0) {
    await sleep(decision.delayMs);
  }

  let second: RepresentativeAttemptResult;
  try {
    second = await executeRepresentativeAttempt(
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
