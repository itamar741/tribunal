/**
 * Server-only persisted Case results and accounting.
 * Reconstructs outputs and totals from cases, tribunal_runs, and
 * model_calls. Does not execute models.
 */

export { sumCosts, sumUsage } from "./accounting";
export type {
  AggregatedCost,
  AggregatedInt,
  AggregatedMetric,
  UsageTotals,
} from "./accounting";
export { getCaseResults } from "./get-case-results";
export type {
  GetCaseResultsDeps,
  GetCaseResultsFailure,
  GetCaseResultsInput,
  GetCaseResultsResult,
  GetCaseResultsSuccess,
} from "./get-case-results";
export {
  DEFAULT_RECENT_EXECUTED_CASE_LIMIT,
  listRecentExecutedCases,
} from "./list-recent-executed-cases";
export type {
  ListRecentExecutedCasesDeps,
  ListRecentExecutedCasesInput,
  ListRecentExecutedCasesSource,
  RecentExecutedCase,
  RecentExecutedCaseRow,
} from "./list-recent-executed-cases";
export type {
  CaseResults,
  ModelCallAttemptView,
  RunAccounting,
  RunResults,
} from "./types";
