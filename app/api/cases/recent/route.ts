import { NextResponse } from "next/server";
import { handleListRecentCases } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Read-only list of the five most recently executed Cases.
 * Does not execute models or change Run state.
 */
export async function GET(): Promise<NextResponse> {
  const { status, body } = await handleListRecentCases();
  return NextResponse.json(body, { status });
}
