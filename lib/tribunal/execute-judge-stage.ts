import { AttemptErrorType } from "../ai/execution";
import {
  executeJudgeWithRetry,
  type ExecuteJudgeWithRetryDeps,
  type JudgeExecutionResult,
} from "../ai/execution";
import type { TribunalRunKind } from "../ai/configurations";
import type { JudgeResponse } from "../ai/contracts";
import { JUDGE_ROLES_IN_ORDER, JudgeRole } from "../ai/profiles";
import { buildJudgePrompt, type JudgeAdvocateResponses } from "../ai/prompts";
import type { TribunalRunVerdict } from "../cases";
import { calculateMajority } from "./majority";

export type ExecuteJudgeStageInput = {
  caseId: string;
  runId: string;
  runKind: TribunalRunKind;
  chargeSheetMarkdown: string;
  advocateResponses: JudgeAdvocateResponses;
  apiKey: string;
};

export type JudgeStageRunRepository = {
  markSucceeded(
    runId: string,
    finalVerdict: TribunalRunVerdict,
  ): Promise<unknown>;
  markFailed(runId: string, failureReason: string): Promise<unknown>;
};

export type ExecuteJudgeStageDeps = ExecuteJudgeWithRetryDeps & {
  runs: JudgeStageRunRepository;
};

export type JudgeStageAgentMeta = {
  successfulAttempt: 1 | 2;
  model: string;
};

export type JudgeStageSuccess = {
  ok: true;
  judges: {
    readonly [Role in JudgeRole]: JudgeResponse;
  };
  agents: {
    readonly [Role in JudgeRole]: JudgeStageAgentMeta;
  };
  finalVerdict: TribunalRunVerdict;
};

export type JudgeStageAgentFailure = {
  role: JudgeRole;
  errorType: string;
  errorMessage: string;
  attemptsMade: 0 | 1 | 2;
};

export type JudgeStageFailure = {
  ok: false;
  failedRoles: JudgeRole[];
  failures: JudgeStageAgentFailure[];
};

export type JudgeStageResult = JudgeStageSuccess | JudgeStageFailure;

function isJudgeRoleValue(role: string): role is JudgeRole {
  return Object.values(JudgeRole).includes(role as JudgeRole);
}

function configurationFailures(errorMessage: string): JudgeStageFailure {
  return {
    ok: false,
    failedRoles: [...JUDGE_ROLES_IN_ORDER],
    failures: JUDGE_ROLES_IN_ORDER.map((role) => ({
      role,
      errorType: AttemptErrorType.INVALID_CONFIGURATION,
      errorMessage,
      attemptsMade: 0,
    })),
  };
}

function failureFromResult(
  role: JudgeRole,
  result: JudgeExecutionResult,
): JudgeStageAgentFailure {
  if (result.ok) {
    throw new Error(`Expected a failed result for ${role}.`);
  }
  return {
    role,
    errorType: result.errorType,
    errorMessage: result.errorMessage,
    attemptsMade: result.attemptsMade,
  };
}

function unexpectedFailure(
  role: JudgeRole,
  error: unknown,
): JudgeStageAgentFailure {
  return {
    role,
    errorType: AttemptErrorType.INVALID_CONFIGURATION,
    errorMessage:
      error instanceof Error
        ? error.message
        : "Judge execution failed unexpectedly.",
    attemptsMade: 0,
  };
}

function stageFailureReason(failures: JudgeStageAgentFailure[]): string {
  const details = failures
    .map((failure) => `${failure.role} (${failure.errorType})`)
    .join("; ");
  return `Judge stage failed: ${details}.`;
}

