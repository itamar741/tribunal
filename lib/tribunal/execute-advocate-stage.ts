import { AttemptErrorType } from "../ai/execution";
import {
  executeRepresentativeWithRetry,
  type ExecuteRepresentativeWithRetryDeps,
  type RepresentativeExecutionResult,
} from "../ai/execution";
import type { TribunalRunKind } from "../ai/configurations";
import type { AdvocateResponse } from "../ai/contracts";
import { RepresentativeRole } from "../ai/profiles";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../ai/prompts/delimiters";
import type { JudgeAdvocateResponses } from "../ai/prompts";

export type ExecuteAdvocateStageInput = {
  caseId: string;
  runId: string;
  runKind: TribunalRunKind;
  chargeSheetMarkdown: string;
  apiKey: string;
};

export type AdvocateStageRunRepository = {
  markRunning(runId: string): Promise<unknown>;
  markFailed(runId: string, failureReason: string): Promise<unknown>;
};

export type ExecuteAdvocateStageDeps = Omit<
  ExecuteRepresentativeWithRetryDeps,
  "runs"
> & {
  runs: AdvocateStageRunRepository;
};

export type AdvocateStageAgentMeta = {
  successfulAttempt: 1 | 2;
  model: string;
};

export type AdvocateStageSuccess = {
  ok: true;
  responses: JudgeAdvocateResponses;
  agents: {
    readonly [Role in RepresentativeRole]: AdvocateStageAgentMeta;
  };
};

export type AdvocateStageAgentFailure = {
  role: RepresentativeRole;
  errorType: string;
  errorMessage: string;
  attemptsMade: 0 | 1 | 2;
};

export type AdvocateStageFailure = {
  ok: false;
  failedRoles: RepresentativeRole[];
  failures: AdvocateStageAgentFailure[];
  rejectedStart?: boolean;
};

export type AdvocateStageResult = AdvocateStageSuccess | AdvocateStageFailure;

function isRepresentativeRole(role: string): role is RepresentativeRole {
  return Object.values(RepresentativeRole).includes(role as RepresentativeRole);
}

function configurationFailures(
  errorMessage: string,
): AdvocateStageFailure {
  return {
    ok: false,
    failedRoles: [...REPRESENTATIVE_ROLES_IN_ORDER],
    failures: REPRESENTATIVE_ROLES_IN_ORDER.map((role) => ({
      role,
      errorType: AttemptErrorType.INVALID_CONFIGURATION,
      errorMessage,
      attemptsMade: 0,
    })),
  };
}

function failureFromResult(
  role: RepresentativeRole,
  result: RepresentativeExecutionResult,
): AdvocateStageAgentFailure {
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
  role: RepresentativeRole,
  error: unknown,
): AdvocateStageAgentFailure {
  return {
    role,
    errorType: AttemptErrorType.INVALID_CONFIGURATION,
    errorMessage:
      error instanceof Error
        ? error.message
        : "Representative execution failed unexpectedly.",
    attemptsMade: 0,
  };
}

function stageFailureReason(failures: AdvocateStageAgentFailure[]): string {
  const details = failures
    .map((failure) => `${failure.role} (${failure.errorType})`)
    .join("; ");
  return `Advocate stage failed: ${details}.`;
}

function toAdvocateStageSuccess(
  responses: Partial<Record<RepresentativeRole, AdvocateResponse>>,
  agents: Partial<Record<RepresentativeRole, AdvocateStageAgentMeta>>,
): AdvocateStageSuccess | null {
  const defense1 = responses[RepresentativeRole.DEFENSE_1];
  const defense2 = responses[RepresentativeRole.DEFENSE_2];
  const prosecution1 = responses[RepresentativeRole.PROSECUTION_1];
  const prosecution2 = responses[RepresentativeRole.PROSECUTION_2];
  const defense1Meta = agents[RepresentativeRole.DEFENSE_1];
  const defense2Meta = agents[RepresentativeRole.DEFENSE_2];
  const prosecution1Meta = agents[RepresentativeRole.PROSECUTION_1];
  const prosecution2Meta = agents[RepresentativeRole.PROSECUTION_2];

  if (
    defense1 == null ||
    defense2 == null ||
    prosecution1 == null ||
    prosecution2 == null ||
    defense1Meta == null ||
    defense2Meta == null ||
    prosecution1Meta == null ||
    prosecution2Meta == null
  ) {
    return null;
  }

  return {
    ok: true,
    responses: {
      [RepresentativeRole.DEFENSE_1]: defense1,
      [RepresentativeRole.DEFENSE_2]: defense2,
      [RepresentativeRole.PROSECUTION_1]: prosecution1,
      [RepresentativeRole.PROSECUTION_2]: prosecution2,
    },
    agents: {
      [RepresentativeRole.DEFENSE_1]: defense1Meta,
      [RepresentativeRole.DEFENSE_2]: defense2Meta,
      [RepresentativeRole.PROSECUTION_1]: prosecution1Meta,
      [RepresentativeRole.PROSECUTION_2]: prosecution2Meta,
    },
  };
}

/**
 * Execute exactly four representatives concurrently for one Tribunal Run.
 *
 * Reuses the bounded one-agent retry executor. Marks the run RUNNING
 * once before the four agents start. Marks the run FAILED if any
 * agent permanently fails. Does not mark SUCCEEDED and does not start
 * judges.
 */
export async function executeAdvocateStage(
  input: ExecuteAdvocateStageInput,
  deps: ExecuteAdvocateStageDeps,
): Promise<AdvocateStageResult> {
  const chargeSheetMarkdown = input.chargeSheetMarkdown;
  if (
    typeof chargeSheetMarkdown !== "string" ||
    chargeSheetMarkdown.trim().length === 0
  ) {
    return configurationFailures("Validated charge-sheet Markdown is required.");
  }

  try {
    await deps.runs.markRunning(input.runId);
  } catch (error) {
    return {
      ...configurationFailures(
        error instanceof Error
          ? error.message
          : "Tribunal Run could not be marked RUNNING.",
      ),
      rejectedStart: true,
    };
  }

  const settled = await Promise.allSettled(
    REPRESENTATIVE_ROLES_IN_ORDER.map((role) =>
      executeRepresentativeWithRetry(
        {
          caseId: input.caseId,
          runId: input.runId,
          runKind: input.runKind,
          role,
          chargeSheetMarkdown,
          apiKey: input.apiKey,
        },
        {
          ...deps,
          skipMarkRunning: true,
        },
      ),
    ),
  );

  const failures: AdvocateStageAgentFailure[] = [];
  const responses: Partial<Record<RepresentativeRole, AdvocateResponse>> = {};
  const agents: Partial<Record<RepresentativeRole, AdvocateStageAgentMeta>> = {};

  for (const [index, outcome] of settled.entries()) {
    const role = REPRESENTATIVE_ROLES_IN_ORDER[index];
    if (!isRepresentativeRole(role)) {
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
    responses[role] = result.response;
    agents[role] = {
      successfulAttempt: result.successfulAttempt,
      model: result.model,
    };
  }

  const success = failures.length === 0 ? toAdvocateStageSuccess(responses, agents) : null;
  if (success) {
    return success;
  }

  const stageFailures =
    failures.length > 0
      ? failures
      : configurationFailures(
          "Advocate stage did not produce all four validated responses.",
        ).failures;

  try {
    await deps.runs.markFailed(input.runId, stageFailureReason(stageFailures));
  } catch {
    // The stage outcome is still a failure even if the lifecycle write fails.
  }
  return {
    ok: false,
    failedRoles: stageFailures.map((failure) => failure.role),
    failures: stageFailures,
  };
}
