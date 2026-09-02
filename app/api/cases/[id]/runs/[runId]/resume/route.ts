import { NextResponse } from "next/server";
import { acceptsEventStream, streamExecution } from "@/lib/api/server-sent-events";
import { getOpenRouterApiKey } from "@/lib/ai/openrouter";
import {
  isCaseId,
  PostgresCaseRepository,
  PostgresTribunalRunRepository,
  TribunalRunStatus,
} from "@/lib/cases";
import { isDatabaseUnavailableError } from "@/lib/db";
import { PostgresModelCallRepository } from "@/lib/model-calls";
import { getCaseResults } from "@/lib/results";
import { executeTribunalRun, type ModelProgressListener } from "@/lib/tribunal";
import {
  authorizeModelAction,
  PostgresExecutionRateLimitRepository,
  RateLimitConfigError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 800;

type ResumeResult = {
  status: number;
  body: {
    ok: boolean;
    code?: string;
    error?: string;
    retryAfterSeconds?: number;
    runId?: string;
    status?: "SUCCEEDED" | "FAILED";
  };
};

/** Resume exactly one FAILED durable Run. claimResume is conditional, so a
 * concurrent request cannot start a duplicate recovery cycle. */
async function resume(
  id: string,
  runId: string,
  request: Request,
  onProgress?: ModelProgressListener,
): Promise<ResumeResult> {
  if (!isCaseId(id) || !isCaseId(runId)) {
    return { status: 400, body: { ok: false, code: "INVALID_ID", error: "The Case or Run ID is not valid." } };
  }
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return { status: 503, body: { ok: false, code: "OPENROUTER_UNAVAILABLE", error: "Model execution is not configured." } };
  }
  const cases = new PostgresCaseRepository();
  const runs = new PostgresTribunalRunRepository();
  const modelCalls = new PostgresModelCallRepository();
  const record = await cases.getById(id);
  const run = record?.runs.find((item) => item.id === runId);
  if (!record || !run) {
    return { status: 404, body: { ok: false, code: "RUN_NOT_FOUND", error: "No matching Tribunal Run exists." } };
  }
  if (run.status !== TribunalRunStatus.FAILED) {
    return {
      status: 409,
      body: {
        ok: false,
        code: "RUN_NOT_RESUMABLE",
        error: "This Run is no longer available for recovery.",
      },
    };
  }
  try {
    const decision = await authorizeModelAction(
      request,
      new PostgresExecutionRateLimitRepository(),
    );
    if (decision && !decision.allowed) {
      const minutes = Math.max(1, Math.ceil(decision.retryAfterSeconds / 60));
      return {
        status: 429,
        body: {
          ok: false,
          code: "EXECUTION_RATE_LIMITED",
          error: `The chamber has reached its hourly hearing limit. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      };
    }
  } catch (error) {
    if (error instanceof RateLimitConfigError) {
      return {
        status: 503,
        body: {
          ok: false,
          code: "RATE_LIMIT_CONFIGURATION_ERROR",
          error: "The Tribunal cost guard is not configured.",
        },
      };
    }
    if (isDatabaseUnavailableError(error)) {
      return {
        status: 503,
        body: {
          ok: false,
          code: "DATABASE_UNAVAILABLE",
          error: "The Tribunal database is temporarily unavailable.",
        },
      };
    }
    throw error;
  }
  let claimed;
  try {
    claimed = await runs.claimResume(runId);
  } catch {
    return { status: 409, body: { ok: false, code: "RUN_NOT_RESUMABLE", error: "This Run is no longer available for recovery." } };
  }
  const persisted = await getCaseResults({ caseId: id }, { cases, modelCalls });
  if (!persisted.ok) {
    return { status: 409, body: { ok: false, code: "RESULTS_UNAVAILABLE", error: "The persisted Run record could not be recovered." } };
  }
  const prior = persisted.results.runs[run.runType];
  const existingAdvocates = Object.fromEntries(Object.entries(prior.advocates).filter(([, value]) => value != null));
  const existingJudges = Object.fromEntries(Object.entries(prior.judges).filter(([, value]) => value != null));
  const outcome = await executeTribunalRun({
    caseId: id, runId, runKind: run.runType, chargeSheetMarkdown: record.chargeSheetText,
    apiKey, recoveryCycle: claimed.recoveryCycle, skipMarkRunning: true,
    existingAdvocates,
    existingJudges,
  }, { runs, modelCalls, onProgress });
  return { status: 200, body: { ok: outcome.ok, runId, status: outcome.ok ? "SUCCEEDED" : "FAILED" } };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
): Promise<Response> {
  const { id, runId } = await context.params;
  if (acceptsEventStream(request)) {
    return streamExecution((onProgress) => resume(id, runId, request, onProgress));
  }
  const result = await resume(id, runId, request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers:
      result.status === 429 && result.body.retryAfterSeconds
        ? { "Retry-After": String(result.body.retryAfterSeconds) }
        : undefined,
  });
}
