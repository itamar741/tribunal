import type { TribunalRunKind } from "../ai/configurations";
import type { AdvocateResponse, JudgeResponse } from "../ai/contracts";
import type { JudgeRole, RepresentativeRole } from "../ai/profiles";
import type { TribunalRunStatus, TribunalRunVerdict } from "../cases";
import type {
  ModelCallAgentRole,
  ModelCallAttempt,
  ModelCallStage,
  ModelCallStatus,
} from "../model-calls";
import type { UsageTotals } from "./accounting";

export type ModelCallAttemptView = {
  id: string;
  runId: string;
  stage: ModelCallStage;
  agentRole: ModelCallAgentRole;
  attempt: ModelCallAttempt;
  model: string;
  modelSource: "PRIMARY" | "FALLBACK";
  recoveryCycle: number;
  failureClassification: string | null;
  fallbackEligible: boolean;
  status: ModelCallStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  inputCost: string | null;
  outputCost: string | null;
  totalCost: string | null;
  durationMs: number | null;
  providerCallId: string | null;
  validatedResponse: AdvocateResponse | JudgeResponse | null;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

export type RunAccounting = {
  agents: {
    readonly [Role in ModelCallAgentRole]: UsageTotals;
  };
  advocates: UsageTotals;
  judges: UsageTotals;
  run: UsageTotals;
};

export type RunResults = {
  id: string;
  runType: TribunalRunKind;
  status: TribunalRunStatus;
  finalVerdict: TribunalRunVerdict | null;
  failureReason: string | null;
  recoveryCycle?: number;
  fallbackUsed?: boolean;
  /** Persisted configuration, exposed read-only so the reviewer can identify
   * a seat before its first Model Call audit row exists. */
  modelAssignments?: {
    readonly [Role in ModelCallAgentRole]: string;
  };
  startedAt: Date | null;
  completedAt: Date | null;
  advocates: {
    readonly [Role in RepresentativeRole]: AdvocateResponse | null;
  };
  judges: {
    readonly [Role in JudgeRole]: JudgeResponse | null;
  };
  attempts: ModelCallAttemptView[];
  accounting: RunAccounting;
};

export type CaseResults = {
  case: {
    id: string;
    originalFileName: string;
    createdAt: Date;
  };
  runs: {
    readonly [TribunalRunKind.SAME_MODEL]: RunResults;
    readonly [TribunalRunKind.MIXED_MODELS]: RunResults;
  };
  accounting: UsageTotals;
};
