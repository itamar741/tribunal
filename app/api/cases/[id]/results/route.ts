import { NextResponse } from "next/server";
import { handleGetCaseResults } from "@/lib/api";
import { PostgresCaseRepository } from "@/lib/cases";
import { PostgresModelCallRepository } from "@/lib/model-calls";

export const runtime = "nodejs";

/**
 * Read-only persisted Case results and accounting.
 * Does not execute models or change Run state.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const { status, body } = await handleGetCaseResults(id, {
    cases: new PostgresCaseRepository(),
    modelCalls: new PostgresModelCallRepository(),
  });
  return NextResponse.json(body, { status });
}
