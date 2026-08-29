import { withClient } from "../db";
import { sumCosts, type AggregatedCost } from "./accounting";

export const DEFAULT_RECENT_EXECUTED_CASE_LIMIT = 5;

export type RecentExecutedCase = {
  caseId: string;
  originalFileName: string;
  executedAt: Date;
  totalCost: AggregatedCost;
};

export type RecentExecutedCaseRow = {
  caseId: string;
  originalFileName: string;
  executedAt: Date;
  totalCosts: Array<string | null>;
};

export type ListRecentExecutedCasesInput = {
  limit?: number;
};

export type ListRecentExecutedCasesSource = {
  loadRecentExecutedCaseRows(
    limit: number,
  ): Promise<RecentExecutedCaseRow[]>;
};

export type ListRecentExecutedCasesDeps = {
  source?: ListRecentExecutedCasesSource;
};

type RecentCaseSqlRow = {
  id: string;
  original_file_name: string;
  executed_at: Date;
  model_call_id: string | null;
  total_cost: string | null;
};

function resolveLimit(limit: number | undefined): number {
  if (limit == null || !Number.isInteger(limit) || limit < 1) {
    return DEFAULT_RECENT_EXECUTED_CASE_LIMIT;
  }
  return Math.min(limit, DEFAULT_RECENT_EXECUTED_CASE_LIMIT);
}

function groupRecentCaseRows(
  rows: readonly RecentCaseSqlRow[],
): RecentExecutedCaseRow[] {
  const order: string[] = [];
  const byCase = new Map<string, RecentExecutedCaseRow>();

  for (const row of rows) {
    let entry = byCase.get(row.id);
    if (!entry) {
      entry = {
        caseId: row.id,
        originalFileName: row.original_file_name,
        executedAt: row.executed_at,
        totalCosts: [],
      };
      byCase.set(row.id, entry);
      order.push(row.id);
    }
    if (row.model_call_id) {
      entry.totalCosts.push(row.total_cost);
    }
  }

  return order.map((caseId) => {
    const entry = byCase.get(caseId);
    if (!entry) {
      throw new Error(`Recent Case ${caseId} was lost while grouping rows.`);
    }
    return entry;
  });
}

export const postgresRecentCasesSource: ListRecentExecutedCasesSource = {
  async loadRecentExecutedCaseRows(limit) {
    return withClient(async (client) => {
      const result = await client.query<RecentCaseSqlRow>(
        `
          with recent as (
            select
              c.id,
              c.original_file_name,
              max(tr.started_at) as executed_at
            from cases c
            inner join tribunal_runs tr
              on tr.case_id = c.id
             and tr.started_at is not null
            group by c.id, c.original_file_name
            order by max(tr.started_at) desc, c.id desc
            limit $1
          )
          select
            recent.id,
            recent.original_file_name,
            recent.executed_at,
            mc.id as model_call_id,
            mc.total_cost
          from recent
          left join model_calls mc on mc.case_id = recent.id
          order by recent.executed_at desc, recent.id desc, mc.created_at asc, mc.id asc
        `,
        [limit],
      );
      return groupRecentCaseRows(result.rows);
    });
  },
};

export function toRecentExecutedCases(
  rows: readonly RecentExecutedCaseRow[],
): RecentExecutedCase[] {
  return rows.map((row) => ({
    caseId: row.caseId,
    originalFileName: row.originalFileName,
    executedAt: row.executedAt,
    totalCost: sumCosts(row.totalCosts),
  }));
}

/**
 * Read-only listing of recently executed Cases.
 * A Case is executed when at least one Tribunal Run has started_at.
 * Ordering uses MAX(tribunal_runs.started_at) DESC. Does not execute models.
 */
export async function listRecentExecutedCases(
  input: ListRecentExecutedCasesInput = {},
  deps: ListRecentExecutedCasesDeps = {},
): Promise<RecentExecutedCase[]> {
  const limit = resolveLimit(input.limit);
  const source = deps.source ?? postgresRecentCasesSource;
  const rows = await source.loadRecentExecutedCaseRows(limit);
  return toRecentExecutedCases(rows);
}
