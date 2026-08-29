/**
 * Server-only HTTP application boundary for Tribunal execution
 * and persisted Case results. Does not own orchestration or
 * accounting logic.
 */

export { handleExecuteCase } from "./execute-case";
export type { ExecuteCaseDeps } from "./execute-case";
export { handleGetCaseResults } from "./get-case-results";
export type {
  GetCaseResultsHttpDeps,
  PublicCaseResultsBody,
} from "./get-case-results";
export { handleListRecentCases } from "./list-recent-cases";
export type {
  ListRecentCasesHttpDeps,
  PublicRecentCase,
  PublicRecentCasesBody,
} from "./list-recent-cases";
export { apiError, internalError } from "./http";
export type { ApiErrorBody, ApiJsonResult } from "./http";
export type {
  PublicExecutionBody,
  PublicExecutionRunFailure,
  PublicExecutionSuccess,
  PublicRunExecution,
} from "./public-execution";
export type { PublicCaseResults } from "./public-results";
