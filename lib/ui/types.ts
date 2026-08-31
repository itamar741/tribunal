export type AggregatedInt = {
  value: number;
  complete: boolean;
};

export type AggregatedCost = {
  value: string;
  complete: boolean;
};

export type UsageTotalsView = {
  inputTokens: AggregatedInt;
  outputTokens: AggregatedInt;
  totalTokens: AggregatedInt;
  inputCost: AggregatedCost;
  outputCost: AggregatedCost;
  totalCost: AggregatedCost;
  durationMs: AggregatedInt;
  attemptCount: number;
};

export type AdvocateArgumentView = {
  title: string;
  argument: string;
};

export type AdvocateResponseView = {
  summary: string;
  arguments: AdvocateArgumentView[];
  conclusion: string;
};

export type JudgeResponseView = {
  verdict: "JUSTIFIED" | "NOT_JUSTIFIED";
  summary: string;
  key_reasons: string[];
};

export type RepresentativeRoleView =
  | "DEFENSE_1"
  | "DEFENSE_2"
  | "PROSECUTION_1"
  | "PROSECUTION_2";

export type JudgeRoleView = "JUDGE_1" | "JUDGE_2" | "JUDGE_3";

export type AgentRoleView = RepresentativeRoleView | JudgeRoleView;

export type ModelCallAttemptView = {
  id: string;
  runId: string;
  stage: "ADVOCATES" | "JUDGES";
  agentRole: AgentRoleView;
  attempt: 1 | 2;
  model: string;
  modelSource: "PRIMARY" | "FALLBACK";
  recoveryCycle: number;
  failureClassification: string | null;
  fallbackEligible: boolean;
  status: "SUCCEEDED" | "FAILED";
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  inputCost: string | null;
  outputCost: string | null;
  totalCost: string | null;
  durationMs: number | null;
  providerCallId: string | null;
  validatedResponse: AdvocateResponseView | JudgeResponseView | null;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type RunAccountingView = {
  agents: {
    readonly [Role in AgentRoleView]: UsageTotalsView;
  };
  advocates: UsageTotalsView;
  judges: UsageTotalsView;
  run: UsageTotalsView;
};

export type RunResultsView = {
  id: string;
  runType: "SAME_MODEL" | "MIXED_MODELS";
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  finalVerdict: "JUSTIFIED" | "NOT_JUSTIFIED" | null;
  failureReason: string | null;
  recoveryCycle?: number;
  fallbackUsed?: boolean;
  modelAssignments?: {
    readonly [Role in AgentRoleView]: string;
  };
  startedAt: string | null;
  completedAt: string | null;
  advocates: {
    readonly [Role in RepresentativeRoleView]: AdvocateResponseView | null;
  };
  judges: {
    readonly [Role in JudgeRoleView]: JudgeResponseView | null;
  };
  attempts: ModelCallAttemptView[];
  accounting: RunAccountingView;
};

export type CaseResultsView = {
  case: {
    id: string;
    originalFileName: string;
    createdAt: string;
  };
  runs: {
    SAME_MODEL: RunResultsView;
    MIXED_MODELS: RunResultsView;
  };
  accounting: UsageTotalsView;
};

export type CaseResultsResponse = {
  ok: true;
} & CaseResultsView;

export type RecentCaseView = {
  caseId: string;
  originalFileName: string;
  executedAt: string;
  totalCost: AggregatedCost;
};

export type RecentCasesResponse = {
  ok: true;
  cases: RecentCaseView[];
};

export type ApiErrorResponse = {
  ok: false;
  code: string;
  error: string;
};

export type UploadSuccessResponse = {
  ok: true;
  caseId: string;
  fileName: string;
  characterCount: number;
  createdAt: string;
  runs: Array<{ id: string; runType: string; status: string }>;
};

export type ExecuteSuccessResponse = {
  ok: true;
  caseId: string;
  runs: {
    SAME_MODEL: { ok: true };
    MIXED_MODELS: { ok: true };
  };
};

export type ExecuteRunFailureResponse = {
  ok: false;
  reason: "RUN_FAILURE";
  caseId: string;
  runs: {
    SAME_MODEL: { ok: boolean };
    MIXED_MODELS: { ok: boolean };
  };
};
