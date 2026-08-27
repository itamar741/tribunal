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
import {
  JUDGE_ROLES_IN_ORDER,
  JudgeRole,
  RepresentativeRole,
} from "../lib/ai/profiles";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../lib/ai/prompts/delimiters";
import { executeTribunalRun } from "../lib/tribunal";
import { PostgresCaseRepository, PostgresTribunalRunRepository } from "../lib/cases";
import {
  CANONICAL_CHARGE_SHEET_FIXTURE_PATH,
} from "../lib/charge-sheet/canonical";
import { applyMigrations, closePool, query } from "../lib/db";
import { PostgresModelCallRepository } from "../lib/model-calls";
import type { ModelCallRecord } from "../lib/model-calls";

const VERIFY_FILE_NAME = "phase7-verify-t-001.md";

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

function roleFromSystem(content: string): string | null {
  const match = content.match(
    /Seat: (DEFENSE_1|DEFENSE_2|PROSECUTION_1|PROSECUTION_2|JUDGE_1|JUDGE_2|JUDGE_3)/,
  );
  return match?.[1] ?? null;
}

function isJudgeRole(role: string): role is JudgeRole {
  return JUDGE_ROLES_IN_ORDER.includes(role as JudgeRole);
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

function summarizeRoles(
  stored: ModelCallRecord[],
  roles: readonly string[],
) {
  return Object.fromEntries(
    roles.map((role) => {
      const rows = stored
        .filter((row) => row.agentRole === role)
        .sort((left, right) => left.attempt - right.attempt);
      return [
        role,
        {
          configuredModel: getModelIdForRole(
            TribunalRunKind.SAME_MODEL,
            role as RepresentativeRole | JudgeRole,
          ),
          attemptsMade: rows.length,
          retry: retryFromRows(rows),
          returnedModels: rows.map((row) => row.model),
          attempts: rows.map(summarizeRow),
        },
      ];
    }),
  );
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

  const launchRoles: string[] = [];
  const advocateLaunchTimes: number[] = [];
  const judgeLaunchTimes: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let maxAdvocateInFlight = 0;
  let maxJudgeInFlight = 0;
  const delays: number[] = [];

  const result = await executeTribunalRun(
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
        const role = roleFromSystem(
          input.messages.find((message) => message.role === "system")?.content ??
            "",
        );
        if (role) {
          launchRoles.push(role);
        }
        const now = Date.now();
        if (role && isJudgeRole(role)) {
          judgeLaunchTimes.push(now);
        } else {
          advocateLaunchTimes.push(now);
        }
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (role && isJudgeRole(role)) {
          maxJudgeInFlight = Math.max(maxJudgeInFlight, inFlight);
        } else {
          maxAdvocateInFlight = Math.max(maxAdvocateInFlight, inFlight);
        }
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
  const mixedModelRun = created.runs.find(
    (item) => item.runType === TribunalRunKind.MIXED_MODELS,
  );
  const mixedAfter = mixedModelRun
    ? await runs.getById(mixedModelRun.id)
    : null;
  const lastAdvocateLaunch = advocateLaunchTimes[advocateLaunchTimes.length - 1];
  const firstJudgeLaunch = judgeLaunchTimes[0];

  const report = {
    ok: result.ok,
    configuredSameModel: getModelIdForRole(
      TribunalRunKind.SAME_MODEL,
      RepresentativeRole.DEFENSE_1,
    ),
    concurrentStart: {
      launchedRoles: launchRoles,
      advocateLaunchCount: advocateLaunchTimes.length,
      judgeLaunchCount: judgeLaunchTimes.length,
      maxInFlight,
      maxAdvocateInFlight,
      maxJudgeInFlight,
      advocateFirstLastLaunchGapMs:
        advocateLaunchTimes[0] != null && lastAdvocateLaunch != null
          ? lastAdvocateLaunch - advocateLaunchTimes[0]
          : null,
      judgeFirstLastLaunchGapMs:
        firstJudgeLaunch != null &&
        judgeLaunchTimes[judgeLaunchTimes.length - 1] != null
          ? judgeLaunchTimes[judgeLaunchTimes.length - 1] - firstJudgeLaunch
          : null,
      judgesStartedAfterAdvocates:
        lastAdvocateLaunch != null && firstJudgeLaunch != null
          ? firstJudgeLaunch >= lastAdvocateLaunch
          : null,
    },
    recordedRetryDelaysMs: delays,
    liveRequests: stored.length,
    failedStage: result.ok ? null : result.failedStage,
    permanentlyFailedRoles:
      !result.ok && result.failedStage !== "RUN" ? result.failedRoles : [],
    failures:
      !result.ok && result.failedStage !== "RUN" ? result.failures : [],
    advocates: result.ok
      ? {
          DEFENSE_1: result.advocates.DEFENSE_1.summary.length > 0,
          DEFENSE_2: result.advocates.DEFENSE_2.summary.length > 0,
          PROSECUTION_1: result.advocates.PROSECUTION_1.summary.length > 0,
          PROSECUTION_2: result.advocates.PROSECUTION_2.summary.length > 0,
        }
      : null,
    judges: result.ok
      ? {
          JUDGE_1: result.judges.JUDGE_1.verdict,
          JUDGE_2: result.judges.JUDGE_2.verdict,
          JUDGE_3: result.judges.JUDGE_3.verdict,
        }
      : null,
    majority: result.ok ? result.finalVerdict : null,
    roles: {
      ...summarizeRoles(stored, REPRESENTATIVE_ROLES_IN_ORDER),
      ...summarizeRoles(stored, JUDGE_ROLES_IN_ORDER),
    },
    storedRowCount: stored.length,
    distinctModels: [...new Set(stored.map((row) => row.model))],
    thirdAttempt: stored.some((row) => row.attempt > 2),
    runStatus: run?.status ?? null,
    runFinalVerdict: run?.finalVerdict ?? null,
    mixedModelsRunUntouched: mixedAfter?.status === "PENDING",
    secretPersisted: false,
    promptPersisted: false,
    cleanedUp: true,
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.thirdAttempt || report.distinctModels.length > 1 || !result.ok) {
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
