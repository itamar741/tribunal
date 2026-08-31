import { isCaseId, type CaseRepository } from "../cases";
import { isDatabaseUnavailableError } from "../db";
import { getCaseResults, type GetCaseResultsDeps } from "../results";
import type { ModelCallRepository } from "../model-calls";
import { apiError, internalError, type ApiJsonResult } from "./http";
import { toPublicCaseResults, type PublicCaseResults } from "./public-results";

export type GetCaseResultsHttpDeps = {
  cases: Pick<CaseRepository, "getById">;
  modelCalls: Pick<ModelCallRepository, "listByCaseId">;
  getCaseResults?: typeof getCaseResults;
};

export type PublicCaseResultsBody = {
  ok: true;
} & PublicCaseResults;

/**
 * Read-only HTTP mapping for persisted Case results.
 * Never executes models or mutates Run state.
 */
export async function handleGetCaseResults(
  caseId: string,
  deps: GetCaseResultsHttpDeps,
): Promise<ApiJsonResult<PublicCaseResultsBody>> {
  if (!isCaseId(caseId)) {
    return apiError(400, "INVALID_CASE_ID", "The Case ID is not valid.");
  }

  const load = deps.getCaseResults ?? getCaseResults;

  let result;
  try {
    result = await load(
      { caseId },
      {
        cases: deps.cases,
        modelCalls: deps.modelCalls,
      } satisfies GetCaseResultsDeps,
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return apiError(503, "DATABASE_UNAVAILABLE", "The database is unavailable.");
    }
    return internalError();
  }

  if (!result.ok) {
    if (result.reason === "CASE_NOT_FOUND") {
      return apiError(404, "CASE_NOT_FOUND", "No Case exists for that ID.");
    }
    if (result.reason === "INVALID_TOPOLOGY") {
      return apiError(
        409,
        "INVALID_TOPOLOGY",
        "The Case does not have a valid Tribunal Run graph.",
      );
    }
    return apiError(
      500,
      "INTEGRITY_VIOLATION",
      "Persisted Case results failed integrity validation.",
    );
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...toPublicCaseResults(result.results),
    },
  };
}
