import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { getModelIdForRole, TribunalRunKind } from "../ai/configurations";
import type { AdvocateResponse } from "../ai/contracts";
import { AttemptErrorType } from "../ai/execution";
import {
  OpenRouterTransportErrorType,
  type OpenRouterChatCompletionInput,
  type OpenRouterChatCompletionResult,
} from "../ai/openrouter";
import { RepresentativeRole } from "../ai/profiles";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../ai/prompts/delimiters";
import { buildJudgePrompt, type JudgePromptInput } from "../ai/prompts";
import { JudgeRole } from "../ai/profiles";
import {
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../model-calls";
import { executeAdvocateStage } from "./execute-advocate-stage";

function advocateFor(role: RepresentativeRole): AdvocateResponse {
  return {
    summary: `${role} unique summary.`,
    arguments: [
      { title: `${role} one`, argument: "The charge sheet records a surrender." },
      { title: `${role} two`, argument: "The charge sheet records an embrace." },
      { title: `${role} three`, argument: "The charge sheet records unused alternatives." },
    ],
    conclusion: `${role} unique conclusion.`,
  };
}

class MemoryModelCalls implements ModelCallRepository {
  readonly records: ModelCallRecord[] = [];

  async insert(input: NewModelCallInput): Promise<ModelCallRecord> {
    const record: ModelCallRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.records.push(record);
    return record;
  }

  async listByRunId(runId: string): Promise<ModelCallRecord[]> {
    return this.records.filter((record) => record.runId === runId);
  }

  async listByCaseId(caseId: string): Promise<ModelCallRecord[]> {
    return this.records.filter((record) => record.caseId === caseId);
  }
}

class MemoryRuns {
  status: "PENDING" | "RUNNING" | "FAILED" = "PENDING";
  failureReason: string | null = null;
  finalVerdict: null = null;
  markRunningCount = 0;
  markFailedCount = 0;

  async markRunning(runId: string): Promise<{ id: string; status: "RUNNING" }> {
    this.markRunningCount += 1;
    if (this.status !== "PENDING") {
      throw new Error(`Tribunal Run ${runId} cannot be marked RUNNING.`);
    }
    this.status = "RUNNING";
    return { id: runId, status: "RUNNING" };
  }

  async markFailed(
    runId: string,
    failureReason: string,
  ): Promise<{ id: string; status: "FAILED" }> {
    this.markFailedCount += 1;
    if (this.status !== "RUNNING") {
      throw new Error(`Tribunal Run ${runId} cannot be marked FAILED.`);
    }
    this.status = "FAILED";
    this.failureReason = failureReason;
    return { id: runId, status: "FAILED" };
  }
}

function successTransport(role: RepresentativeRole): OpenRouterChatCompletionResult {
  return {
    ok: true,
    content: JSON.stringify(advocateFor(role)),
    returnedModel: "minimax/minimax-m3:free",
    providerCallId: `gen-${role}`,
    generationId: null,
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      totalCost: "0",
    },
    durationMs: 20,
  };
}

function httpFailure(status: number): OpenRouterChatCompletionResult {
  return {
    ok: false,
    errorType: OpenRouterTransportErrorType.HTTP_ERROR,
    errorMessage: `OpenRouter HTTP ${status}`,
    httpStatus: status,
    retryAfterHeader: null,
    errorCode: null,
    providerErrorType: null,
    providerCode: null,
    finishReason: null,
    nativeFinishReason: null,
    envelopeKind: null,
    generationId: null,
    shape: null,
    routing: null,
    content: null,
    returnedModel: null,
    providerCallId: null,
    usage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      totalCost: null,
    },
    durationMs: 10,
  };
}

function roleFromInput(input: OpenRouterChatCompletionInput): RepresentativeRole {
  const system = input.messages.find((message) => message.role === "system");
  const match = system?.content.match(/Seat: (DEFENSE_1|DEFENSE_2|PROSECUTION_1|PROSECUTION_2)/);
  if (!match || !match[1]) {
    throw new Error("Transport input is missing a representative seat.");
  }
  return match[1] as RepresentativeRole;
}

