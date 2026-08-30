import type { TribunalRunKind } from "../ai/configurations";

export const TribunalRunStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
} as const;

export type TribunalRunStatus =
  (typeof TribunalRunStatus)[keyof typeof TribunalRunStatus];

export const TribunalRunVerdict = {
  JUSTIFIED: "JUSTIFIED",
  NOT_JUSTIFIED: "NOT_JUSTIFIED",
} as const;

export type TribunalRunVerdict =
  (typeof TribunalRunVerdict)[keyof typeof TribunalRunVerdict];

export type TribunalRunRecord = {
  id: string;
  caseId: string;
  runType: TribunalRunKind;
  status: TribunalRunStatus;
  finalVerdict: TribunalRunVerdict | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
  recoveryCycle: number;
  createdAt: Date;
};

export type CaseRecord = {
  id: string;
  originalFileName: string;
  chargeSheetText: string;
  createdAt: Date;
  runs: TribunalRunRecord[];
};

export type NewCaseInput = {
  originalFileName: string;
  chargeSheetText: string;
};

export type CaseRepository = {
  create(input: NewCaseInput): Promise<CaseRecord>;
  getById(id: string): Promise<CaseRecord | null>;
};
