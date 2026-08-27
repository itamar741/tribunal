import { TribunalRunKind } from "../ai/configurations";
import type { CaseRecord, CaseRepository, TribunalRunRecord } from "../cases";
import { hasRequiredRunKinds } from "../cases";
import {
  executeTribunalRun,
  type ExecuteTribunalRunDeps,
  type TribunalRunResult,
  type TribunalRunSuccess,
} from "./execute-tribunal-run";

export type ExecuteCaseTribunalsInput = {
  caseId: string;
  chargeSheetMarkdown: string;
  apiKey: string;
};

export type ExecuteCaseTribunalsDeps = ExecuteTribunalRunDeps & {
  cases: Pick<CaseRepository, "getById">;
};

export type CaseTribunalRunUnexpectedFailure = {
  ok: false;
  failedStage: "RUN";
  reason: "UNEXPECTED";
  errorMessage: string;
};

export type CaseTribunalRunResult =
  | TribunalRunResult
  | CaseTribunalRunUnexpectedFailure;

/**
 * Case-level `ok` means both durable Runs succeeded.
 * It does not mean that no usable Run result exists.
 */
export type CaseTribunalSuccess = {
  ok: true;
  runs: {
    readonly [TribunalRunKind.SAME_MODEL]: TribunalRunSuccess;
    readonly [TribunalRunKind.MIXED_MODELS]: TribunalRunSuccess;
  };
};

/**
 * At least one Run failed. Each Run result remains independent:
 * a successful sibling keeps its validated outputs and final verdict.
 * There is no Case-level combined verdict.
 */
export type CaseTribunalRunFailure = {
  ok: false;
  reason: "RUN_FAILURE";
  runs: {
    readonly [TribunalRunKind.SAME_MODEL]: CaseTribunalRunResult;
    readonly [TribunalRunKind.MIXED_MODELS]: CaseTribunalRunResult;
  };
};

export type CaseTribunalSetupFailure = {
  ok: false;
  reason: "CASE_NOT_FOUND" | "INVALID_TOPOLOGY";
  errorMessage: string;
};

export type CaseTribunalResult =
  | CaseTribunalSuccess
  | CaseTribunalRunFailure
  | CaseTribunalSetupFailure;

function unexpectedRunFailure(error: unknown): CaseTribunalRunUnexpectedFailure {
  return {
    ok: false,
    failedStage: "RUN",
    reason: "UNEXPECTED",
    errorMessage:
      error instanceof Error
        ? error.message
        : "Tribunal Run failed unexpectedly.",
  };
}

function setupFailure(
  reason: CaseTribunalSetupFailure["reason"],
  errorMessage: string,
): CaseTribunalSetupFailure {
  return {
    ok: false,
    reason,
    errorMessage,
  };
}

function resolveExistingRuns(
  caseRecord: CaseRecord,
):
  | {
      ok: true;
      sameModel: TribunalRunRecord;
      mixedModels: TribunalRunRecord;
    }
  | { ok: false; errorMessage: string } {
  const runs = caseRecord.runs;
  if (runs.length !== 2 || !hasRequiredRunKinds(runs)) {
    return {
      ok: false,
      errorMessage:
        "Case must have exactly one SAME_MODEL Run and one MIXED_MODELS Run.",
    };
  }

  if (runs.some((run) => run.caseId !== caseRecord.id)) {
    return {
      ok: false,
      errorMessage: "Tribunal Run case_id does not match the requested Case.",
    };
  }

  const sameModel = runs.find(
    (run) => run.runType === TribunalRunKind.SAME_MODEL,
  );
  const mixedModels = runs.find(
    (run) => run.runType === TribunalRunKind.MIXED_MODELS,
  );
  if (!sameModel || !mixedModels) {
    return {
      ok: false,
      errorMessage:
        "Case must have exactly one SAME_MODEL Run and one MIXED_MODELS Run.",
    };
  }

  return { ok: true, sameModel, mixedModels };
}

function toCaseSuccess(
  sameModel: CaseTribunalRunResult,
  mixedModels: CaseTribunalRunResult,
): CaseTribunalSuccess | null {
  if (!sameModel.ok || !mixedModels.ok) {
    return null;
  }
  return {
    ok: true,
    runs: {
      [TribunalRunKind.SAME_MODEL]: sameModel,
      [TribunalRunKind.MIXED_MODELS]: mixedModels,
    },
  };
}

/**
 * Execute both durable Tribunal Runs for one existing Case concurrently.
 *
 * Resolves SAME_MODEL and MIXED_MODELS from persistence. Reuses
 * executeTribunalRun for each Run. Does not create Runs, aggregate
 * tokens/cost, or invent a Case-level verdict.
 */
export async function executeCaseTribunals(
  input: ExecuteCaseTribunalsInput,
  deps: ExecuteCaseTribunalsDeps,
): Promise<CaseTribunalResult> {
  const { cases, ...runDeps } = deps;

  let caseRecord: CaseRecord | null;
  try {
    caseRecord = await cases.getById(input.caseId);
  } catch (error) {
    return setupFailure(
      "INVALID_TOPOLOGY",
      error instanceof Error
        ? error.message
        : "Case Tribunal Runs could not be loaded.",
    );
  }

  if (!caseRecord) {
    return setupFailure("CASE_NOT_FOUND", `Case ${input.caseId} was not found.`);
  }

  const resolved = resolveExistingRuns(caseRecord);
  if (!resolved.ok) {
    return setupFailure("INVALID_TOPOLOGY", resolved.errorMessage);
  }

  const settled = await Promise.allSettled([
    executeTribunalRun(
      {
        caseId: input.caseId,
        runId: resolved.sameModel.id,
        runKind: TribunalRunKind.SAME_MODEL,
        chargeSheetMarkdown: input.chargeSheetMarkdown,
        apiKey: input.apiKey,
      },
      runDeps,
    ),
    executeTribunalRun(
      {
        caseId: input.caseId,
        runId: resolved.mixedModels.id,
        runKind: TribunalRunKind.MIXED_MODELS,
        chargeSheetMarkdown: input.chargeSheetMarkdown,
        apiKey: input.apiKey,
      },
      runDeps,
    ),
  ]);

  const sameModel =
    settled[0].status === "fulfilled"
      ? settled[0].value
      : unexpectedRunFailure(settled[0].reason);
  const mixedModels =
    settled[1].status === "fulfilled"
      ? settled[1].value
      : unexpectedRunFailure(settled[1].reason);

  return (
    toCaseSuccess(sameModel, mixedModels) ?? {
      ok: false,
      reason: "RUN_FAILURE",
      runs: {
        [TribunalRunKind.SAME_MODEL]: sameModel,
        [TribunalRunKind.MIXED_MODELS]: mixedModels,
      },
    }
  );
}