async function runStage(options: {
  respond: (
    input: OpenRouterChatCompletionInput,
    role: RepresentativeRole,
  ) => Promise<OpenRouterChatCompletionResult> | OpenRouterChatCompletionResult;
  runKind?: TribunalRunKind;
  chargeSheetMarkdown?: string;
  runs?: MemoryRuns;
}) {
  const modelCalls = new MemoryModelCalls();
  const runs = options.runs ?? new MemoryRuns();
  const startedAt = new Map<RepresentativeRole, number>();
  const inFlight = { current: 0, max: 0 };
  const calls: OpenRouterChatCompletionInput[] = [];

  const result = await executeAdvocateStage(
    {
      caseId: "case-advocates",
      runId: "run-advocates",
      runKind: options.runKind ?? TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown: options.chargeSheetMarkdown ?? "# Case\n\nFacts.",
      apiKey: "test-key",
    },
    {
      modelCalls,
      runs,
      sleep: async () => {},
      completeChat: async (input) => {
        const role = roleFromInput(input);
        calls.push(input);
        startedAt.set(role, Date.now());
        inFlight.current += 1;
        inFlight.max = Math.max(inFlight.max, inFlight.current);
        try {
          return await options.respond(input, role);
        } finally {
          inFlight.current -= 1;
        }
      },
    },
  );

  return { result, modelCalls, runs, calls, startedAt, inFlight };
}

