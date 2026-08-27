import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { TribunalRunKind } from "../ai/configurations";
import type { AdvocateResponse, JudgeResponse } from "../ai/contracts";
import { JUDGE_ROLES_IN_ORDER, JudgeRole, RepresentativeRole } from "../ai/profiles";
import { REPRESENTATIVE_ROLES_IN_ORDER } from "../ai/prompts/delimiters";
import { InMemoryCaseRepository, TribunalRunStatus, TribunalRunVerdict } from "../cases";
import {
  ModelCallAgentRole,
  ModelCallStage,
  ModelCallStatus,
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../model-calls";
import { sumUsage } from "./accounting";
import { getCaseResults } from "./get-case-results";

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

function judge(role: JudgeRole, verdict: JudgeResponse["verdict"]): JudgeResponse {
  return {
    verdict,
    summary: `${role} summary.`,
    key_reasons: [
      `${role} reason one.`,
      `${role} reason two.`,
      `${role} reason three.`,
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

function call(
  overrides: Pick<NewModelCallInput, "caseId" | "runId" | "stage" | "agentRole"> &
    Partial<NewModelCallInput>,
): NewModelCallInput {
  return {
    attempt: 1,
    model: "test-model",
    status: ModelCallStatus.SUCCEEDED,
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    inputCost: "0.00001000",
    outputCost: "0.00002000",
    totalCost: "0.00003000",
    durationMs: 100,
    providerCallId: "gen-test",
    validatedResponse: null,
    errorType: null,
    errorMessage: null,
    ...overrides,
  };
}

async function insertAdvocates(
  modelCalls: MemoryModelCalls,
  caseId: string,
  runId: string,
): Promise<void> {
  for (const role of REPRESENTATIVE_ROLES_IN_ORDER) {
    await modelCalls.insert(
      call({
        caseId,
        runId,
        stage: ModelCallStage.ADVOCATES,
        agentRole: role,
        validatedResponse: advocate(role),
      }),
    );
  }
}

async function insertJudges(
  modelCalls: MemoryModelCalls,
  caseId: string,
  runId: string,
  verdicts: readonly JudgeResponse["verdict"][],
): Promise<void> {
  for (const [index, role] of JUDGE_ROLES_IN_ORDER.entries()) {
    await modelCalls.insert(
      call({
        caseId,
        runId,
        stage: ModelCallStage.JUDGES,
        agentRole: role,
        validatedResponse: judge(role, verdicts[index] ?? "NOT_JUSTIFIED"),
      }),
    );
  }
}

describe("sumUsage", () => {
  it("treats an empty set as a known complete zero", () => {
    assert.deepEqual(sumUsage([]), {
      inputTokens: { value: 0, complete: true },
      outputTokens: { value: 0, complete: true },
      totalTokens: { value: 0, complete: true },
      inputCost: { value: "0", complete: true },
      outputCost: { value: "0", complete: true },
      totalCost: { value: "0", complete: true },
      durationMs: { value: 0, complete: true },
      attemptCount: 0,
    });
  });

  it("keeps a provider-reported zero as a known complete zero", () => {
    assert.deepEqual(
      sumUsage([
        {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCost: "0",
          outputCost: "0",
          totalCost: "0",
          durationMs: 0,
        },
      ]),
      {
        inputTokens: { value: 0, complete: true },
        outputTokens: { value: 0, complete: true },
        totalTokens: { value: 0, complete: true },
        inputCost: { value: "0", complete: true },
        outputCost: { value: "0", complete: true },
        totalCost: { value: "0", complete: true },
        durationMs: { value: 0, complete: true },
        attemptCount: 1,
      },
    );
  });

  it("sums multiple known non-zero values without floating-point costs", () => {
    assert.deepEqual(
      sumUsage([
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          inputCost: "0.00001000",
          outputCost: "0.00002000",
          totalCost: "0.00003000",
          durationMs: 800,
        },
        {
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
          inputCost: "0.00000100",
          outputCost: "0.00000200",
          totalCost: "0.00000300",
          durationMs: 200,
        },
      ]),
      {
        inputTokens: { value: 120, complete: true },
        outputTokens: { value: 60, complete: true },
        totalTokens: { value: 180, complete: true },
        inputCost: { value: "0.000011", complete: true },
        outputCost: { value: "0.000022", complete: true },
        totalCost: { value: "0.000033", complete: true },
        durationMs: { value: 1000, complete: true },
        attemptCount: 2,
      },
    );
  });

  it("preserves a known zero subtotal when another attempt is unknown", () => {
    const totals = sumUsage([
      {
        inputTokens: null,
        outputTokens: 0,
        totalTokens: null,
        inputCost: null,
        outputCost: "0",
        totalCost: null,
        durationMs: null,
      },
      {
        inputTokens: 0,
        outputTokens: null,
        totalTokens: 0,
        inputCost: "0",
        outputCost: null,
        totalCost: "0",
        durationMs: 0,
      },
    ]);
    assert.deepEqual(totals.inputTokens, { value: 0, complete: false });
    assert.deepEqual(totals.outputTokens, { value: 0, complete: false });
    assert.deepEqual(totals.totalTokens, { value: 0, complete: false });
    assert.deepEqual(totals.inputCost, { value: "0", complete: false });
    assert.deepEqual(totals.outputCost, { value: "0", complete: false });
    assert.deepEqual(totals.totalCost, { value: "0", complete: false });
    assert.deepEqual(totals.durationMs, { value: 0, complete: false });
    assert.equal(totals.attemptCount, 2);
  });

  it("keeps the known subtotal and marks only incomplete metrics", () => {
    const totals = sumUsage([
      {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputCost: "0.1",
        outputCost: null,
        totalCost: "0.1",
        durationMs: 10,
      },
      {
        inputTokens: null,
        outputTokens: 5,
        totalTokens: 5,
        inputCost: "0.2",
        outputCost: "0.2",
        totalCost: "0.4",
        durationMs: null,
      },
    ]);
    assert.deepEqual(totals.inputTokens, { value: 10, complete: false });
    assert.deepEqual(totals.outputTokens, { value: 10, complete: true });
    assert.deepEqual(totals.outputCost, { value: "0.2", complete: false });
    assert.deepEqual(totals.totalCost, { value: "0.5", complete: true });
    assert.deepEqual(totals.durationMs, { value: 10, complete: false });
    assert.equal(totals.attemptCount, 2);
  });
});

describe("getCaseResults", () => {
  it("reconstructs outputs and totals from persisted rows only", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "results.md",
      chargeSheetText: "# Secret charge sheet\n\nDo not echo.",
    });
    const same = created.runs[0];
    const mixed = created.runs[1];
    same.status = TribunalRunStatus.SUCCEEDED;
    same.finalVerdict = TribunalRunVerdict.JUSTIFIED;
    mixed.status = TribunalRunStatus.FAILED;
    mixed.failureReason = "Judge stage failed.";
    mixed.finalVerdict = null;

    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        validatedResponse: advocate(RepresentativeRole.DEFENSE_1),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        attempt: 2,
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
        inputCost: "0.00000100",
        outputCost: "0.00000200",
        totalCost: "0.00000300",
        durationMs: 40,
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "HTTP_ERROR",
        errorMessage: "OpenRouter HTTP 429",
      }),
    );
    for (const role of [
      ModelCallAgentRole.DEFENSE_2,
      ModelCallAgentRole.PROSECUTION_1,
      ModelCallAgentRole.PROSECUTION_2,
    ] as const) {
      await modelCalls.insert(
        call({
          caseId: created.id,
          runId: same.id,
          stage: ModelCallStage.ADVOCATES,
          agentRole: role,
          validatedResponse: advocate(role),
        }),
      );
    }
    for (const [role, verdict] of [
      [ModelCallAgentRole.JUDGE_1, "JUSTIFIED"],
      [ModelCallAgentRole.JUDGE_2, "NOT_JUSTIFIED"],
      [ModelCallAgentRole.JUDGE_3, "JUSTIFIED"],
    ] as const) {
      await modelCalls.insert(
        call({
          caseId: created.id,
          runId: same.id,
          stage: ModelCallStage.JUDGES,
          agentRole: role,
          validatedResponse: judge(role, verdict),
        }),
      );
    }
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: mixed.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        inputCost: null,
        outputCost: null,
        totalCost: null,
        durationMs: null,
        status: ModelCallStatus.FAILED,
        validatedResponse: { summary: "ignore prose" },
        errorType: "HTTP_ERROR",
        errorMessage: "OpenRouter HTTP 401",
      }),
    );

    let listed = 0;
    const result = await getCaseResults(
      { caseId: created.id },
      {
        cases,
        modelCalls: {
          async listByCaseId(caseId) {
            listed += 1;
            return modelCalls.listByCaseId(caseId);
          },
        },
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(listed, 1);

    assert.equal(result.results.case.id, created.id);
    assert.equal(result.results.case.originalFileName, "results.md");
    assert.equal("chargeSheetText" in result.results.case, false);
    assert.equal(result.results.runs.SAME_MODEL.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(
      result.results.runs.SAME_MODEL.advocates.DEFENSE_1?.summary.includes("DEFENSE_1"),
      true,
    );
    assert.equal(result.results.runs.SAME_MODEL.judges.JUDGE_2?.verdict, "NOT_JUSTIFIED");
    assert.equal(result.results.runs.MIXED_MODELS.finalVerdict, null);
    assert.equal(result.results.runs.MIXED_MODELS.advocates.DEFENSE_1, null);
    assert.equal(result.results.runs.MIXED_MODELS.status, TribunalRunStatus.FAILED);
    assert.equal("finalVerdict" in result.results, false);

    const defense1 = result.results.runs.SAME_MODEL.accounting.agents.DEFENSE_1;
    assert.equal(defense1.attemptCount, 2);
    assert.deepEqual(defense1.inputTokens, { value: 14, complete: true });
    assert.deepEqual(defense1.totalCost, { value: "0.000033", complete: true });
    assert.equal(result.results.runs.SAME_MODEL.accounting.advocates.attemptCount, 5);
    assert.equal(result.results.runs.SAME_MODEL.accounting.judges.attemptCount, 3);
    assert.equal(result.results.runs.SAME_MODEL.accounting.run.attemptCount, 8);
    assert.deepEqual(result.results.runs.MIXED_MODELS.accounting.run.inputTokens, {
      value: 0,
      complete: false,
    });
    assert.equal(result.results.accounting.attemptCount, 9);
    assert.deepEqual(result.results.accounting.inputTokens, { value: 74, complete: false });
  });

  it("keeps a successful Run readable when the sibling Run failed", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "partial.md",
      chargeSheetText: "# Case",
    });
    const same = created.runs[0];
    const mixed = created.runs[1];
    same.status = TribunalRunStatus.SUCCEEDED;
    same.finalVerdict = TribunalRunVerdict.JUSTIFIED;
    mixed.status = TribunalRunStatus.FAILED;
    mixed.failureReason = "Advocate stage failed.";
    mixed.finalVerdict = null;

    await insertAdvocates(modelCalls, created.id, same.id);
    await insertJudges(modelCalls, created.id, same.id, [
      "JUSTIFIED",
      "JUSTIFIED",
      "NOT_JUSTIFIED",
    ]);
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: mixed.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "HTTP_ERROR",
        errorMessage: "OpenRouter HTTP 401",
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.results.runs.SAME_MODEL.status, TribunalRunStatus.SUCCEEDED);
    assert.equal(result.results.runs.SAME_MODEL.finalVerdict, TribunalRunVerdict.JUSTIFIED);
    assert.equal(result.results.runs.SAME_MODEL.advocates.PROSECUTION_2?.conclusion.includes("PROSECUTION_2"), true);
    assert.equal(result.results.runs.SAME_MODEL.judges.JUDGE_3?.verdict, "NOT_JUSTIFIED");
    assert.equal(result.results.runs.MIXED_MODELS.status, TribunalRunStatus.FAILED);
    assert.equal(result.results.runs.MIXED_MODELS.finalVerdict, null);
    assert.equal(result.results.runs.MIXED_MODELS.failureReason, "Advocate stage failed.");
    assert.equal(result.results.runs.MIXED_MODELS.advocates.DEFENSE_1, null);
    assert.equal("finalVerdict" in result.results, false);
  });

  it("exposes successful Judge outputs after a failed Judge stage without calculating majority", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "judges.md",
      chargeSheetText: "# Case",
    });
    const same = created.runs[0];
    same.status = TribunalRunStatus.FAILED;
    same.failureReason = "Judge stage failed.";
    same.finalVerdict = null;

    await insertAdvocates(modelCalls, created.id, same.id);
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.JUDGES,
        agentRole: ModelCallAgentRole.JUDGE_1,
        validatedResponse: judge(JudgeRole.JUDGE_1, "JUSTIFIED"),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.JUDGES,
        agentRole: ModelCallAgentRole.JUDGE_2,
        validatedResponse: judge(JudgeRole.JUDGE_2, "JUSTIFIED"),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.JUDGES,
        agentRole: ModelCallAgentRole.JUDGE_3,
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "MALFORMED_JSON",
        errorMessage: "Assistant content was not valid JSON.",
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    const run = result.results.runs.SAME_MODEL;
    assert.equal(run.status, TribunalRunStatus.FAILED);
    assert.equal(run.finalVerdict, null);
    assert.equal(run.judges.JUDGE_1?.verdict, "JUSTIFIED");
    assert.equal(run.judges.JUDGE_2?.verdict, "JUSTIFIED");
    assert.equal(run.judges.JUDGE_3, null);
  });

  it("exposes partial RUNNING results without treating the Run as complete", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "running.md",
      chargeSheetText: "# Case",
    });
    const same = created.runs[0];
    same.status = TribunalRunStatus.RUNNING;
    same.finalVerdict = null;
    same.startedAt = new Date();

    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        validatedResponse: advocate(RepresentativeRole.DEFENSE_1),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_2,
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "HTTP_ERROR",
        errorMessage: "OpenRouter HTTP 429",
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    const run = result.results.runs.SAME_MODEL;
    assert.equal(run.status, TribunalRunStatus.RUNNING);
    assert.equal(run.finalVerdict, null);
    assert.equal(run.advocates.DEFENSE_1?.summary.includes("DEFENSE_1"), true);
    assert.equal(run.advocates.DEFENSE_2, null);
    assert.equal(run.advocates.PROSECUTION_1, null);
    assert.equal(run.judges.JUDGE_1, null);
    assert.equal(run.attempts.length, 2);
  });

  it("fails closed when a SUCCEEDED Advocate validated_response is invalid", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "corrupt-advocate.md",
      chargeSheetText: "# Case",
    });
    created.runs[0].status = TribunalRunStatus.RUNNING;
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        status: ModelCallStatus.SUCCEEDED,
        validatedResponse: { summary: "missing required advocate fields" },
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "INTEGRITY_VIOLATION");
      assert.match(result.errorMessage, /DEFENSE_1/);
    }
  });

  it("fails closed when a SUCCEEDED Judge validated_response is invalid", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "corrupt-judge.md",
      chargeSheetText: "# Case",
    });
    created.runs[0].status = TribunalRunStatus.RUNNING;
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.JUDGES,
        agentRole: ModelCallAgentRole.JUDGE_2,
        status: ModelCallStatus.SUCCEEDED,
        validatedResponse: { verdict: "JUSTIFIED" },
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "INTEGRITY_VIOLATION");
      assert.match(result.errorMessage, /JUDGE_2/);
    }
  });

  it("fails closed when a SUCCEEDED Run is missing required outputs or verdict", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "inconsistent.md",
      chargeSheetText: "# Case",
    });

    async function check(label: string, setup: (modelCalls: MemoryModelCalls) => Promise<void>) {
      const modelCalls = new MemoryModelCalls();
      created.runs[0].status = TribunalRunStatus.SUCCEEDED;
      created.runs[0].finalVerdict = TribunalRunVerdict.JUSTIFIED;
      await setup(modelCalls);
      const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
      assert.equal(result.ok, false, label);
      if (!result.ok) {
        assert.equal(result.reason, "INTEGRITY_VIOLATION", label);
      }
    }

    await check("missing advocate", async (modelCalls) => {
      await insertAdvocates(modelCalls, created.id, created.runs[0].id);
      modelCalls.records.splice(
        modelCalls.records.findIndex(
          (row) => row.agentRole === ModelCallAgentRole.PROSECUTION_2,
        ),
        1,
      );
      await insertJudges(modelCalls, created.id, created.runs[0].id, [
        "JUSTIFIED",
        "JUSTIFIED",
        "JUSTIFIED",
      ]);
    });

    await check("missing judge", async (modelCalls) => {
      await insertAdvocates(modelCalls, created.id, created.runs[0].id);
      await insertJudges(modelCalls, created.id, created.runs[0].id, [
        "JUSTIFIED",
        "JUSTIFIED",
        "JUSTIFIED",
      ]);
      modelCalls.records.splice(
        modelCalls.records.findIndex((row) => row.agentRole === ModelCallAgentRole.JUDGE_3),
        1,
      );
    });

    await check("missing final verdict", async (modelCalls) => {
      created.runs[0].finalVerdict = null;
      await insertAdvocates(modelCalls, created.id, created.runs[0].id);
      await insertJudges(modelCalls, created.id, created.runs[0].id, [
        "JUSTIFIED",
        "JUSTIFIED",
        "JUSTIFIED",
      ]);
    });
  });

  it("fails closed when more than one SUCCEEDED attempt exists for one role", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "duplicate.md",
      chargeSheetText: "# Case",
    });
    created.runs[0].status = TribunalRunStatus.RUNNING;
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        attempt: 1,
        validatedResponse: advocate(RepresentativeRole.DEFENSE_1),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        attempt: 2,
        validatedResponse: {
          ...advocate(RepresentativeRole.DEFENSE_1),
          summary: "Second success must not be chosen silently.",
        },
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "INTEGRITY_VIOLATION");
      assert.match(result.errorMessage, /DEFENSE_1/);
    }
  });

  it("orders runs, roles, and attempts deterministically", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "order.md",
      chargeSheetText: "# Case",
    });
    const same = created.runs[0];
    same.status = TribunalRunStatus.RUNNING;

    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.JUDGES,
        agentRole: ModelCallAgentRole.JUDGE_3,
        validatedResponse: judge(JudgeRole.JUDGE_3, "NOT_JUSTIFIED"),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_2,
        attempt: 2,
        validatedResponse: advocate(RepresentativeRole.DEFENSE_2),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.PROSECUTION_1,
        validatedResponse: advocate(RepresentativeRole.PROSECUTION_1),
      }),
    );
    await modelCalls.insert(
      call({
        caseId: created.id,
        runId: same.id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_2,
        attempt: 1,
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "HTTP_ERROR",
        errorMessage: "OpenRouter HTTP 429",
      }),
    );

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(Object.keys(result.results.runs), [
      TribunalRunKind.SAME_MODEL,
      TribunalRunKind.MIXED_MODELS,
    ]);
    assert.deepEqual(
      Object.keys(result.results.runs.SAME_MODEL.advocates),
      [...REPRESENTATIVE_ROLES_IN_ORDER],
    );
    assert.deepEqual(
      Object.keys(result.results.runs.SAME_MODEL.judges),
      [...JUDGE_ROLES_IN_ORDER],
    );
    assert.deepEqual(
      result.results.runs.SAME_MODEL.attempts.map((row) => `${row.agentRole}:${row.attempt}`),
      ["DEFENSE_2:1", "DEFENSE_2:2", "PROSECUTION_1:1", "JUDGE_3:1"],
    );
  });

  it("uses the persisted Run verdict and does not infer one from Judge prose", async () => {
    const cases = new InMemoryCaseRepository();
    const modelCalls = new MemoryModelCalls();
    const created = await cases.create({
      originalFileName: "verdict.md",
      chargeSheetText: "# Case",
    });
    const same = created.runs[0];
    same.status = TribunalRunStatus.SUCCEEDED;
    same.finalVerdict = TribunalRunVerdict.NOT_JUSTIFIED;

    await insertAdvocates(modelCalls, created.id, same.id);
    await insertJudges(modelCalls, created.id, same.id, [
      "JUSTIFIED",
      "JUSTIFIED",
      "JUSTIFIED",
    ]);
    const judge1 = modelCalls.records.find(
      (row) => row.agentRole === ModelCallAgentRole.JUDGE_1,
    );
    assert.ok(judge1);
    judge1.validatedResponse = {
      ...judge(JudgeRole.JUDGE_1, "JUSTIFIED"),
      summary: "This prose says the act was justified.",
    };

    const result = await getCaseResults({ caseId: created.id }, { cases, modelCalls });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(
      result.results.runs.SAME_MODEL.finalVerdict,
      TribunalRunVerdict.NOT_JUSTIFIED,
    );
    assert.equal(result.results.runs.SAME_MODEL.judges.JUDGE_1?.verdict, "JUSTIFIED");
  });

  it("rejects invalid Run topology before reading Model Calls", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "broken.md",
      chargeSheetText: "# Case",
    });
    created.runs = created.runs.slice(0, 1);
    let listed = 0;
    const result = await getCaseResults(
      { caseId: created.id },
      {
        cases,
        modelCalls: {
          async listByCaseId() {
            listed += 1;
            return [];
          },
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "INVALID_TOPOLOGY");
    }
    assert.equal(listed, 0);
  });

  it("returns CASE_NOT_FOUND without reading Model Calls", async () => {
    const cases = new InMemoryCaseRepository();
    let listed = 0;
    const result = await getCaseResults(
      { caseId: "00000000-0000-4000-8000-000000000099" },
      {
        cases,
        modelCalls: {
          async listByCaseId() {
            listed += 1;
            return [];
          },
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "CASE_NOT_FOUND");
    }
    assert.equal(listed, 0);
  });
});
