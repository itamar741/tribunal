import { NextResponse } from "next/server";
import {
  createCaseFromUpload,
  PostgresCaseRepository,
  toPublicCase,
} from "@/lib/cases";
import { DatabaseConfigError } from "@/lib/db";

export const runtime = "nodejs";

const FORM_FIELD = "chargeSheet";

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
 * Upload transport for charge sheets.
 * Validates via lib/charge-sheet, then persists a Case and its two Tribunal Runs.
 * Validated text is stored; the original file/blob is not.
 */
export async function POST(
  request: Request,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "INVALID_FORM", "Expected multipart form data.");
  }

  const files = formData
    .getAll(FORM_FIELD)
    .filter((entry): entry is File => entry instanceof File);

  const primary = files[0];
  const hasNamedFile = Boolean(primary && primary.name.trim().length > 0);

  try {
    const result = await createCaseFromUpload(
      hasNamedFile ? primary : null,
      new PostgresCaseRepository(),
      { extraFileCount: Math.max(0, files.length - 1) },
    );

    if (!result.ok) {
      return errorResponse(400, result.code, result.message);
    }

    return NextResponse.json({
      ok: true,
      ...toPublicCase(result.case),
    });
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return errorResponse(503, "DATABASE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}
