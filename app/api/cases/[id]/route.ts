import { NextResponse } from "next/server";
import {
  isCaseId,
  PostgresCaseRepository,
  toPublicCase,
} from "@/lib/cases";
import { DatabaseConfigError } from "@/lib/db";

export const runtime = "nodejs";

type SuccessBody = {
  ok: true;
} & ReturnType<typeof toPublicCase>;

type ErrorBody = {
  ok: false;
  error: string;
  code: string;
};

function errorResponse(
  status: number,
  code: string,
  error: string,
): NextResponse<ErrorBody> {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/**
 * Retrieve a Case by unique ID, including its two Tribunal Runs.
 * Does not rerun processing and does not return charge-sheet text.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  const { id } = await context.params;

  if (!isCaseId(id)) {
    return errorResponse(400, "INVALID_CASE_ID", "The Case ID is not valid.");
  }

  try {
    const record = await new PostgresCaseRepository().getById(id);
    if (!record) {
      return errorResponse(404, "CASE_NOT_FOUND", "No Case exists for that ID.");
    }

    return NextResponse.json({
      ok: true,
      ...toPublicCase(record),
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return errorResponse(503, "DATABASE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}
