import { getOpenRouterApiKey } from "../ai/openrouter";
import { isCaseId } from "../cases";
import type { CaseRecord, CaseRepository } from "../cases";
import { isDatabaseUnavailableError } from "../db";
import type {
  CaseTribunalResult,
  ExecuteCaseTribunalsInput,
} from "../tribunal";
import {
  apiError,
  internalError,
  OPENROUTER_UNAVAILABLE_MESSAGE,
  type ApiJsonResult,
} from "./http";
import { toPublicExecution, type PublicExecutionBody } from "./public-execution";

export type ExecuteCaseDeps = {
  cases: Pick<CaseRepository, "getById">;
  getApiKey?: () => string | null;
  execute: (input: ExecuteCaseTribunalsInput) => Promise<CaseTribunalResult>;
};

/**
 * HTTP 200 is used for every completed Tribunal execution request,
 * including partial and total Run failure. The body is authoritative:
 * `ok: true` only when both Runs succeeded. Provider/model failures
 * are execution outcomes, not HTTP-infrastructure failures.
 */
export async function handleExecuteCase(
  caseId: string,
  deps: ExecuteCaseDeps,
): Promise<ApiJsonResult<PublicExecutionBody>> {
  if (!isCaseId(caseId)) {
    return apiError(400, "INVALID_CASE_ID", "The Case ID is not valid.");
  }

  const getApiKey = deps.getApiKey ?? getOpenRouterApiKey;

  let record: CaseRecord | null;
  try {
    record = await deps.cases.getById(caseId);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return apiError(503, "DATABASE_UNAVAILABLE", "The database is unavailable.");
    }
    return internalError();
  }

  if (!record) {
    return apiError(404, "CASE_NOT_FOUND", "No Case exists for that ID.");
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return apiError(503, "OPENROUTER_UNAVAILABLE", OPENROUTER_UNAVAILABLE_MESSAGE);
  }

  let result: CaseTribunalResult;
  try {
    result = await deps.execute({
      caseId: record.id,
      chargeSheetMarkdown: record.chargeSheetText,
      apiKey,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return apiError(503, "DATABASE_UNAVAILABLE", "The database is unavailable.");
    }
    return internalError();
  }

  if (!result.ok && result.reason === "CASE_NOT_FOUND") {
    return apiError(404, "CASE_NOT_FOUND", "No Case exists for that ID.");
  }
  if (!result.ok && result.reason === "INVALID_TOPOLOGY") {
    return apiError(
      409,
      "INVALID_TOPOLOGY",
      "The Case does not have a valid Tribunal Run graph.",
    );
  }
  if (result.ok || result.reason === "RUN_FAILURE") {
    return {
      status: 200,
      body: toPublicExecution(record.id, result),
    };
  }

  return internalError();
}
