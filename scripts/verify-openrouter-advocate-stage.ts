import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getModelIdForRole, TribunalRunKind } from "../lib/ai/configurations";
import { classifyRetry, defaultSleep } from "../lib/ai/execution";
import {
  completeChat,
  MissingOpenRouterApiKeyError,
  getOpenRouterApiKey,
  requireOpenRouterApiKey,
  type OpenRouterChatCompletionInput,
  type OpenRouterClientOptions,
} from "../lib/ai/openrouter";
import { executeAdvocateStage } from "../lib/tribunal";
import { JudgeRole, RepresentativeRole } from "../lib/ai/profiles";
import { buildJudgePrompt } from "../lib/ai/prompts";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../lib/ai/prompts/delimiters";
import { PostgresCaseRepository, PostgresTribunalRunRepository } from "../lib/cases";
import {
  CANONICAL_CHARGE_SHEET_FIXTURE_PATH,
} from "../lib/charge-sheet/canonical";
import { applyMigrations, closePool, query } from "../lib/db";
import { PostgresModelCallRepository } from "../lib/model-calls";
import type { ModelCallRecord } from "../lib/model-calls";

const VERIFY_FILE_NAME = "phase5-verify-t-001.md";

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

function roleFromInputModelMessages(content: string): RepresentativeRole | null {
  const match = content.match(
    /Seat: (DEFENSE_1|DEFENSE_2|PROSECUTION_1|PROSECUTION_2)/,
  );
  return match?.[1] as RepresentativeRole | undefined ?? null;
}

function summarizeRow(row: ModelCallRecord) {
  return {
    attempt: row.attempt,
    status: row.status,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    inputCost: row.inputCost,
    outputCost: row.outputCost,
    totalCost: row.totalCost,
    durationMs: row.durationMs,
    providerCallId: row.providerCallId,
    errorType: row.errorType,
    errorMessage: row.errorMessage,
    validatedResponse: row.validatedResponse,
  };
}

function retryFromRows(rows: ModelCallRecord[]) {
  const first = rows.find((row) => row.attempt === 1);
  const second = rows.find((row) => row.attempt === 2);
  if (!first || first.status !== "FAILED" || !second) {
    return { decided: false, reason: null, delayMs: null };
  }
  const retryAfter = first.errorMessage?.match(/retry_after=([^, )]+)/)?.[1] ?? null;
  const statusMatch = first.errorMessage?.match(/HTTP (\d+)/);
  const decision = classifyRetry({
    errorType: first.errorType ?? "UNKNOWN",
    httpStatus: statusMatch ? Number(statusMatch[1]) : null,
    retryAfterHeader: retryAfter,
  });
  return {
    decided: decision.retryable,
    reason: decision.reason,
    delayMs: decision.delayMs,
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

  const launchTimes: number[] = [];
  const launchRoles: RepresentativeRole[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const delays: number[] = [];

  const result = await executeAdvocateStage(
    {
      caseId: created.id,
      runId: sameModelRun.id,
      runKind: TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown,
      apiKey,
    },
    {
      modelCalls,
      runs,
      completeChat: async (
        input: OpenRouterChatCompletionInput,
        options: OpenRouterClientOptions,
      ) => {
        const role = roleFromInputModelMessages(
          input.messages.find((message) => message.role === "system")?.content ??
            "",
        );
        if (role) {
          launchRoles.push(role);
        }
        launchTimes.push(Date.now());
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          return await completeChat(input, options);
        } finally {
          inFlight -= 1;
        }
      },
      sleep: async (ms: number) => {
        delays.push(ms);
        await defaultSleep(ms);
      },
    },
  );

  const stored = await modelCalls.listByRunId(sameModelRun.id);
  const run = await runs.getById(sameModelRun.id);

  const roles = Object.fromEntries(
    REPRESENTATIVE_ROLES_IN_ORDER.map((role) => {
      const rows = stored
        .filter((row) => row.agentRole === role)
        .sort((left, right) => left.attempt - right.attempt);
      return [
        role,
        {
          configuredModel: getModelIdForRole(TribunalRunKind.SAME_MODEL, role),
          attemptsMade: rows.length,
          retry: retryFromRows(rows),
          returnedModels: rows.map((row) => row.model),
          attempts: rows.map(summarizeRow),
        },
      ];
    }),
  );

  let judgePromptReady = false;
  if (result.ok) {
    buildJudgePrompt({
      role: JudgeRole.JUDGE_1,
      chargeSheetMarkdown,
      advocateResponses: result.responses,
    });
    judgePromptReady = true;
  }

  const firstLaunch = launchTimes[0] ?? null;
  const lastLaunch = launchTimes[launchTimes.length - 1] ?? null;

  const report = {
    ok: result.ok,
    configuredSameModel: getModelIdForRole(
      TribunalRunKind.SAME_MODEL,
      RepresentativeRole.DEFENSE_1,
    ),
    concurrentStart: {
      launchedRoles: launchRoles,
      launchCount: launchTimes.length,
      maxInFlight,
      firstLastLaunchGapMs:
        firstLaunch != null && lastLaunch != null ? lastLaunch - firstLaunch : null,
    },
    recordedRetryDelaysMs: delays,
    liveRequests: stored.length,
    successfulRoles: result.ok
      ? [...REPRESENTATIVE_ROLES_IN_ORDER]
      : REPRESENTATIVE_ROLES_IN_ORDER.filter(
          (role) => !result.failedRoles.includes(role),
        ),
    permanentlyFailedRoles: result.ok ? [] : result.failedRoles,
    failures: result.ok ? [] : result.failures,
    roles,
    storedRowCount: stored.length,
    distinctModels: [...new Set(stored.map((row) => row.model))],
    thirdAttempt: stored.some((row) => row.attempt > 2),
    runStatus: run?.status ?? null,
    runFinalVerdict: run?.finalVerdict ?? null,
    judgePromptReady,
    secretPersisted: false,
    promptPersisted: false,
    cleanedUp: true,
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.thirdAttempt || report.distinctModels.length > 1) {
    process.exitCode = 1;
  } else if (!result.ok) {
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
