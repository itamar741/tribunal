export const ModelCallStage = {
  ADVOCATES: "ADVOCATES",
  JUDGES: "JUDGES",
} as const;

export type ModelCallStage =
  (typeof ModelCallStage)[keyof typeof ModelCallStage];

export const ModelCallAgentRole = {
  DEFENSE_1: "DEFENSE_1",
  DEFENSE_2: "DEFENSE_2",
  PROSECUTION_1: "PROSECUTION_1",
  PROSECUTION_2: "PROSECUTION_2",
  JUDGE_1: "JUDGE_1",
  JUDGE_2: "JUDGE_2",
  JUDGE_3: "JUDGE_3",
} as const;

export type ModelCallAgentRole =
  (typeof ModelCallAgentRole)[keyof typeof ModelCallAgentRole];

export const ModelCallStatus = {
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
} as const;

export type ModelCallStatus =
  (typeof ModelCallStatus)[keyof typeof ModelCallStatus];

export type ModelCallAttempt = 1 | 2;

export type NewModelCallInput = {
  caseId: string;
  runId: string;
  stage: ModelCallStage;
  agentRole: ModelCallAgentRole;
  attempt: ModelCallAttempt;
  model: string;
  status: ModelCallStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  inputCost: string | null;
  outputCost: string | null;
  totalCost: string | null;
  durationMs: number | null;
  providerCallId: string | null;
  validatedResponse: unknown | null;
  errorType: string | null;
  errorMessage: string | null;
};

export type ModelCallRecord = NewModelCallInput & {
  id: string;
  createdAt: Date;
};

export type ModelCallRepository = {
  insert(input: NewModelCallInput): Promise<ModelCallRecord>;
  listByRunId(runId: string): Promise<ModelCallRecord[]>;
  listByCaseId(caseId: string): Promise<ModelCallRecord[]>;
};
