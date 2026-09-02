import { query } from "../db";
import type {
  ExecutionRateLimitRepository,
  RateLimitDecision,
} from "./types";
import { EXECUTION_RATE_LIMIT } from "./types";

type DecisionRow = {
  allowed: boolean;
  action_count: number;
  retry_after_seconds: number;
};

export class PostgresExecutionRateLimitRepository
  implements ExecutionRateLimitRepository
{
  async consume(subjectHash: string, at: Date): Promise<RateLimitDecision> {
    const result = await query<DecisionRow>(
      `
        with consumed as (
          insert into execution_rate_limits (
            subject_hash,
            window_started_at,
            action_count,
            updated_at
          )
          values ($1, $2, 1, $2)
          on conflict (subject_hash) do update
          set
            window_started_at = case
              when execution_rate_limits.window_started_at <= $2 - interval '1 hour'
                then $2
              else execution_rate_limits.window_started_at
            end,
            action_count = case
              when execution_rate_limits.window_started_at <= $2 - interval '1 hour'
                then 1
              else execution_rate_limits.action_count + 1
            end,
            updated_at = $2
          where
            execution_rate_limits.window_started_at <= $2 - interval '1 hour'
            or execution_rate_limits.action_count < $3
          returning true as allowed, action_count, 0::integer as retry_after_seconds
        )
        select allowed, action_count, retry_after_seconds
        from consumed
        union all
        select
          false as allowed,
          action_count,
          greatest(
            1,
            ceil(extract(epoch from (window_started_at + interval '1 hour' - $2)))::integer
          ) as retry_after_seconds
        from execution_rate_limits
        where subject_hash = $1
          and not exists (select 1 from consumed)
        limit 1
      `,
      [subjectHash, at, EXECUTION_RATE_LIMIT],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Execution rate-limit decision returned no row.");
    }
    return row.allowed
      ? {
          allowed: true,
          remaining: Math.max(0, EXECUTION_RATE_LIMIT - row.action_count),
        }
      : { allowed: false, retryAfterSeconds: row.retry_after_seconds };
  }
}
