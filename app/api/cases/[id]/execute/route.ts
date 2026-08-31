import { NextResponse } from "next/server";
import { handleExecuteCase } from "@/lib/api";
import { getOpenRouterApiKey } from "@/lib/ai/openrouter";
import { PostgresCaseRepository, PostgresTribunalRunRepository } from "@/lib/cases";
import { PostgresModelCallRepository } from "@/lib/model-calls";
import { executeCaseTribunals } from "@/lib/tribunal";
import { acceptsEventStream, streamExecution } from "@/lib/api/server-sent-events";
import type { ModelProgressListener } from "@/lib/tribunal";

export const runtime = "nodejs";
export const maxDuration = 800;

/**
 * Execute both durable Tribunal Runs for an existing Case.
 * The Case ID in the route is the authority. The persisted charge
 * sheet is used; the client cannot supply alternate content.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const cases = new PostgresCaseRepository();
  const execute = (onProgress?: ModelProgressListener) =>
    handleExecuteCase(id, {
      cases,
      getApiKey: getOpenRouterApiKey,
      execute: (input) =>
        executeCaseTribunals(input, {
          cases,
          runs: new PostgresTribunalRunRepository(),
          modelCalls: new PostgresModelCallRepository(),
          onProgress,
        }),
    });

  if (acceptsEventStream(request)) {
    return streamExecution((onProgress) => execute(onProgress));
  }

  const { status, body } = await execute();
  return NextResponse.json(body, { status });
}
