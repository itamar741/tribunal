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
import { InMemoryCaseRepository, TribunalRunVerdict } from "../cases";
import type { TribunalRunRecord } from "../cases";
import {
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../model-calls";
import { executeCaseTribunals } from "./execute-case-tribunals";

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
  readonly byId = new Map<
    string,
    {
      status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
      finalVerdict: string | null;
      failureReason: string | null;
    }
  >();
  markRunningCount = 0;
  markSucceededCount = 0;
  markFailedCount = 0;
  beforeClaim?: (runId: string) => Promise<void>;

  constructor(runs: TribunalRunRecord[]) {
    for (const run of runs) {
      this.byId.set(run.id, {
        status: run.status,
        finalVerdict: run.finalVerdict,
        failureReason: run.failureReason,
      });
    }
  }

  private require(runId: string) {
    const run = this.byId.get(runId);
    if (!run) {
      throw new Error(`Unknown Tribunal Run ${runId}.`);
    }
    return run;
  }

  async markRunning(runId: string): Promise<void> {
    this.markRunningCount += 1;
    if (this.beforeClaim) {
      await this.beforeClaim(runId);
    }
    const run = this.require(runId);
    if (run.status !== "PENDING") {
      throw new Error(`Tribunal Run ${runId} cannot be marked RUNNING.`);
    }
    run.status = "RUNNING";
  }

  async markSucceeded(runId: string, finalVerdict: string): Promise<void> {
    this.markSucceededCount += 1;
    const run = this.require(runId);
    run.status = "SUCCEEDED";
    run.finalVerdict = finalVerdict;
    run.failureReason = null;
  }

  async markFailed(runId: string, failureReason: string): Promise<void> {
    this.markFailedCount += 1;
    const run = this.require(runId);
    run.status = "FAILED";
    run.failureReason = failureReason;
    run.finalVerdict = null;
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
  model: string,
): OpenRouterChatCompletionResult {
  const content = isJudgeRole(role)
    ? JSON.stringify(judgeResponse("JUSTIFIED", role))
    : JSON.stringify(advocate(role));
  return {
    ok: true,
    content,
    returnedModel: model,
    providerCallId: `gen-${model}-${role}`,
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

async function runCase(options: {
  respond: (
    input: OpenRouterChatCompletionInput,
    role: AgentSeat,
  ) => Promise<OpenRouterChatCompletionResult> | OpenRouterChatCompletionResult;
  mutateCase?: (cases: InMemoryCaseRepository, caseId: string) => Promise<void> | void;
  caseId?: string;
}) {
  const cases = new InMemoryCaseRepository();
  const created = await cases.create({
    originalFileName: "case-tribunals.md",
    chargeSheetText: "# Case\n\nFacts.",
  });
  if (options.mutateCase) {
    await options.mutateCase(cases, created.id);
  }
  const caseId = options.caseId ?? created.id;
  const loaded = await cases.getById(created.id);
  const runs = new MemoryRuns(loaded?.runs ?? []);
  const modelCalls = new MemoryModelCalls();
  const calls: OpenRouterChatCompletionInput[] = [];
  const inFlight = { current: 0, max: 0 };

  const result = await executeCaseTribunals(
    {
      caseId,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      apiKey: "test-key",
    },
    {
      cases,
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

  return { result, modelCalls, runs, calls, inFlight, created };
}

describe("executeCaseTribunals", () => {
  it("starts both existing Runs concurrently and returns both majorities", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let startedAdvocates = 0;

    const { result, runs, modelCalls, inFlight, created } = await Promise.race([
      runCase({
        respond: async (input, role) => {
          if (!isJudgeRole(role)) {
            startedAdvocates += 1;
            if (startedAdvocates === 8) {
              release();
            }
            await gate;
          }
          return successTransport(role, input.model);
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Dual runs did not overlap.")), 1000);
      }),
    ]);

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(startedAdvocates, 8);
    assert.equal(inFlight.max, 8);
    assert.equal(result.runs.SAME_MODEL.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(result.runs.MIXED_MODELS.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(runs.markRunningCount, 2);
    assert.equal(runs.markSucceededCount, 2);
    assert.equal(runs.markFailedCount, 0);
    assert.equal(modelCalls.records.length, 14);
    const sameId = created.runs[0].id;
    const mixedId = created.runs[1].id;
    assert.equal(
      modelCalls.records.filter((record) => record.runId === sameId).every(
        (record) =>
          record.model === getModelIdForRole(TribunalRunKind.SAME_MODEL, RepresentativeRole.DEFENSE_1),
      ),
      true,
    );
    assert.equal(
      new Set(
        modelCalls.records
          .filter((record) => record.runId === mixedId)
          .map((record) => record.model),
      ).size,
      7,
    );
  });

  it("keeps Run outcomes independent when one Run permanently fails", async () => {
    const { result, runs, modelCalls, created } = await runCase({
      respond: (input, role) => {
        if (
          role === RepresentativeRole.DEFENSE_1 &&
          input.model ===
            getModelIdForRole(TribunalRunKind.SAME_MODEL, RepresentativeRole.DEFENSE_1)
        ) {
          return httpFailure(401);
        }
        return successTransport(role, input.model);
      },
    });

    assert.equal(result.ok, false);
    if (result.ok || result.reason !== "RUN_FAILURE") {
      return;
    }
    assert.equal(result.runs.SAME_MODEL.ok, false);
    assert.equal(result.runs.MIXED_MODELS.ok, true);
    if (result.runs.MIXED_MODELS.ok) {
      assert.equal(
        result.runs.MIXED_MODELS.advocates.DEFENSE_1.summary.includes("DEFENSE_1"),
        true,
      );
      assert.equal(
        result.runs.MIXED_MODELS.advocates.PROSECUTION_2.summary.includes(
          "PROSECUTION_2",
        ),
        true,
      );
      assert.equal(result.runs.MIXED_MODELS.judges.JUDGE_1.verdict, "JUSTIFIED");
      assert.equal(result.runs.MIXED_MODELS.judges.JUDGE_2.verdict, "JUSTIFIED");
      assert.equal(result.runs.MIXED_MODELS.judges.JUDGE_3.verdict, "JUSTIFIED");
      assert.equal(
        result.runs.MIXED_MODELS.finalVerdict,
        TribunalRunVerdict.JUSTIFIED,
      );
    }
    if (!result.runs.SAME_MODEL.ok && result.runs.SAME_MODEL.failedStage !== "RUN") {
      assert.equal(result.runs.SAME_MODEL.failedStage, "ADVOCATES");
      assert.equal("finalVerdict" in result.runs.SAME_MODEL, false);
    }
    assert.equal("finalVerdict" in result, false);
    assert.equal(runs.byId.get(created.runs[0].id)?.status, "FAILED");
    assert.equal(runs.byId.get(created.runs[0].id)?.finalVerdict, null);
    assert.equal(runs.byId.get(created.runs[1].id)?.status, "SUCCEEDED");
    assert.equal(modelCalls.records.some((record) => record.runId === created.runs[1].id), true);
  });

  it("fails before any model request when the Case is missing", async () => {
    let requests = 0;
    const { result, modelCalls } = await runCase({
      caseId: "00000000-0000-4000-8000-000000000099",
      respond: () => {
        requests += 1;
        throw new Error("Missing Case must not call the model.");
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "CASE_NOT_FOUND");
      assert.equal("runs" in result, false);
    }
    assert.equal(requests, 0);
    assert.equal(modelCalls.records.length, 0);
  });

  it("fails before any model request when Run topology is invalid", async () => {
    let requests = 0;
    const { result, modelCalls } = await runCase({
      mutateCase: async (cases, caseId) => {
        const record = await cases.getById(caseId);
        if (record) {
          record.runs = record.runs.slice(0, 1);
        }
      },
      respond: () => {
        requests += 1;
        throw new Error("Invalid topology must not call the model.");
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "INVALID_TOPOLOGY");
      assert.equal("runs" in result, false);
    }
    assert.equal(requests, 0);
    assert.equal(modelCalls.records.length, 0);
  });

  it("does not fabricate a missing Run", async () => {
    const { result } = await runCase({
      mutateCase: async (cases, caseId) => {
        const record = await cases.getById(caseId);
        if (record) {
          record.runs = record.runs.filter(
            (run) => run.runType === TribunalRunKind.SAME_MODEL,
          );
        }
      },
      respond: (input, role) => successTransport(role, input.model),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "INVALID_TOPOLOGY");
      assert.match(result.errorMessage, /SAME_MODEL/);
    }
  });

  it("rejects a second Case execution without making more model requests", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "case-rerun.md",
      chargeSheetText: "# Case\n\nFacts.",
    });
    const runs = new MemoryRuns(created.runs);
    const modelCalls = new MemoryModelCalls();
    let requests = 0;
    const deps = {
      cases,
      modelCalls,
      runs,
      sleep: async () => {},
      completeChat: async (input: OpenRouterChatCompletionInput) => {
        requests += 1;
        return successTransport(roleFromInput(input), input.model);
      },
    };
    const input = {
      caseId: created.id,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      apiKey: "test-key",
    };

    const first = await executeCaseTribunals(input, deps);
    const afterFirst = requests;
    const second = await executeCaseTribunals(input, deps);

    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok && second.reason === "RUN_FAILURE") {
      assert.equal(second.runs.SAME_MODEL.ok, false);
      assert.equal(second.runs.MIXED_MODELS.ok, false);
      if (!second.runs.SAME_MODEL.ok) {
        assert.equal(second.runs.SAME_MODEL.failedStage, "RUN");
      }
      if (!second.runs.MIXED_MODELS.ok) {
        assert.equal(second.runs.MIXED_MODELS.failedStage, "RUN");
      }
    }
    assert.equal(requests, afterFirst);
    assert.equal(modelCalls.records.length, afterFirst);
  });

  it("lets concurrent Case callers claim each durable Run at most once", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "case-concurrent.md",
      chargeSheetText: "# Case\n\nFacts.",
    });
    const originalRunIds = created.runs.map((run) => run.id);
    const runs = new MemoryRuns(created.runs);
    const modelCalls = new MemoryModelCalls();
    let releaseClaims!: () => void;
    const claimsStarted = new Promise<void>((resolve) => {
      releaseClaims = resolve;
    });
    let claimArrivals = 0;
    runs.beforeClaim = async () => {
      claimArrivals += 1;
      if (claimArrivals === 4) {
        releaseClaims();
      }
      await claimsStarted;
    };

    const input = {
      caseId: created.id,
      chargeSheetMarkdown: "# Case\n\nFacts.",
      apiKey: "test-key",
    };
    const deps = {
      cases,
      modelCalls,
      runs,
      sleep: async () => {},
      completeChat: async (input: OpenRouterChatCompletionInput) =>
        successTransport(roleFromInput(input), input.model),
    };

    const [first, second] = await Promise.all([
      executeCaseTribunals(input, deps),
      executeCaseTribunals(input, deps),
    ]);

    function runSucceeded(
      result: Awaited<ReturnType<typeof executeCaseTribunals>>,
      kind: typeof TribunalRunKind.SAME_MODEL | typeof TribunalRunKind.MIXED_MODELS,
    ): boolean {
      if (result.ok) {
        return result.runs[kind].ok;
      }
      if (result.reason !== "RUN_FAILURE") {
        return false;
      }
      return result.runs[kind].ok;
    }

    assert.equal(claimArrivals, 4);
    assert.equal(runs.markRunningCount, 4);
    assert.equal(
      [first, second].filter((result) =>
        runSucceeded(result, TribunalRunKind.SAME_MODEL),
      ).length,
      1,
    );
    assert.equal(
      [first, second].filter((result) =>
        runSucceeded(result, TribunalRunKind.MIXED_MODELS),
      ).length,
      1,
    );

    const sameId = created.runs[0].id;
    const mixedId = created.runs[1].id;
    const agentRoles = [...REPRESENTATIVE_ROLES_IN_ORDER, ...JUDGE_ROLES_IN_ORDER];
    for (const runId of [sameId, mixedId]) {
      const rows = modelCalls.records.filter((record) => record.runId === runId);
      assert.equal(rows.length, 7);
      for (const role of agentRoles) {
        assert.equal(
          rows.filter((record) => record.agentRole === role && record.attempt === 1)
            .length,
          1,
        );
      }
    }
    assert.equal(modelCalls.records.length, 14);
    assert.equal(runs.markSucceededCount, 2);
    assert.equal(runs.byId.get(sameId)?.status, "SUCCEEDED");
    assert.equal(runs.byId.get(mixedId)?.status, "SUCCEEDED");

    const reloaded = await cases.getById(created.id);
    assert.deepEqual(
      reloaded?.runs.map((run) => run.id),
      originalRunIds,
    );
    assert.equal(reloaded?.runs.length, 2);
  });
});
