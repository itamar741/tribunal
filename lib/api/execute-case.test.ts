import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TribunalRunKind } from "../ai/configurations";
import type { AdvocateResponse, JudgeResponse } from "../ai/contracts";
import { JudgeRole, RepresentativeRole } from "../ai/profiles";
import { InMemoryCaseRepository } from "../cases";
import { DatabaseConfigError } from "../db";
import type {
  CaseTribunalResult,
  ExecuteCaseTribunalsInput,
  TribunalRunSuccess,
} from "../tribunal";
import { handleExecuteCase } from "./execute-case";
import type { ApiErrorBody } from "./http";

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
    key_reasons: [`${role} one.`, `${role} two.`, `${role} three.`],
  };
}

function runSuccess(verdict: JudgeResponse["verdict"] = "JUSTIFIED"): TribunalRunSuccess {
  return {
    ok: true,
    advocates: {
      [RepresentativeRole.DEFENSE_1]: advocate(RepresentativeRole.DEFENSE_1),
      [RepresentativeRole.DEFENSE_2]: advocate(RepresentativeRole.DEFENSE_2),
      [RepresentativeRole.PROSECUTION_1]: advocate(RepresentativeRole.PROSECUTION_1),
      [RepresentativeRole.PROSECUTION_2]: advocate(RepresentativeRole.PROSECUTION_2),
    },
    advocateAgents: {
      [RepresentativeRole.DEFENSE_1]: { successfulAttempt: 1, model: "test-model" },
      [RepresentativeRole.DEFENSE_2]: { successfulAttempt: 1, model: "test-model" },
      [RepresentativeRole.PROSECUTION_1]: { successfulAttempt: 1, model: "test-model" },
      [RepresentativeRole.PROSECUTION_2]: { successfulAttempt: 1, model: "test-model" },
    },
    judges: {
      [JudgeRole.JUDGE_1]: judge(JudgeRole.JUDGE_1, verdict),
      [JudgeRole.JUDGE_2]: judge(JudgeRole.JUDGE_2, verdict),
      [JudgeRole.JUDGE_3]: judge(JudgeRole.JUDGE_3, verdict),
    },
    judgeAgents: {
      [JudgeRole.JUDGE_1]: { successfulAttempt: 1, model: "test-model" },
      [JudgeRole.JUDGE_2]: { successfulAttempt: 1, model: "test-model" },
      [JudgeRole.JUDGE_3]: { successfulAttempt: 1, model: "test-model" },
    },
    finalVerdict: verdict,
  };
}

function isApiError(body: { ok: false }): body is ApiErrorBody {
  return "code" in body;
}

async function handle(
  caseId: string,
  overrides: {
    cases?: Pick<InMemoryCaseRepository, "getById">;
    getApiKey?: () => string | null;
    execute?: (input: ExecuteCaseTribunalsInput) => Promise<CaseTribunalResult>;
  } = {},
) {
  const cases = overrides.cases ?? new InMemoryCaseRepository();
  return handleExecuteCase(caseId, {
    cases,
    getApiKey: overrides.getApiKey ?? (() => "test-key"),
    execute:
      overrides.execute ??
      (async () => ({
        ok: true,
        runs: {
          [TribunalRunKind.SAME_MODEL]: runSuccess("JUSTIFIED"),
          [TribunalRunKind.MIXED_MODELS]: runSuccess("NOT_JUSTIFIED"),
        },
      })),
  });
}

