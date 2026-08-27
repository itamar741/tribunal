import { TribunalRunKind } from "../ai/configurations";
import {
  advocateResponseSchema,
  judgeResponseSchema,
  type AdvocateResponse,
  type JudgeResponse,
} from "../ai/contracts";
import { JUDGE_ROLES_IN_ORDER } from "../ai/profiles";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../ai/prompts/delimiters";
import {
  TribunalRunStatus,
  type CaseRepository,
  type TribunalRunRecord,
} from "../cases";
import { hasRequiredRunKinds } from "../cases";
import {
  ModelCallAgentRole,
  ModelCallStage,
  ModelCallStatus,
  type ModelCallRecord,
  type ModelCallRepository,
} from "../model-calls";
import { sumUsage } from "./accounting";
import type {
  CaseResults,
  ModelCallAttemptView,
  RunAccounting,
  RunResults,
} from "./types";

export type GetCaseResultsInput = {
  caseId: string;
};

export type GetCaseResultsDeps = {
  cases: Pick<CaseRepository, "getById">;
  modelCalls: Pick<ModelCallRepository, "listByCaseId">;
};

export type GetCaseResultsSuccess = {
  ok: true;
  results: CaseResults;
};

export type GetCaseResultsFailure = {
  ok: false;
  reason: "CASE_NOT_FOUND" | "INVALID_TOPOLOGY" | "INTEGRITY_VIOLATION";
  errorMessage: string;
};

export type GetCaseResultsResult = GetCaseResultsSuccess | GetCaseResultsFailure;

type RoleOutput<T> =
  | { ok: true; value: T | null }
  | { ok: false; errorMessage: string };

type ReconstructResult =
  | { ok: true; run: RunResults }
  | { ok: false; errorMessage: string };

const AGENT_ROLES_IN_ORDER = [
  ...REPRESENTATIVE_ROLES_IN_ORDER,
  ...JUDGE_ROLES_IN_ORDER,
] as const;

