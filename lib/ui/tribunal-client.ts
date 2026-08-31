import type {
  ApiErrorResponse,
  CaseResultsResponse,
  ExecuteRunFailureResponse,
  ExecuteSuccessResponse,
  RecentCasesResponse,
  UploadSuccessResponse,
} from "./types";
import { readLiveExecution, type LiveExecutionProgressHandler } from "./live-execution";

export type ClientResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; error: string; code?: string };

async function readJson(
  response: Response,
): Promise<unknown> {
  return response.json();
}

function errorFrom(
  status: number,
  payload: unknown,
  fallback: string,
): ClientResult<never> {
  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === false &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    const body = payload as ApiErrorResponse;
    return {
      ok: false,
      status,
      error: body.error,
      code: body.code,
    };
  }
  return { ok: false, status, error: fallback };
}

export async function uploadChargeSheet(
  file: File,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<UploadSuccessResponse>> {
  const body = new FormData();
  body.append("chargeSheet", file);
  const response = await fetchImpl("/api/charge-sheet", {
    method: "POST",
    body,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload || typeof payload !== "object" || !("ok" in payload) || !payload.ok) {
    return errorFrom(response.status, payload, "Charge sheet upload failed.");
  }
  return {
    ok: true,
    status: response.status,
    body: payload as UploadSuccessResponse,
  };
}

export async function executeCase(
  caseId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  ClientResult<ExecuteSuccessResponse | ExecuteRunFailureResponse>
> {
  const response = await fetchImpl(`/api/cases/${caseId}/execute`, {
    method: "POST",
  });
  const payload = await readJson(response);
  if (
    response.ok &&
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    "caseId" in payload
  ) {
    return {
      ok: true,
      status: response.status,
      body: payload as ExecuteSuccessResponse | ExecuteRunFailureResponse,
    };
  }
  return errorFrom(
    response.status,
    payload,
    "The Tribunal could not be started.",
  );
}

function completionResult(
  completion: { status: number; body: unknown } | null,
  fallback: string,
): ClientResult<ExecuteSuccessResponse | ExecuteRunFailureResponse> {
  if (!completion) {
    return { ok: false, status: 502, error: fallback };
  }
  const { status, body: payload } = completion;
  if (
    status >= 200 &&
    status < 300 &&
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    "caseId" in payload
  ) {
    return {
      ok: true,
      status,
      body: payload as ExecuteSuccessResponse | ExecuteRunFailureResponse,
    };
  }
  return errorFrom(status, payload, fallback);
}

export async function executeCaseWithLiveProgress(
  caseId: string,
  onProgress: LiveExecutionProgressHandler,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<ExecuteSuccessResponse | ExecuteRunFailureResponse>> {
  return completionResult(
    await readLiveExecution(`/api/cases/${encodeURIComponent(caseId)}/execute`, onProgress, fetchImpl),
    "The Tribunal could not be started.",
  );
}

export async function resumeRunWithLiveProgress(
  caseId: string,
  runId: string,
  onProgress: LiveExecutionProgressHandler,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<{ ok: boolean; runId?: string; status?: "SUCCEEDED" | "FAILED" }>> {
  const completion = await readLiveExecution(
    `/api/cases/${encodeURIComponent(caseId)}/runs/${encodeURIComponent(runId)}/resume`,
    onProgress,
    fetchImpl,
  );
  if (!completion) return { ok: false, status: 502, error: "The recovery request could not be completed." };
  if (completion.status >= 200 && completion.status < 300 && completion.body && typeof completion.body === "object" && "ok" in completion.body) {
    return { ok: true, status: completion.status, body: completion.body as { ok: boolean; runId?: string; status?: "SUCCEEDED" | "FAILED" } };
  }
  return errorFrom(completion.status, completion.body, "This Run could not be resumed.");
}

export async function getCaseResults(
  caseId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<CaseResultsResponse>> {
  const response = await fetchImpl(`/api/cases/${caseId}/results`);
  const payload = await readJson(response);
  if (
    response.ok &&
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === true
  ) {
    return {
      ok: true,
      status: response.status,
      body: payload as CaseResultsResponse,
    };
  }
  return errorFrom(
    response.status,
    payload,
    "Persisted Case results could not be loaded.",
  );
}

/**
 * After a completed execute request (success or RUN_FAILURE),
 * load persisted results. Does not send models, profiles, or verdicts.
 */
export async function loadPersistedResultsAfterExecution(
  caseId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<CaseResultsResponse>> {
  return getCaseResults(caseId, fetchImpl);
}

/**
 * Homepage convenience list. Read-only; does not execute a Case.
 */
export async function getRecentCases(
  fetchImpl: typeof fetch = fetch,
): Promise<ClientResult<RecentCasesResponse>> {
  const response = await fetchImpl("/api/cases/recent");
  const payload = await readJson(response);
  if (
    response.ok &&
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === true &&
    "cases" in payload &&
    Array.isArray(payload.cases)
  ) {
    return {
      ok: true,
      status: response.status,
      body: payload as RecentCasesResponse,
    };
  }
  return errorFrom(
    response.status,
    payload,
    "Recent Cases could not be loaded.",
  );
}
