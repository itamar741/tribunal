import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { getModelIdForRole, TribunalRunKind } from "../ai/configurations";
import type { AdvocateResponse, JudgeResponse } from "../ai/contracts";
import {
  OpenRouterTransportErrorType,
  type OpenRouterChatCompletionInput,
  type OpenRouterChatCompletionResult,
} from "../ai/openrouter";
import { JudgeRole, RepresentativeRole } from "../ai/profiles";
import type { JudgeAdvocateResponses, JudgePromptInput } from "../ai/prompts";
import {
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../model-calls";
import { TribunalRunVerdict } from "../cases";
import { executeAdvocateStage } from "./execute-advocate-stage";
import {
  executeJudgeStage,
  type ExecuteJudgeStageInput,
} from "./execute-judge-stage";

function advocate(role: RepresentativeRole): AdvocateResponse {
  return {
    summary: `${role} summary.`,
    arguments: [
      { title: `${role} one`, argument: "The charge sheet records a surrender." },
      { title: `${role} two`, argument: "The charge sheet records an embrace." },
      { title: `${role} three`, argument: "The charge sheet records unused alternatives." },
    ],
    conclusion: `${role} conclusion.`,
  };
}

const advocates: JudgeAdvocateResponses = {
  [RepresentativeRole.DEFENSE_1]: advocate(RepresentativeRole.DEFENSE_1),
  [RepresentativeRole.DEFENSE_2]: advocate(RepresentativeRole.DEFENSE_2),
  [RepresentativeRole.PROSECUTION_1]: advocate(RepresentativeRole.PROSECUTION_1),
  [RepresentativeRole.PROSECUTION_2]: advocate(RepresentativeRole.PROSECUTION_2),
};

function judgeResponse(verdict: JudgeResponse["verdict"], role: JudgeRole): JudgeResponse {
  return {
    verdict,
    summary: `${role} summary.`,
    key_reasons: [
      `${role} reason one from the charge sheet.`,
      `${role} reason two from the charge sheet.`,
      `${role} reason three from the charge sheet.`,
    ],
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
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" = "RUNNING";
  failureReason: string | null = null;
  finalVerdict: string | null = null;
  markRunningCount = 0;
  markSucceededCount = 0;
  markFailedCount = 0;

  async markRunning(): Promise<void> {
    this.markRunningCount += 1;
    this.status = "RUNNING";
  }

  async markSucceeded(
    _runId: string,
    finalVerdict: string,
  ): Promise<void> {
    this.markSucceededCount += 1;
    this.status = "SUCCEEDED";
    this.finalVerdict = finalVerdict;
    this.failureReason = null;
  }

  async markFailed(_runId: string, failureReason: string): Promise<void> {
    this.markFailedCount += 1;
    this.status = "FAILED";
    this.failureReason = failureReason;
    this.finalVerdict = null;
  }
}

function roleFromInput(input: OpenRouterChatCompletionInput): JudgeRole {
  const system = input.messages.find((message) => message.role === "system");
  const match = system?.content.match(/Seat: (JUDGE_1|JUDGE_2|JUDGE_3)/);
  if (!match?.[1]) {
    throw new Error("Transport input is missing a judge seat.");
  }
  return match[1] as JudgeRole;
}

function successTransport(role: JudgeRole, verdict: JudgeResponse["verdict"] = "JUSTIFIED") {
  return {
    ok: true as const,
    content: JSON.stringify(judgeResponse(verdict, role)),
    returnedModel: getModelIdForRole(TribunalRunKind.SAME_MODEL, role),
    providerCallId: `gen-${role}`,
    generationId: null,
    usage: {
      promptTokens: 20,
      completionTokens: 10,
      totalTokens: 30,
      totalCost: "0",
    },
    durationMs: 25,
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

async function runStage(options: {
  respond: (
    input: OpenRouterChatCompletionInput,
    role: JudgeRole,
  ) => Promise<OpenRouterChatCompletionResult> | OpenRouterChatCompletionResult;
  advocateResponses?: JudgeAdvocateResponses;
  chargeSheetMarkdown?: string;
}) {
  const modelCalls = new MemoryModelCalls();
  const runs = new MemoryRuns();
  const calls: OpenRouterChatCompletionInput[] = [];
  const inFlight = { current: 0, max: 0 };

  const result = await executeJudgeStage(
    {
      caseId: "case-judges",
      runId: "run-judges",
      runKind: TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown: options.chargeSheetMarkdown ?? "# Case\n\nFacts.",
      advocateResponses: options.advocateResponses ?? advocates,
      apiKey: "test-key",
    },
    {
      modelCalls,
      runs,
      sleep: async () => {},
      completeChat: async (input) => {
        const role = roleFromInput(input);
        calls.push(input);
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

  return { result, modelCalls, runs, calls, inFlight };
}

describe("executeJudgeStage", () => {
  it("starts all three judges concurrently and persists a majority", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const verdicts: Record<JudgeRole, JudgeResponse["verdict"]> = {
      [JudgeRole.JUDGE_1]: "JUSTIFIED",
      [JudgeRole.JUDGE_2]: "NOT_JUSTIFIED",
      [JudgeRole.JUDGE_3]: "JUSTIFIED",
    };

    const { result, runs, modelCalls, inFlight } = await Promise.race([
      runStage({
        respond: async (_input, role) => {
          started += 1;
          if (started === 3) {
            release();
          }
          await gate;
          return successTransport(role, verdicts[role]);
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Judges did not overlap.")), 1000);
      }),
    ]);

    assert.equal(started, 3);
    assert.equal(inFlight.max, 3);
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(result.judges.JUDGE_1.verdict, "JUSTIFIED");
    assert.equal(result.judges.JUDGE_2.verdict, "NOT_JUSTIFIED");
    assert.equal(result.judges.JUDGE_3.verdict, "JUSTIFIED");
    assert.equal(runs.markRunningCount, 0);
    assert.equal(runs.markSucceededCount, 1);
    assert.equal(runs.markFailedCount, 0);
    assert.equal(runs.status, "SUCCEEDED");
    assert.equal(runs.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(modelCalls.records.length, 3);
    assert.equal(
      modelCalls.records.every((record) => record.stage === "JUDGES"),
      true,
    );
  });

  it("retries one judge without restarting the others", async () => {
    const attempts = new Map<JudgeRole, number>();
    const { result, modelCalls } = await runStage({
      respond: async (_input, role) => {
        const count = (attempts.get(role) ?? 0) + 1;
        attempts.set(role, count);
        if (role === JudgeRole.JUDGE_2 && count === 1) {
          return httpFailure(502);
        }
        return successTransport(role, "NOT_JUSTIFIED");
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.agents.JUDGE_2.successfulAttempt, 2);
      assert.equal(result.finalVerdict, TribunalRunVerdict.NOT_JUSTIFIED);
    }
    assert.equal(modelCalls.records.length, 4);
    assert.deepEqual(
      modelCalls.records
        .filter((record) => record.agentRole === "JUDGE_2")
        .map((record) => record.attempt),
      [1, 2],
    );
    assert.equal(attempts.get(JudgeRole.JUDGE_1), 1);
    assert.equal(attempts.get(JudgeRole.JUDGE_3), 1);
  });

  it("fails the run once when one judge permanently fails and does not calculate majority", async () => {
    const { result, runs, modelCalls } = await runStage({
      respond: async (_input, role) => {
        if (role === JudgeRole.JUDGE_3) {
          return httpFailure(401);
        }
        return successTransport(role, "JUSTIFIED");
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.failedRoles, [JudgeRole.JUDGE_3]);
      assert.equal("judges" in result, false);
      assert.equal("finalVerdict" in result, false);
    }
    assert.equal(runs.markRunningCount, 0);
    assert.equal(runs.markSucceededCount, 0);
    assert.equal(runs.markFailedCount, 1);
    assert.equal(runs.status, "FAILED");
    assert.equal(runs.finalVerdict, null);
    assert.match(runs.failureReason ?? "", /JUDGE_3 \(HTTP_ERROR\)/);
    assert.equal(modelCalls.records.length, 3);
  });

  it("reports two permanent failures after all three settle", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const failed = new Set<JudgeRole>([JudgeRole.JUDGE_1, JudgeRole.JUDGE_2]);

    const { result, runs, modelCalls, inFlight } = await Promise.race([
      runStage({
        respond: async (_input, role) => {
          started += 1;
          if (started === 3) {
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
        setTimeout(() => reject(new Error("Two-failure judges did not overlap.")), 1000);
      }),
    ]);

    assert.equal(started, 3);
    assert.equal(inFlight.max, 3);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.failedRoles, [JudgeRole.JUDGE_1, JudgeRole.JUDGE_2]);
    }
    assert.equal(runs.markFailedCount, 1);
    assert.equal(runs.finalVerdict, null);
    assert.equal(modelCalls.records.length, 3);
  });

  it("accepts Advocate-stage responses without reshaping", async () => {
    const modelCalls = new MemoryModelCalls();
    const advocateResult = await executeAdvocateStage(
      {
        caseId: "case-handoff",
        runId: "run-handoff",
        runKind: TribunalRunKind.SAME_MODEL,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        apiKey: "test-key",
      },
      {
        modelCalls,
        runs: {
          async markRunning() {},
          async markFailed() {},
        },
        completeChat: async (input) => {
          const system = input.messages.find((message) => message.role === "system");
          const match = system?.content.match(
            /Seat: (DEFENSE_1|DEFENSE_2|PROSECUTION_1|PROSECUTION_2)/,
          );
          const role = match?.[1] as RepresentativeRole;
          return {
            ok: true,
            content: JSON.stringify(advocate(role)),
            returnedModel: "minimax/minimax-m3:free",
            providerCallId: `gen-${role}`,
            generationId: null,
            usage: {
              promptTokens: 1,
              completionTokens: 1,
              totalTokens: 2,
              totalCost: "0",
            },
            durationMs: 5,
          };
        },
      },
    );

    assert.equal(advocateResult.ok, true);
    if (!advocateResult.ok) {
      return;
    }

    const input: ExecuteJudgeStageInput = {
      caseId: "case-handoff",
      runId: "run-handoff",
      runKind: TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      advocateResponses: advocateResult.responses,
      apiKey: "test-key",
    };
    const judgePromptInput: JudgePromptInput = {
      role: JudgeRole.JUDGE_1,
      chargeSheetMarkdown: input.chargeSheetMarkdown,
      advocateResponses: input.advocateResponses,
    };
    assert.equal(judgePromptInput.advocateResponses.DEFENSE_1.summary.includes("DEFENSE_1"), true);
  });
});