function parseAdvocate(value: unknown): AdvocateResponse | null {
  const parsed = advocateResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseJudge(value: unknown): JudgeResponse | null {
  const parsed = judgeResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function sortModelCalls(rows: readonly ModelCallRecord[]): ModelCallRecord[] {
  return [...rows].sort((left, right) => {
    const roleDelta =
      AGENT_ROLES_IN_ORDER.indexOf(left.agentRole) -
      AGENT_ROLES_IN_ORDER.indexOf(right.agentRole);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    return left.attempt - right.attempt;
  });
}

function outputForRole<T>(
  rows: readonly ModelCallRecord[],
  role: ModelCallAgentRole,
  parse: (value: unknown) => T | null,
): RoleOutput<T> {
  const succeeded = rows.filter(
    (row) => row.agentRole === role && row.status === ModelCallStatus.SUCCEEDED,
  );
  if (succeeded.length > 1) {
    return {
      ok: false,
      errorMessage: `Role ${role} has more than one SUCCEEDED Model Call.`,
    };
  }
  const row = succeeded[0];
  if (!row) {
    return { ok: true, value: null };
  }
  const parsed = parse(row.validatedResponse);
  if (!parsed) {
    return {
      ok: false,
      errorMessage: `SUCCEEDED ${role} Model Call has an invalid validated_response.`,
    };
  }
  return { ok: true, value: parsed };
}

function toAttemptView(
  row: ModelCallRecord,
  succeededOutputs: ReadonlyMap<
    ModelCallAgentRole,
    AdvocateResponse | JudgeResponse
  >,
): ModelCallAttemptView {
  const validatedResponse =
    row.status === ModelCallStatus.SUCCEEDED
      ? (succeededOutputs.get(row.agentRole) ?? null)
      : row.stage === ModelCallStage.ADVOCATES
        ? parseAdvocate(row.validatedResponse)
        : parseJudge(row.validatedResponse);

  return {
    id: row.id,
    runId: row.runId,
    stage: row.stage,
    agentRole: row.agentRole,
    attempt: row.attempt,
    model: row.model,
    status: row.status,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    inputCost: row.inputCost,
    outputCost: row.outputCost,
    totalCost: row.totalCost,
    durationMs: row.durationMs,
    providerCallId: row.providerCallId,
    validatedResponse,
    errorType: row.errorType,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

function accountingFor(rows: readonly ModelCallRecord[]): RunAccounting {
  const agents = Object.fromEntries(
    AGENT_ROLES_IN_ORDER.map((role) => [
      role,
      sumUsage(rows.filter((row) => row.agentRole === role)),
    ]),
  ) as RunAccounting["agents"];

  return {
    agents,
    advocates: sumUsage(
      rows.filter((row) => row.stage === ModelCallStage.ADVOCATES),
    ),
    judges: sumUsage(rows.filter((row) => row.stage === ModelCallStage.JUDGES)),
    run: sumUsage(rows),
  };
}

function reconstructRun(
  run: TribunalRunRecord,
  unsortedRows: readonly ModelCallRecord[],
): ReconstructResult {
  const rows = sortModelCalls(unsortedRows);
  const succeededOutputs = new Map<
    ModelCallAgentRole,
    AdvocateResponse | JudgeResponse
  >();

  const advocateEntries: Array<
    [(typeof REPRESENTATIVE_ROLES_IN_ORDER)[number], AdvocateResponse | null]
  > = [];
  for (const role of REPRESENTATIVE_ROLES_IN_ORDER) {
    const output = outputForRole(rows, role, parseAdvocate);
    if (!output.ok) {
      return output;
    }
    advocateEntries.push([role, output.value]);
    if (output.value) {
      succeededOutputs.set(role, output.value);
    }
  }
  const advocates = Object.fromEntries(advocateEntries) as RunResults["advocates"];

  const judgeEntries: Array<
    [(typeof JUDGE_ROLES_IN_ORDER)[number], JudgeResponse | null]
  > = [];
  for (const role of JUDGE_ROLES_IN_ORDER) {
    const output = outputForRole(rows, role, parseJudge);
    if (!output.ok) {
      return output;
    }
    judgeEntries.push([role, output.value]);
    if (output.value) {
      succeededOutputs.set(role, output.value);
    }
  }
  const judges = Object.fromEntries(judgeEntries) as RunResults["judges"];

  if (run.status === TribunalRunStatus.SUCCEEDED) {
    const missingAdvocates = REPRESENTATIVE_ROLES_IN_ORDER.filter(
      (role) => advocates[role] == null,
    );
    const missingJudges = JUDGE_ROLES_IN_ORDER.filter(
      (role) => judges[role] == null,
    );
    if (
      missingAdvocates.length > 0 ||
      missingJudges.length > 0 ||
      run.finalVerdict == null
    ) {
      return {
        ok: false,
        errorMessage:
          "SUCCEEDED Run is missing required advocate outputs, judge outputs, or a persisted final verdict.",
      };
    }
  }

  return {
    ok: true,
    run: {
      id: run.id,
      runType: run.runType,
      status: run.status,
      finalVerdict: run.finalVerdict,
      failureReason: run.failureReason,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      advocates,
      judges,
      attempts: rows.map((row) => toAttemptView(row, succeededOutputs)),
      accounting: accountingFor(rows),
    },
  };
}

/**
 * Reconstruct Case results from persisted Case, Run, and Model Call rows.
 * Does not execute models or recalculate a Run final verdict.
 */
export async function getCaseResults(
  input: GetCaseResultsInput,
  deps: GetCaseResultsDeps,
): Promise<GetCaseResultsResult> {
  let record;
  try {
    record = await deps.cases.getById(input.caseId);
  } catch (error) {
    return {
      ok: false,
      reason: "INVALID_TOPOLOGY",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Case Tribunal Runs could not be loaded.",
    };
  }

  if (!record) {
    return {
      ok: false,
      reason: "CASE_NOT_FOUND",
      errorMessage: `Case ${input.caseId} was not found.`,
    };
  }

  if (record.runs.length !== 2 || !hasRequiredRunKinds(record.runs)) {
    return {
      ok: false,
      reason: "INVALID_TOPOLOGY",
      errorMessage:
        "Case must have exactly one SAME_MODEL Run and one MIXED_MODELS Run.",
    };
  }

  const sameModel = record.runs.find(
    (run) => run.runType === TribunalRunKind.SAME_MODEL,
  );
  const mixedModels = record.runs.find(
    (run) => run.runType === TribunalRunKind.MIXED_MODELS,
  );
  if (!sameModel || !mixedModels) {
    return {
      ok: false,
      reason: "INVALID_TOPOLOGY",
      errorMessage:
        "Case must have exactly one SAME_MODEL Run and one MIXED_MODELS Run.",
    };
  }

  const calls = await deps.modelCalls.listByCaseId(record.id);
  const sameReconstructed = reconstructRun(
    sameModel,
    calls.filter((row) => row.runId === sameModel.id),
  );
  if (!sameReconstructed.ok) {
    return {
      ok: false,
      reason: "INTEGRITY_VIOLATION",
      errorMessage: sameReconstructed.errorMessage,
    };
  }
  const mixedReconstructed = reconstructRun(
    mixedModels,
    calls.filter((row) => row.runId === mixedModels.id),
  );
  if (!mixedReconstructed.ok) {
    return {
      ok: false,
      reason: "INTEGRITY_VIOLATION",
      errorMessage: mixedReconstructed.errorMessage,
    };
  }

  return {
    ok: true,
    results: {
      case: {
        id: record.id,
        originalFileName: record.originalFileName,
        createdAt: record.createdAt,
      },
      runs: {
        [TribunalRunKind.SAME_MODEL]: sameReconstructed.run,
        [TribunalRunKind.MIXED_MODELS]: mixedReconstructed.run,
      },
      accounting: sumUsage(calls),
    },
  };
}
