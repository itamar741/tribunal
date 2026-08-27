import type { TribunalRunKind } from "../ai/configurations";
import type { JudgeResponse } from "../ai/contracts";
import type { JudgeRole, RepresentativeRole } from "../ai/profiles";
import type { JudgeAdvocateResponses } from "../ai/prompts";
import type { TribunalRunVerdict } from "../cases";
import {
  executeAdvocateStage,
  type AdvocateStageAgentFailure,
  type AdvocateStageAgentMeta,
  type ExecuteAdvocateStageDeps,
} from "./execute-advocate-stage";
import {
  executeJudgeStage,
  type JudgeStageAgentFailure,
  type JudgeStageAgentMeta,
} from "./execute-judge-stage";

export type ExecuteTribunalRunInput = {
  caseId: string;
  runId: string;
  runKind: TribunalRunKind;
  chargeSheetMarkdown: string;
  apiKey: string;
};

export type TribunalRunRepositoryPort = ExecuteAdvocateStageDeps["runs"] & {
  markSucceeded(
    runId: string,
    finalVerdict: TribunalRunVerdict,
  ): Promise<unknown>;
};

export type ExecuteTribunalRunDeps = Omit<ExecuteAdvocateStageDeps, "runs"> & {
  runs: TribunalRunRepositoryPort;
};

export type TribunalRunSuccess = {
  ok: true;
  advocates: JudgeAdvocateResponses;
  advocateAgents: {
    readonly [Role in RepresentativeRole]: AdvocateStageAgentMeta;
  };
  judges: {
    readonly [Role in JudgeRole]: JudgeResponse;
  };
  judgeAgents: {
    readonly [Role in JudgeRole]: JudgeStageAgentMeta;
  };
  finalVerdict: TribunalRunVerdict;
};

export type TribunalRunAdvocateFailure = {
  ok: false;
  failedStage: "ADVOCATES";
  failedRoles: RepresentativeRole[];
  failures: AdvocateStageAgentFailure[];
};

export type TribunalRunJudgeFailure = {
  ok: false;
  failedStage: "JUDGES";
  failedRoles: JudgeRole[];
  failures: JudgeStageAgentFailure[];
};

export type TribunalRunNotExecutableFailure = {
  ok: false;
  failedStage: "RUN";
  reason: "NOT_PENDING";
  errorMessage: string;
};

export type TribunalRunFailure =
  | TribunalRunAdvocateFailure
  | TribunalRunJudgeFailure
  | TribunalRunNotExecutableFailure;

export type TribunalRunResult = TribunalRunSuccess | TribunalRunFailure;

/**
 * Execute one existing Tribunal Run: Advocate stage, then Judge stage
 * only if all four Advocate responses are valid.
 *
 * Reuses the public stage boundaries. Does not construct prompts, resolve
 * models, retry, audit, calculate majority, or mutate Run lifecycle itself.
 */
export async function executeTribunalRun(
  input: ExecuteTribunalRunInput,
  deps: ExecuteTribunalRunDeps,
): Promise<TribunalRunResult> {
  const advocates = await executeAdvocateStage(input, deps);
  if (!advocates.ok) {
    if (advocates.rejectedStart) {
      return {
        ok: false,
        failedStage: "RUN",
        reason: "NOT_PENDING",
        errorMessage:
          advocates.failures[0]?.errorMessage ??
          "Tribunal Run is not PENDING and cannot be executed.",
      };
    }
    return {
      ok: false,
      failedStage: "ADVOCATES",
      failedRoles: advocates.failedRoles,
      failures: advocates.failures,
    };
  }

  const judges = await executeJudgeStage(
    {
      caseId: input.caseId,
      runId: input.runId,
      runKind: input.runKind,
      chargeSheetMarkdown: input.chargeSheetMarkdown,
      advocateResponses: advocates.responses,
      apiKey: input.apiKey,
    },
    deps,
  );

  if (!judges.ok) {
    return {
      ok: false,
      failedStage: "JUDGES",
      failedRoles: judges.failedRoles,
      failures: judges.failures,
    };
  }

  return {
    ok: true,
    advocates: advocates.responses,
    advocateAgents: advocates.agents,
    judges: judges.judges,
    judgeAgents: judges.agents,
    finalVerdict: judges.finalVerdict,
  };
}
