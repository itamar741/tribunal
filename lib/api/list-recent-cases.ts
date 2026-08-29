import { DatabaseConfigError } from "../db";
import {
  listRecentExecutedCases,
  type ListRecentExecutedCasesDeps,
  type RecentExecutedCase,
} from "../results";
import { apiError, internalError, type ApiJsonResult } from "./http";

export type PublicRecentCase = {
  caseId: string;
  originalFileName: string;
  executedAt: string;
  totalCost: {
    value: string;
    complete: boolean;
  };
};

export type PublicRecentCasesBody = {
  ok: true;
  cases: PublicRecentCase[];
};

export type ListRecentCasesHttpDeps = ListRecentExecutedCasesDeps & {
  listRecentExecutedCases?: typeof listRecentExecutedCases;
};

export function toPublicRecentCase(
  record: RecentExecutedCase,
): PublicRecentCase {
  return {
    caseId: record.caseId,
    originalFileName: record.originalFileName,
    executedAt: record.executedAt.toISOString(),
    totalCost: record.totalCost,
  };
}

/**
 * Read-only HTTP mapping for recently executed Cases.
 * Never executes models, mutates Run state, or returns charge-sheet text.
 */
export async function handleListRecentCases(
  deps: ListRecentCasesHttpDeps = {},
): Promise<ApiJsonResult<PublicRecentCasesBody>> {
  const load = deps.listRecentExecutedCases ?? listRecentExecutedCases;

  try {
    const cases = await load({ limit: 5 }, { source: deps.source });
    return {
      status: 200,
      body: {
        ok: true,
        cases: cases.map(toPublicRecentCase),
      },
    };
  } catch (error) {
    if (error instanceof DatabaseConfigError) {
      return apiError(503, "DATABASE_UNAVAILABLE", error.message);
    }
    return internalError();
  }
}
