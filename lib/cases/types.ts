import type { TribunalRunKind } from "../ai/configurations";

/**
 * Newly created runs have not started AI execution.
 * Later phases will expand this set through a new migration.
 */
export const TribunalRunStatus = {
  PENDING: "PENDING",
} as const;

export type TribunalRunStatus =
  (typeof TribunalRunStatus)[keyof typeof TribunalRunStatus];

export type TribunalRunRecord = {
  id: string;
  caseId: string;
  runType: TribunalRunKind;
  status: TribunalRunStatus;
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
