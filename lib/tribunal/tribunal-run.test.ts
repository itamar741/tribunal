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
import { JUDGE_ROLES_IN_ORDER, JudgeRole, RepresentativeRole } from "../ai/profiles";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../ai/prompts/delimiters";
import {
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../model-calls";
import { TribunalRunVerdict } from "../cases";
import type { ExecuteJudgeStageInput } from "./execute-judge-stage";
import { executeTribunalRun } from "./execute-tribunal-run";

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

function judgeResponse(
  verdict: JudgeResponse["verdict"],
  role: JudgeRole,
): JudgeResponse {
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
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" = "PENDING";
  failureReason: string | null = null;
  finalVerdict: string | null = null;
  markRunningCount = 0;
  markSucceededCount = 0;
  markFailedCount = 0;

  async markRunning(runId: string): Promise<void> {
    this.markRunningCount += 1;
    if (this.status !== "PENDING") {
      throw new Error(`Tribunal Run ${runId} cannot be marked RUNNING.`);
    }
    this.status = "RUNNING";
  }

  async markSucceeded(_runId: string, finalVerdict: string): Promise<void> {
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

type AgentSeat = RepresentativeRole | JudgeRole;

function roleFromInput(input: OpenRouterChatCompletionInput): AgentSeat {
  const system = input.messages.find((message) => message.role === "system");
  const match = system?.content.match(
    /Seat: (DEFENSE_1|DEFENSE_2|PROSECUTION_1|PROSECUTION_2|JUDGE_1|JUDGE_2|JUDGE_3)/,
  );
  if (!match?.[1]) {
    throw new Error("Transport input is missing an agent seat.");
  }
  return match[1] as AgentSeat;
}

function isJudgeRole(role: AgentSeat): role is JudgeRole {
  return JUDGE_ROLES_IN_ORDER.includes(role as JudgeRole);
}

function successTransport(
  role: AgentSeat,
  runKind: TribunalRunKind = TribunalRunKind.SAME_MODEL,
): OpenRouterChatCompletionResult {
  const content = isJudgeRole(role)
    ? JSON.stringify(judgeResponse("JUSTIFIED", role))
    : JSON.stringify(advocate(role));
  return {
    ok: true,
    content,
    returnedModel: getModelIdForRole(runKind, role),
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

async function runTribunal(options: {
  respond: (
    input: OpenRouterChatCompletionInput,
    role: AgentSeat,
  ) => Promise<OpenRouterChatCompletionResult> | OpenRouterChatCompletionResult;
  runKind?: TribunalRunKind;
  runs?: MemoryRuns;
}) {
  const modelCalls = new MemoryModelCalls();
  const runs = options.runs ?? new MemoryRuns();
  const calls: OpenRouterChatCompletionInput[] = [];
  const events: string[] = [];
  const inFlight = { current: 0, max: 0, maxAdvocates: 0, maxJudges: 0 };

  const result = await executeTribunalRun(
    {
      caseId: "case-run",
      runId: "run-one",
      runKind: options.runKind ?? TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      apiKey: "test-key",
    },
    {
      modelCalls,
      runs,
      sleep: async () => {},
      completeChat: async (input) => {
        const role = roleFromInput(input);
        calls.push(input);
        events.push(`start:${role}`);
        inFlight.current += 1;
        inFlight.max = Math.max(inFlight.max, inFlight.current);
        if (isJudgeRole(role)) {
          inFlight.maxJudges = Math.max(inFlight.maxJudges, inFlight.current);
        } else {
          inFlight.maxAdvocates = Math.max(inFlight.maxAdvocates, inFlight.current);
        }
        try {
          return await options.respond(input, role);
        } finally {
          inFlight.current -= 1;
          events.push(`end:${role}`);
        }
      },
    },
  );

  return { result, modelCalls, runs, calls, events, inFlight };
}

describe("executeTribunalRun", () => {
  it("runs advocates then judges and persists the majority", async () => {
    const { result, runs, modelCalls } = await runTribunal({
      respond: (_input, role) => successTransport(role),
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(result.advocates.DEFENSE_1.summary.includes("DEFENSE_1"), true);
    assert.equal(result.judges.JUDGE_1.verdict, "JUSTIFIED");
    assert.equal(result.judges.JUDGE_2.verdict, "JUSTIFIED");
    assert.equal(result.judges.JUDGE_3.verdict, "JUSTIFIED");
    assert.equal(runs.markRunningCount, 1);
    assert.equal(runs.markSucceededCount, 1);
    assert.equal(runs.markFailedCount, 0);
    assert.equal(runs.status, "SUCCEEDED");
    assert.equal(runs.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(modelCalls.records.length, 7);
    assert.equal(
      modelCalls.records.filter((record) => record.stage === "ADVOCATES").length,
      4,
    );
    assert.equal(
      modelCalls.records.filter((record) => record.stage === "JUDGES").length,
      3,
    );
  });

  it("does not start judges until all four advocates have settled", async () => {
    let releaseAdvocates!: () => void;
    const advocateGate = new Promise<void>((resolve) => {
      releaseAdvocates = resolve;
    });
    let startedAdvocates = 0;
    let judgeStartedBeforeAdvocatesFinished = false;

    const { result, events, inFlight } = await Promise.race([
      runTribunal({
        respond: async (_input, role) => {
          if (isJudgeRole(role)) {
            if (startedAdvocates < 4) {
              judgeStartedBeforeAdvocatesFinished = true;
            }
            return successTransport(role);
          }
          startedAdvocates += 1;
          if (startedAdvocates === 4) {
            releaseAdvocates();
          }
          await advocateGate;
          return successTransport(role);
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Tribunal run did not overlap.")), 1000);
      }),
    ]);

    assert.equal(result.ok, true);
    assert.equal(judgeStartedBeforeAdvocatesFinished, false);
    assert.equal(inFlight.maxAdvocates, 4);
    assert.equal(inFlight.maxJudges, 3);
    assert.equal(inFlight.max, 4);
    const lastAdvocateEnd = Math.max(
      ...REPRESENTATIVE_ROLES_IN_ORDER.map((role) =>
        events.lastIndexOf(`end:${role}`),
      ),
    );
    const firstJudgeStart = Math.min(
      ...JUDGE_ROLES_IN_ORDER.map((role) => events.indexOf(`start:${role}`)),
    );
    assert.equal(lastAdvocateEnd < firstJudgeStart, true);
  });

  it("stops after a permanent advocate failure and never starts judges", async () => {
    const { result, runs, modelCalls, calls } = await runTribunal({
      respond: (_input, role) => {
        if (role === RepresentativeRole.DEFENSE_2) {
          return httpFailure(401);
        }
        return successTransport(role);
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedStage, "ADVOCATES");
      assert.deepEqual(result.failedRoles, [RepresentativeRole.DEFENSE_2]);
      assert.equal("finalVerdict" in result, false);
      assert.equal("judges" in result, false);
    }
    assert.equal(runs.markRunningCount, 1);
    assert.equal(runs.markSucceededCount, 0);
    assert.equal(runs.markFailedCount, 1);
    assert.equal(runs.status, "FAILED");
    assert.equal(runs.finalVerdict, null);
    assert.equal(
      calls.some((call) => /Seat: JUDGE_/.test(call.messages[0]?.content ?? "")),
      false,
    );
    assert.equal(
      modelCalls.records.every((record) => record.stage === "ADVOCATES"),
      true,
    );
  });

  it("fails the run when a judge permanently fails after valid advocates", async () => {
    const { result, runs, modelCalls } = await runTribunal({
      respond: (_input, role) => {
        if (role === JudgeRole.JUDGE_2) {
          return httpFailure(401);
        }
        return successTransport(role);
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedStage, "JUDGES");
      assert.deepEqual(result.failedRoles, [JudgeRole.JUDGE_2]);
      assert.equal("finalVerdict" in result, false);
    }
    assert.equal(runs.markRunningCount, 1);
    assert.equal(runs.markSucceededCount, 0);
    assert.equal(runs.markFailedCount, 1);
    assert.equal(runs.status, "FAILED");
    assert.equal(runs.finalVerdict, null);
    assert.equal(
      modelCalls.records.filter((record) => record.stage === "ADVOCATES").length,
      4,
    );
    assert.equal(
      modelCalls.records.filter((record) => record.stage === "JUDGES").length,
      3,
    );
  });

  it("uses MIXED_MODELS configuration without orchestration branches", async () => {
    const { result, calls } = await runTribunal({
      runKind: TribunalRunKind.MIXED_MODELS,
      respond: (_input, role) =>
        successTransport(role, TribunalRunKind.MIXED_MODELS),
    });

    assert.equal(result.ok, true);
    const requested = calls.map((call) => call.model);
    const expected = [
      ...REPRESENTATIVE_ROLES_IN_ORDER.map((role) =>
        getModelIdForRole(TribunalRunKind.MIXED_MODELS, role),
      ),
      ...JUDGE_ROLES_IN_ORDER.map((role) =>
        getModelIdForRole(TribunalRunKind.MIXED_MODELS, role),
      ),
    ];
    assert.deepEqual([...requested].sort(), [...expected].sort());
    assert.equal(new Set(requested).size, 7);
  });

  it("passes Advocate-stage responses to the Judge stage without reshaping", async () => {
    const { result } = await runTribunal({
      respond: (_input, role) => successTransport(role),
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    const judgeInput: ExecuteJudgeStageInput = {
      caseId: "case-run",
      runId: "run-one",
      runKind: TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      advocateResponses: result.advocates,
      apiKey: "test-key",
    };
    assert.equal(
      judgeInput.advocateResponses.PROSECUTION_1.summary.includes("PROSECUTION_1"),
      true,
    );
  });

  for (const status of ["RUNNING", "SUCCEEDED", "FAILED"] as const) {
    it(`rejects a ${status} Run before any model request`, async () => {
      const runs = new MemoryRuns();
      runs.status = status;
      if (status === "SUCCEEDED") {
        runs.finalVerdict = TribunalRunVerdict.JUSTIFIED;
      }
      if (status === "FAILED") {
        runs.failureReason = "already failed";
      }

      const { result, modelCalls, calls } = await runTribunal({
        runs,
        respond: () => {
          throw new Error("Non-PENDING Tribunal Run must not call the model.");
        },
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.failedStage, "RUN");
        assert.equal(result.reason, "NOT_PENDING");
        assert.equal("finalVerdict" in result, false);
      }
      assert.equal(calls.length, 0);
      assert.equal(modelCalls.records.length, 0);
      assert.equal(runs.markSucceededCount, 0);
      assert.equal(runs.markFailedCount, 0);
      assert.equal(runs.status, status);
      assert.equal(
        runs.finalVerdict,
        status === "SUCCEEDED" ? TribunalRunVerdict.JUSTIFIED : null,
      );
    });
  }

  it("lets only one concurrent caller claim a PENDING Run", async () => {
    const runs = new MemoryRuns();
    const modelCalls = new MemoryModelCalls();
    let requests = 0;
    const input = {
      caseId: "case-run",
      runId: "run-one",
      runKind: TribunalRunKind.SAME_MODEL,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      apiKey: "test-key",
    };
    const deps = {
      modelCalls,
      runs,
      sleep: async () => {},
      completeChat: async (input: OpenRouterChatCompletionInput) => {
        requests += 1;
        return successTransport(roleFromInput(input));
      },
    };

    const [first, second] = await Promise.all([
      executeTribunalRun(input, deps),
      executeTribunalRun(input, deps),
    ]);
    const outcomes = [first, second];
    const succeeded = outcomes.filter((outcome) => outcome.ok);
    const rejected = outcomes.filter(
      (outcome) => !outcome.ok && outcome.failedStage === "RUN",
    );

    assert.equal(succeeded.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(requests, 7);
    assert.equal(modelCalls.records.length, 7);
    assert.equal(runs.markRunningCount, 2);
    assert.equal(runs.markSucceededCount, 1);
    assert.equal(runs.markFailedCount, 0);
    assert.equal(runs.status, "SUCCEEDED");
  });
});