describe("executeAdvocateStage", () => {
  it("starts all four representatives concurrently and returns judge-ready responses", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;

    const { result, modelCalls, runs, calls, inFlight } = await Promise.race([
      runStage({
        respond: async (_input, role) => {
          started += 1;
          if (started === 4) {
            release();
          }
          await gate;
          return successTransport(role);
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Advocate stage did not overlap in time.")),
          1000,
        );
      }),
    ]);

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(started, 4);
    assert.equal(inFlight.max, 4);
    assert.equal(calls.length, 4);
    assert.equal(modelCalls.records.length, 4);
    assert.equal(runs.markRunningCount, 1);
    assert.equal(runs.markFailedCount, 0);
    assert.equal(runs.status, "RUNNING");

    for (const role of REPRESENTATIVE_ROLES_IN_ORDER) {
      assert.deepEqual(result.responses[role], advocateFor(role));
      assert.equal(result.agents[role].successfulAttempt, 1);
      assert.equal(
        result.agents[role].model,
        getModelIdForRole(TribunalRunKind.SAME_MODEL, role),
      );
    }

    const judgeInput: JudgePromptInput = {
      role: JudgeRole.JUDGE_1,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      advocateResponses: result.responses,
    };
    const prompt = buildJudgePrompt(judgeInput);
    assert.equal(prompt.messages.length, 2);
    assert.deepEqual(
      Object.keys(result.responses).sort(),
      [...REPRESENTATIVE_ROLES_IN_ORDER].sort(),
    );
  });

  it("uses configured MIXED_MODELS IDs without sequential execution", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;

    const { result, calls, inFlight } = await runStage({
      runKind: TribunalRunKind.MIXED_MODELS,
      respond: async (input, role) => {
        started += 1;
        if (started === 4) {
          release();
        }
        await gate;
        assert.equal(
          input.model,
          getModelIdForRole(TribunalRunKind.MIXED_MODELS, role),
        );
        return successTransport(role);
      },
    });

    assert.equal(result.ok, true);
    assert.equal(inFlight.max, 4);
    const models = calls.map((call) => call.model);
    assert.equal(new Set(models).size, 4);
  });

  it("fails the run when any representative permanently fails and does not fabricate responses", async () => {
    const { result, runs, modelCalls } = await runStage({
      respond: async (_input, role) => {
        if (role === RepresentativeRole.DEFENSE_2) {
          return httpFailure(401);
        }
        return successTransport(role);
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.deepEqual(result.failedRoles, [RepresentativeRole.DEFENSE_2]);
    assert.equal(result.failures[0]?.errorType, AttemptErrorType.HTTP_ERROR);
    assert.equal(result.failures[0]?.attemptsMade, 1);
    assert.equal("responses" in result, false);
    assert.equal(runs.status, "FAILED");
    assert.match(runs.failureReason ?? "", /DEFENSE_2 \(HTTP_ERROR\)/);
    assert.equal(runs.markFailedCount, 1);
    assert.equal(
      modelCalls.records.filter((record) => record.agentRole === "DEFENSE_2")
        .length,
      1,
    );
    assert.equal(modelCalls.records.length, 4);
    assert.equal(runs.finalVerdict, null);
  });

  it("lets all four settle when two advocates permanently fail and marks FAILED once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const failed = new Set<RepresentativeRole>([
      RepresentativeRole.DEFENSE_2,
      RepresentativeRole.PROSECUTION_1,
    ]);

    const { result, runs, modelCalls, inFlight } = await Promise.race([
      runStage({
        respond: async (_input, role) => {
          started += 1;
          if (started === 4) {
            release();
          }
          await gate;
          if (failed.has(role)) {
            return httpFailure(401);
          }
          return successTransport(role);
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Two-failure stage did not overlap in time.")),
          1000,
        );
      }),
    ]);

    assert.equal(started, 4);
    assert.equal(inFlight.max, 4);
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.deepEqual(result.failedRoles, [
      RepresentativeRole.DEFENSE_2,
      RepresentativeRole.PROSECUTION_1,
    ]);
    assert.equal(result.failures.length, 2);
    assert.equal("responses" in result, false);
    assert.equal(modelCalls.records.length, 4);
    assert.equal(
      modelCalls.records.filter((record) => record.status === "FAILED").length,
      2,
    );
    assert.equal(runs.markRunningCount, 1);
    assert.equal(runs.markFailedCount, 1);
    assert.equal(runs.status, "FAILED");
    assert.equal(runs.finalVerdict, null);
    assert.match(
      runs.failureReason ?? "",
      /DEFENSE_2 \(HTTP_ERROR\); PROSECUTION_1 \(HTTP_ERROR\)/,
    );
  });

  it("retries a retryable agent independently and still waits for the other three", async () => {
    const attempts = new Map<RepresentativeRole, number>();
    const { result, modelCalls } = await runStage({
      respond: async (_input, role) => {
        const count = (attempts.get(role) ?? 0) + 1;
        attempts.set(role, count);
        if (role === RepresentativeRole.PROSECUTION_1 && count === 1) {
          return httpFailure(502);
        }
        return successTransport(role);
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.agents.PROSECUTION_1.successfulAttempt, 2);
    assert.equal(modelCalls.records.length, 5);
    assert.deepEqual(
      modelCalls.records
        .filter((record) => record.agentRole === "PROSECUTION_1")
        .map((record) => record.attempt),
      [1, 2],
    );
  });

  it("does not create audit rows when the charge sheet is invalid before any request", async () => {
    const modelCalls = new MemoryModelCalls();
    const runs = new MemoryRuns();
    let requests = 0;
    const result = await executeAdvocateStage(
      {
        caseId: "case-empty",
        runId: "run-empty",
        runKind: TribunalRunKind.SAME_MODEL,
        chargeSheetMarkdown: "   ",
        apiKey: "test-key",
      },
      {
        modelCalls,
        runs,
        completeChat: async () => {
          requests += 1;
          return successTransport(RepresentativeRole.DEFENSE_1);
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(requests, 0);
    assert.equal(modelCalls.records.length, 0);
    assert.equal(runs.markRunningCount, 0);
    assert.equal(runs.status, "PENDING");
    if (!result.ok) {
      assert.equal(result.failures[0]?.attemptsMade, 0);
      assert.equal(
        result.failures[0]?.errorType,
        AttemptErrorType.INVALID_CONFIGURATION,
      );
    }
  });

  it("does not mark RUNNING when the run cannot start", async () => {
    const modelCalls = new MemoryModelCalls();
    const runs = new MemoryRuns();
    runs.status = "FAILED";
    let requests = 0;
    const result = await executeAdvocateStage(
      {
        caseId: "case-already-failed",
        runId: "run-already-failed",
        runKind: TribunalRunKind.SAME_MODEL,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        apiKey: "test-key",
      },
      {
        modelCalls,
        runs,
        completeChat: async () => {
          requests += 1;
          return successTransport(RepresentativeRole.DEFENSE_1);
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(requests, 0);
    assert.equal(modelCalls.records.length, 0);
    assert.equal(runs.markRunningCount, 1);
    assert.equal(runs.status, "FAILED");
    assert.equal(runs.finalVerdict, null);
  });
});
