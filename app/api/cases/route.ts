import { NextResponse } from "next/server";
import {
  createCanonicalCase,
  PostgresCaseRepository,
  toPublicCase,
} from "@/lib/cases";
import { isDatabaseUnavailableError } from "@/lib/db";
import {
  authorizeModelAction,
  PostgresExecutionRateLimitRepository,
  RateLimitConfigError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

type SuccessBody = { ok: true } & ReturnType<typeof toPublicCase>;
type ErrorBody = {
  ok: false;
  error: string;
  code: string;
  retryAfterSeconds?: number;
};

function errorResponse(
  status: number,
  code: string,
  error: string,
): NextResponse<ErrorBody> {
  return NextResponse.json({ ok: false, code, error }, { status });
}

/** Create a fresh Case from the server-owned canonical charge sheet. */
export async function POST(
  request: Request,
): Promise<NextResponse<SuccessBody | ErrorBody>> {
  try {
    const decision = await authorizeModelAction(
      request,
      new PostgresExecutionRateLimitRepository(),
    );
    if (decision && !decision.allowed) {
      const minutes = Math.max(1, Math.ceil(decision.retryAfterSeconds / 60));
      return NextResponse.json(
        {
          ok: false,
          code: "EXECUTION_RATE_LIMITED",
          error: `The chamber has reached its hourly hearing limit. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(decision.retryAfterSeconds) },
        },
      );
    }
    const record = await createCanonicalCase(new PostgresCaseRepository());
    return NextResponse.json(
      { ok: true, ...toPublicCase(record) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RateLimitConfigError) {
      return errorResponse(
        503,
        "RATE_LIMIT_CONFIGURATION_ERROR",
        "The Tribunal cost guard is not configured.",
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return errorResponse(
        503,
        "DATABASE_UNAVAILABLE",
        "The Tribunal database is temporarily unavailable.",
      );
    }
    throw error;
  }
}
