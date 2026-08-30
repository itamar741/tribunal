import { withClient } from "../db";
import { TRIBUNAL_RUN_COLUMNS, toRun, type RunRow } from "./run-mapping";
import { TribunalRunVerdict, type TribunalRunRecord } from "./types";

export class TribunalRunTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TribunalRunTransitionError";
  }
}

function requireUpdatedRun(
  row: RunRow | undefined,
  runId: string,
  action: string,
): TribunalRunRecord {
  if (!row) {
    throw new TribunalRunTransitionError(
      `Tribunal Run ${runId} cannot be ${action}.`,
    );
  }
  return toRun(row);
}

export class PostgresTribunalRunRepository {
  async getById(runId: string): Promise<TribunalRunRecord | null> {
    return withClient(async (client) => {
      const result = await client.query<RunRow>(
        `
          select ${TRIBUNAL_RUN_COLUMNS}
          from tribunal_runs
          where id = $1
        `,
        [runId],
      );
      const row = result.rows[0];
      return row ? toRun(row) : null;
    });
  }

  async markRunning(runId: string): Promise<TribunalRunRecord> {
    return withClient(async (client) => {
      const result = await client.query<RunRow>(
        `
          update tribunal_runs
          set
            status = 'RUNNING',
            started_at = now(),
            recovery_cycle = greatest(recovery_cycle, 1)
          where id = $1
            and status = 'PENDING'
          returning ${TRIBUNAL_RUN_COLUMNS}
        `,
        [runId],
      );
      return requireUpdatedRun(result.rows[0], runId, "marked RUNNING");
    });
  }

  /** Atomically claims one failed Run for a user-triggered recovery cycle. */
  async claimResume(runId: string): Promise<TribunalRunRecord> {
    return withClient(async (client) => {
      const result = await client.query<RunRow>(
        `
          update tribunal_runs
          set
            status = 'RUNNING',
            started_at = now(),
            completed_at = null,
            failure_reason = null,
            recovery_cycle = recovery_cycle + 1
          where id = $1
            and status = 'FAILED'
          returning ${TRIBUNAL_RUN_COLUMNS}
        `,
        [runId],
      );
      return requireUpdatedRun(result.rows[0], runId, "claimed for recovery");
    });
  }

  async markSucceeded(
    runId: string,
    finalVerdict: TribunalRunVerdict,
  ): Promise<TribunalRunRecord> {
    if (!Object.values(TribunalRunVerdict).includes(finalVerdict)) {
      throw new TribunalRunTransitionError(
        `Invalid final verdict: ${String(finalVerdict)}`,
      );
    }

    return withClient(async (client) => {
      const result = await client.query<RunRow>(
        `
          update tribunal_runs
          set
            status = 'SUCCEEDED',
            final_verdict = $2,
            completed_at = now(),
            failure_reason = null
          where id = $1
            and status = 'RUNNING'
          returning ${TRIBUNAL_RUN_COLUMNS}
        `,
        [runId, finalVerdict],
      );
      return requireUpdatedRun(result.rows[0], runId, "marked SUCCEEDED");
    });
  }

  async markFailed(
    runId: string,
    failureReason: string,
  ): Promise<TribunalRunRecord> {
    const reason = failureReason.trim();
    if (reason.length === 0) {
      throw new TribunalRunTransitionError(
        "A failed Tribunal Run requires a failure reason.",
      );
    }

    return withClient(async (client) => {
      const result = await client.query<RunRow>(
        `
          update tribunal_runs
          set
            status = 'FAILED',
            failure_reason = $2,
            completed_at = now(),
            final_verdict = null
          where id = $1
            and status = 'RUNNING'
          returning ${TRIBUNAL_RUN_COLUMNS}
        `,
        [runId, reason],
      );
      return requireUpdatedRun(result.rows[0], runId, "marked FAILED");
    });
  }
}
