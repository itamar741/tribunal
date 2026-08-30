/**
 * Server-only representative and Judge execution helpers.
 *
 * One-attempt and bounded two-attempt helpers. Stage coordinators
 * live under lib/tribunal. These helpers do not run majority or dual
 * runs, and do not mark a Tribunal Run SUCCEEDED or FAILED.
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
export { executeJudgeAttempt } from "./execute-judge-attempt";
export type {
  ExecuteJudgeAttemptDeps,
  ExecuteJudgeAttemptInput,
  JudgeAttemptFailure,
  JudgeAttemptResult,
} from "./execute-judge-attempt";
export { executeJudgeWithRetry } from "./execute-judge-with-retry";
export type {
  ExecuteJudgeWithRetryDeps,
  ExecuteJudgeWithRetryInput,
  JudgeExecutionFailure,
  JudgeExecutionResult,
  JudgeExecutionSuccess,
  JudgeRetryReport,
} from "./execute-judge-with-retry";
export { AttemptErrorType } from "./errors";
export { FailureClassification, classifyFailure } from "./failure-classification";
export type { FailureClassification as FailureClassificationType } from "./failure-classification";
export { parseAdvocateResponse } from "./parse-advocate-response";
export type { AdvocateParseResult } from "./parse-advocate-response";
export { parseJudgeResponse } from "./parse-judge-response";
export type { JudgeParseResult } from "./parse-judge-response";
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
