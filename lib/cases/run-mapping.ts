import { TribunalRunKind } from "../ai/configurations";
import {
  TribunalRunStatus,
  TribunalRunVerdict,
  type TribunalRunRecord,
} from "./types";

export const TRIBUNAL_RUN_COLUMNS = `
  id,
  case_id,
  run_type,
  status,
  final_verdict,
  started_at,
  completed_at,
  failure_reason,
  recovery_cycle,
  created_at
`;

export type RunRow = {
  id: string;
  case_id: string;
  run_type: string;
  status: string;
  final_verdict: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  failure_reason: string | null;
  recovery_cycle: number;
  created_at: Date;
};

function isTribunalRunStatus(value: string): value is TribunalRunStatus {
  return Object.values(TribunalRunStatus).includes(value as TribunalRunStatus);
}

function isTribunalRunVerdict(value: string): value is TribunalRunVerdict {
  return Object.values(TribunalRunVerdict).includes(value as TribunalRunVerdict);
}

export function toRun(row: RunRow): TribunalRunRecord {
  if (
    row.run_type !== TribunalRunKind.SAME_MODEL &&
    row.run_type !== TribunalRunKind.MIXED_MODELS
  ) {
    throw new Error(`Unexpected Tribunal Run type: ${row.run_type}`);
  }
  if (!isTribunalRunStatus(row.status)) {
    throw new Error(`Unexpected Tribunal Run status: ${row.status}`);
  }
  if (row.final_verdict != null && !isTribunalRunVerdict(row.final_verdict)) {
    throw new Error(`Unexpected Tribunal Run verdict: ${row.final_verdict}`);
  }

  return {
    id: row.id,
    caseId: row.case_id,
    runType: row.run_type,
    status: row.status,
    finalVerdict: row.final_verdict,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    recoveryCycle: row.recovery_cycle,
    createdAt: row.created_at,
  };
}