function toJudgeStageSuccess(
  judges: Partial<Record<JudgeRole, JudgeResponse>>,
  agents: Partial<Record<JudgeRole, JudgeStageAgentMeta>>,
  finalVerdict: TribunalRunVerdict,
): JudgeStageSuccess | null {
  const judge1 = judges[JudgeRole.JUDGE_1];
  const judge2 = judges[JudgeRole.JUDGE_2];
  const judge3 = judges[JudgeRole.JUDGE_3];
  const meta1 = agents[JudgeRole.JUDGE_1];
  const meta2 = agents[JudgeRole.JUDGE_2];
  const meta3 = agents[JudgeRole.JUDGE_3];
  if (
    judge1 == null ||
    judge2 == null ||
    judge3 == null ||
    meta1 == null ||
    meta2 == null ||
    meta3 == null
  ) {
    return null;
  }
  return {
    ok: true,
    judges: {
      [JudgeRole.JUDGE_1]: judge1,
      [JudgeRole.JUDGE_2]: judge2,
      [JudgeRole.JUDGE_3]: judge3,
    },
    agents: {
      [JudgeRole.JUDGE_1]: meta1,
      [JudgeRole.JUDGE_2]: meta2,
      [JudgeRole.JUDGE_3]: meta3,
    },
    finalVerdict,
  };
}

/**
 * Execute exactly three Judges concurrently for one RUNNING Tribunal Run.
 *
 * Does not mark the run RUNNING. Marks SUCCEEDED with the 2-of-3 majority
 * only after three valid Judge responses. Marks FAILED if any Judge
 * permanently fails, without calculating a majority.
 */
export async function executeJudgeStage(
  input: ExecuteJudgeStageInput,
  deps: ExecuteJudgeStageDeps,
): Promise<JudgeStageResult> {
  try {
    buildJudgePrompt({
      role: JudgeRole.JUDGE_1,
      chargeSheetMarkdown: input.chargeSheetMarkdown,
      advocateResponses: input.advocateResponses,
    });
  } catch (error) {
    return configurationFailures(
      error instanceof Error
        ? error.message
        : "Judge stage requires validated advocate responses and charge-sheet Markdown.",
    );
  }

  const { runs, ...judgeDeps } = deps;

  const settled = await Promise.allSettled(
    JUDGE_ROLES_IN_ORDER.map((role) =>
      executeJudgeWithRetry(
        {
          caseId: input.caseId,
          runId: input.runId,
          runKind: input.runKind,
          role,
          chargeSheetMarkdown: input.chargeSheetMarkdown,
          advocateResponses: input.advocateResponses,
          apiKey: input.apiKey,
        },
        judgeDeps,
      ),
    ),
  );

  const failures: JudgeStageAgentFailure[] = [];
  const judges: Partial<Record<JudgeRole, JudgeResponse>> = {};
  const agents: Partial<Record<JudgeRole, JudgeStageAgentMeta>> = {};

  for (const [index, outcome] of settled.entries()) {
    const role = JUDGE_ROLES_IN_ORDER[index];
    if (!isJudgeRoleValue(role)) {
      continue;
    }
    if (outcome.status === "rejected") {
      failures.push(unexpectedFailure(role, outcome.reason));
      continue;
    }
    const result = outcome.value;
    if (!result.ok) {
      failures.push(failureFromResult(role, result));
      continue;
    }
    judges[role] = result.response;
    agents[role] = {
      successfulAttempt: result.successfulAttempt,
      model: result.model,
    };
  }

  if (failures.length === 0) {
    const judge1 = judges[JudgeRole.JUDGE_1];
    const judge2 = judges[JudgeRole.JUDGE_2];
    const judge3 = judges[JudgeRole.JUDGE_3];
    if (judge1 && judge2 && judge3) {
      const finalVerdict = calculateMajority([
        judge1.verdict,
        judge2.verdict,
        judge3.verdict,
      ]);
      const success = toJudgeStageSuccess(judges, agents, finalVerdict);
      if (success) {
        try {
          await runs.markSucceeded(input.runId, finalVerdict);
          return success;
        } catch (error) {
          return configurationFailures(
            error instanceof Error
              ? error.message
              : "Tribunal Run could not be marked SUCCEEDED.",
          );
        }
      }
    }
  }

  const stageFailures =
    failures.length > 0
      ? failures
      : configurationFailures(
          "Judge stage did not produce all three validated responses.",
        ).failures;

  try {
    await runs.markFailed(input.runId, stageFailureReason(stageFailures));
  } catch {
    // The stage outcome is still a failure even if the lifecycle write fails.
  }

  return {
    ok: false,
    failedRoles: stageFailures.map((failure) => failure.role),
    failures: stageFailures,
  };
}
