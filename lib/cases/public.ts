import type { CaseRecord, TribunalRunRecord } from "./types";

export type PublicTribunalRun = {
  id: string;
  runType: TribunalRunRecord["runType"];
  status: TribunalRunRecord["status"];
};

export type PublicCase = {
  caseId: string;
  fileName: string;
  characterCount: number;
  createdAt: string;
  runs: PublicTribunalRun[];
};

export function toPublicCase(record: CaseRecord): PublicCase {
  return {
    caseId: record.id,
    fileName: record.originalFileName,
    characterCount: record.chargeSheetText.length,
    createdAt: record.createdAt.toISOString(),
    runs: record.runs.map((run) => ({
      id: run.id,
      runType: run.runType,
      status: run.status,
    })),
  };
}
