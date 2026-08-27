/**
 * Server-only representative execution.
 *
 * One-attempt and bounded two-attempt helpers. Does not orchestrate
 * the full Advocate stage, judges, majority, or dual runs. Does not
 * mark a Tribunal Run SUCCEEDED or FAILED.
 */

export { executeRepresentativeAttempt } from "./execute-representative-attempt";
export type {
  ChatCompletionsPort,
  ExecuteRepresentativeAttemptDeps,
  ExecuteRepresentativeAttemptInput,
  RepresentativeAttemptFailure,
  RepresentativeAttemptResult,
  RepresentativeAttemptRunRepository,
} from "./execute-representative-attempt";
export { executeRepresentativeWithRetry } from "./execute-representative-with-retry";
export type {
  ExecuteRepresentativeWithRetryDeps,
  ExecuteRepresentativeWithRetryInput,
  RepresentativeExecutionFailure,
  RepresentativeExecutionResult,
  RepresentativeExecutionSuccess,
  RepresentativeRetryReport,
  SleepFn,
} from "./execute-representative-with-retry";
export { AttemptErrorType } from "./errors";
export { parseAdvocateResponse } from "./parse-advocate-response";
export type { AdvocateParseResult } from "./parse-advocate-response";
export {
  MAX_RETRY_DELAY_MS,
  RATE_LIMIT_DEFAULT_DELAY_MS,
  TRANSIENT_RETRY_DELAY_MS,
  RetryReason,
  classifyRetry,
  defaultSleep,
  parseRetryAfterMs,
} from "./retryability";
export type {
  RetryClassificationInput,
  RetryDecision,
} from "./retryability";
