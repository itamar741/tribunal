import { NextResponse } from "next/server";
import {
  createCanonicalCase,
  PostgresCaseRepository,
  toPublicCase,
} from "@/lib/cases";
import { DatabaseConfigError } from "@/lib/db";

export const runtime = "nodejs";

type SuccessBody = { ok: true } & ReturnType<typeof toPublicCase>;
type ErrorBody = { ok: false; error: string; code: string };

function errorResponse(
  status: number,
  code: string,
  error: string,
): NextResponse<ErrorBody> {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/** Create a fresh Case from the server-owned canonical charge sheet. */
export async function POST(): Promise<NextResponse<SuccessBody | ErrorBody>> {
  try {
    const record = await createCanonicalCase(new PostgresCaseRepository());
    return NextResponse.json(
      { ok: true, ...toPublicCase(record) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return errorResponse(503, "DATABASE_UNAVAILABLE", error.message);
    }
    throw error;
  }
}
