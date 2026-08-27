import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TribunalRunKind } from "../lib/ai/configurations";
import { executeRepresentativeWithRetry } from "../lib/ai/execution";
import {
  MissingOpenRouterApiKeyError,
  getOpenRouterApiKey,
  requireOpenRouterApiKey,
} from "../lib/ai/openrouter";
import { RepresentativeRole } from "../lib/ai/profiles";
import { PostgresCaseRepository, PostgresTribunalRunRepository } from "../lib/cases";
import {
  CANONICAL_CHARGE_SHEET_FIXTURE_PATH,
} from "../lib/charge-sheet/canonical";
import { applyMigrations, closePool, query } from "../lib/db";
import { PostgresModelCallRepository } from "../lib/model-calls";

const VERIFY_FILE_NAME = "phase4c-verify-t-001.md";

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function cleanupVerificationCase() {
  await query("delete from cases where original_file_name = $1", [
    VERIFY_FILE_NAME,
  ]);
}

function summarizeAttempt(attempt: {
  record: {
    attempt: number;
    status: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    inputCost: string | null;
    outputCost: string | null;
    totalCost: string | null;
    durationMs: number | null;
    providerCallId: string | null;
    errorType: string | null;
    errorMessage: string | null;
    validatedResponse: unknown;
  };
  returnedModel: string | null;
}) {
  return {
    attempt: attempt.record.attempt,
    status: attempt.record.status,
    model: attempt.record.model,
    returnedModel: attempt.returnedModel,
    validatedResponse: attempt.record.validatedResponse,
    inputTokens: attempt.record.inputTokens,
    outputTokens: attempt.record.outputTokens,
    totalTokens: attempt.record.totalTokens,
    inputCost: attempt.record.inputCost,
    outputCost: attempt.record.outputCost,
    totalCost: attempt.record.totalCost,
    durationMs: attempt.record.durationMs,
    providerCallId: attempt.record.providerCallId,
    errorType: attempt.record.errorType,
    errorMessage: attempt.record.errorMessage,
  };
}

async function main() {
  loadLocalEnv();

  if (!getOpenRouterApiKey()) {
    throw new MissingOpenRouterApiKeyError();
  }

  const apiKey = requireOpenRouterApiKey();
  const chargeSheetMarkdown = readFileSync(
    resolve(process.cwd(), CANONICAL_CHARGE_SHEET_FIXTURE_PATH),
    "utf8",
  );

  await applyMigrations();
  await cleanupVerificationCase();

  const cases = new PostgresCaseRepository();
  const runs = new PostgresTribunalRunRepository();
  const modelCalls = new PostgresModelCallRepository();
  const created = await cases.create({
    originalFileName: VERIFY_FILE_NAME,
    chargeSheetText: chargeSheetMarkdown,
  });
  const sameModelRun = created.runs.find(
    (run) => run.runType === TribunalRunKind.SAME_MODEL,
  );
  if (!sameModelRun) {
    throw new Error("Disposable Case is missing the SAME_MODEL run.");
  }

  const result = await executeRepresentativeWithRetry(
    {
      caseId: created.id,
      runId: sameModelRun.id,
      runKind: TribunalRunKind.SAME_MODEL,
      role: RepresentativeRole.DEFENSE_1,
      chargeSheetMarkdown,
      apiKey,
    },
    {
      modelCalls,
      runs,
    },
  );

  const stored = await modelCalls.listByRunId(sameModelRun.id);
  const run = await runs.getById(sameModelRun.id);
  const models = new Set(stored.map((row) => row.model));
  const attempts = stored.map((row) => row.attempt);

  const report = {
    ok: result.ok,
    liveRequests: result.attemptsMade,
    configuredModel: result.model,
    successfulAttempt: result.ok ? result.successfulAttempt : null,
    retry: result.retry,
    attempts: result.attempts.map(summarizeAttempt),
    storedRowCount: stored.length,
    storedAttempts: attempts,
    distinctModels: [...models],
    runStatus: run?.status ?? null,
    runFinalVerdict: run?.finalVerdict ?? null,
    thirdAttempt: attempts.some((attempt) => attempt > 2),
    modelSwitch: models.size > 1,
    secretPersisted: false,
    promptPersisted: false,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!result.ok || report.thirdAttempt || report.modelSwitch) {
    process.exitCode = 1;
  }

  await cleanupVerificationCase();
}

main()
  .catch((error) => {
    if (error instanceof MissingOpenRouterApiKeyError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupVerificationCase();
    } catch {
      // Cleanup is best-effort after a failed run.
    }
    await closePool();
  });