describe("handleExecuteCase", () => {
  it("rejects an invalid Case ID before loading the Case", async () => {
    let loaded = 0;
    const result = await handle("not-a-uuid", {
      cases: {
        async getById() {
          loaded += 1;
          return null;
        },
      },
      execute: async () => {
        throw new Error("execute must not run");
      },
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && isApiError(result.body)) {
      assert.equal(result.body.code, "INVALID_CASE_ID");
    }
    assert.equal(loaded, 0);
  });

  it("returns 404 when the Case is missing and does not execute", async () => {
    let executed = 0;
    const result = await handle("00000000-0000-4000-8000-000000000099", {
      execute: async () => {
        executed += 1;
        throw new Error("execute must not run");
      },
    });
    assert.equal(result.status, 404);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && isApiError(result.body)) {
      assert.equal(result.body.code, "CASE_NOT_FOUND");
    }
    assert.equal(executed, 0);
  });

  it("returns 503 when OpenRouter is not configured and does not execute", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "case.md",
      chargeSheetText: "# Persisted charge sheet",
    });
    let executed = 0;
    const result = await handle(created.id, {
      cases,
      getApiKey: () => null,
      execute: async () => {
        executed += 1;
        throw new Error("execute must not run");
      },
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && isApiError(result.body)) {
      assert.equal(result.body.code, "OPENROUTER_UNAVAILABLE");
      assert.equal(result.body.error.includes("OPENROUTER_API_KEY"), false);
      assert.equal(result.body.error.includes("test-key"), false);
    }
    assert.equal(executed, 0);
  });

  it("executes with the persisted charge sheet and ignores client content", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "case.md",
      chargeSheetText: "# Authoritative persisted text",
    });
    const inputs: ExecuteCaseTribunalsInput[] = [];
    const result = await handle(created.id, {
      cases,
      execute: async (input) => {
        inputs.push(input);
        return {
          ok: true,
          runs: {
            [TribunalRunKind.SAME_MODEL]: runSuccess("JUSTIFIED"),
            [TribunalRunKind.MIXED_MODELS]: runSuccess("NOT_JUSTIFIED"),
          },
        };
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    if (result.body.ok) {
      assert.equal(result.body.caseId, created.id);
      assert.equal(result.body.runs.SAME_MODEL.finalVerdict, "JUSTIFIED");
      assert.equal(result.body.runs.MIXED_MODELS.finalVerdict, "NOT_JUSTIFIED");
      assert.equal("finalVerdict" in result.body, false);
      assert.equal("chargeSheetText" in result.body, false);
    }
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0]?.chargeSheetMarkdown, "# Authoritative persisted text");
    assert.equal(inputs[0]?.caseId, created.id);
    assert.equal(inputs[0]?.apiKey, "test-key");
  });

  it("returns HTTP 200 with both independent outcomes when one Run fails", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "partial.md",
      chargeSheetText: "# Case",
    });
    const result = await handle(created.id, {
      cases,
      execute: async () => ({
        ok: false,
        reason: "RUN_FAILURE",
        runs: {
          [TribunalRunKind.SAME_MODEL]: runSuccess("JUSTIFIED"),
          [TribunalRunKind.MIXED_MODELS]: {
            ok: false,
            failedStage: "ADVOCATES",
            failedRoles: [RepresentativeRole.DEFENSE_1],
            failures: [
              {
                role: RepresentativeRole.DEFENSE_1,
                errorType: "HTTP_ERROR",
                errorMessage: "OpenRouter HTTP 401 Bearer secret-value",
                attemptsMade: 1,
              },
            ],
          },
        },
      }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && "runs" in result.body) {
      assert.equal(result.body.reason, "RUN_FAILURE");
      assert.equal(result.body.runs.SAME_MODEL.ok, true);
      if (result.body.runs.SAME_MODEL.ok) {
        assert.equal(result.body.runs.SAME_MODEL.finalVerdict, "JUSTIFIED");
      }
      assert.equal(result.body.runs.MIXED_MODELS.ok, false);
      if (!result.body.runs.MIXED_MODELS.ok) {
        assert.equal(result.body.runs.MIXED_MODELS.failedStage, "ADVOCATES");
        assert.equal(
          result.body.runs.MIXED_MODELS.failures?.[0]?.errorMessage.includes("secret-value"),
          false,
        );
      }
      assert.equal("finalVerdict" in result.body, false);
    }
  });

  it("returns HTTP 200 with both Run failures when both Tribunal Runs fail", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "failed.md",
      chargeSheetText: "# Case",
    });
    const result = await handle(created.id, {
      cases,
      execute: async () => ({
        ok: false,
        reason: "RUN_FAILURE",
        runs: {
          [TribunalRunKind.SAME_MODEL]: {
            ok: false,
            failedStage: "JUDGES",
            failedRoles: [JudgeRole.JUDGE_2],
            failures: [
              {
                role: JudgeRole.JUDGE_2,
                errorType: "MALFORMED_JSON",
                errorMessage: "Assistant content was not valid JSON.",
                attemptsMade: 2,
              },
            ],
          },
          [TribunalRunKind.MIXED_MODELS]: {
            ok: false,
            failedStage: "ADVOCATES",
            failedRoles: [RepresentativeRole.PROSECUTION_1],
            failures: [
              {
                role: RepresentativeRole.PROSECUTION_1,
                errorType: "HTTP_ERROR",
                errorMessage: "OpenRouter HTTP 429",
                attemptsMade: 2,
              },
            ],
          },
        },
      }),
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && "runs" in result.body) {
      assert.equal(result.body.runs.SAME_MODEL.ok, false);
      assert.equal(result.body.runs.MIXED_MODELS.ok, false);
    }
  });

  it("preserves NOT_PENDING duplicate-execution outcomes without a second history", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "dup.md",
      chargeSheetText: "# Case",
    });
    let executed = 0;
    const notPending: CaseTribunalResult = {
      ok: false,
      reason: "RUN_FAILURE",
      runs: {
        [TribunalRunKind.SAME_MODEL]: {
          ok: false,
          failedStage: "RUN",
          reason: "NOT_PENDING",
          errorMessage: "Tribunal Run is not PENDING and cannot be executed.",
        },
        [TribunalRunKind.MIXED_MODELS]: {
          ok: false,
          failedStage: "RUN",
          reason: "NOT_PENDING",
          errorMessage: "Tribunal Run is not PENDING and cannot be executed.",
        },
      },
    };
    const first = await handle(created.id, {
      cases,
      execute: async () => {
        executed += 1;
        return notPending;
      },
    });
    const second = await handle(created.id, {
      cases,
      execute: async () => {
        executed += 1;
        return notPending;
      },
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(executed, 2);
    if (!first.body.ok && "runs" in first.body) {
      assert.equal(first.body.runs.SAME_MODEL.ok, false);
      if (!first.body.runs.SAME_MODEL.ok) {
        assert.equal(first.body.runs.SAME_MODEL.reason, "NOT_PENDING");
      }
    }
  });

  it("returns 409 for invalid durable topology", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "broken.md",
      chargeSheetText: "# Case",
    });
    const result = await handle(created.id, {
      cases,
      execute: async () => ({
        ok: false,
        reason: "INVALID_TOPOLOGY",
        errorMessage: "Case must have exactly one SAME_MODEL Run and one MIXED_MODELS Run.",
      }),
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && isApiError(result.body)) {
      assert.equal(result.body.code, "INVALID_TOPOLOGY");
    }
  });

  it("returns 503 for database configuration errors", async () => {
    const result = await handle("00000000-0000-4000-8000-000000000001", {
      cases: {
        async getById() {
          throw new DatabaseConfigError("DATABASE_URL is not configured.");
        },
      },
      execute: async () => {
        throw new Error("execute must not run");
      },
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && isApiError(result.body)) {
      assert.equal(result.body.code, "DATABASE_UNAVAILABLE");
    }
  });

  it("returns a safe 500 without secrets or stack traces", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "boom.md",
      chargeSheetText: "# Case",
    });
    const result = await handle(created.id, {
      cases,
      execute: async () => {
        throw new Error("OPENROUTER_API_KEY=sk-secret stack at foo.ts:1");
      },
    });
    assert.equal(result.status, 500);
    assert.equal(result.body.ok, false);
    if (!result.body.ok && isApiError(result.body)) {
      assert.equal(result.body.code, "INTERNAL_ERROR");
      assert.equal(result.body.error.includes("sk-secret"), false);
      assert.equal(result.body.error.includes("foo.ts"), false);
      assert.equal(result.body.error.includes("OPENROUTER_API_KEY"), false);
    }
  });
});
