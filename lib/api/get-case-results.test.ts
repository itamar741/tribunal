import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TribunalRunKind } from "../ai/configurations";
import { InMemoryCaseRepository, TribunalRunStatus, TribunalRunVerdict } from "../cases";
import { DatabaseConfigError } from "../db";
import type { GetCaseResultsResult } from "../results";
import { handleGetCaseResults } from "./get-case-results";

const emptyModelCalls = {
  async listByCaseId() {
    return [];
  },
};

describe("handleGetCaseResults", () => {
  it("rejects an invalid Case ID before reading results", async () => {
    let listed = 0;
    const result = await handleGetCaseResults("bad-id", {
      cases: new InMemoryCaseRepository(),
      modelCalls: {
        async listByCaseId() {
          listed += 1;
          return [];
        },
      },
    });
    assert.equal(result.status, 400);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "INVALID_CASE_ID");
    }
    assert.equal(listed, 0);
  });

  it("returns 404 without executing when the Case is missing", async () => {
    const result = await handleGetCaseResults(
      "00000000-0000-4000-8000-000000000099",
      {
        cases: new InMemoryCaseRepository(),
        modelCalls: emptyModelCalls,
      },
    );
    assert.equal(result.status, 404);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "CASE_NOT_FOUND");
    }
  });

  it("returns persisted PENDING results without a Case-level verdict", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "pending.md",
      chargeSheetText: "# Secret charge sheet",
    });
    const result = await handleGetCaseResults(created.id, {
      cases,
      modelCalls: emptyModelCalls,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    if (result.body.ok) {
      assert.equal(result.body.case.id, created.id);
      assert.equal(result.body.case.originalFileName, "pending.md");
      assert.equal(typeof result.body.case.createdAt, "string");
      assert.equal(result.body.runs.SAME_MODEL.status, TribunalRunStatus.PENDING);
      assert.equal(result.body.runs.MIXED_MODELS.status, TribunalRunStatus.PENDING);
      assert.equal(result.body.runs.SAME_MODEL.finalVerdict, null);
      assert.equal("chargeSheetText" in result.body.case, false);
      assert.equal("finalVerdict" in result.body, false);
    }
  });

  it("returns 409 for invalid topology", async () => {
    const result = await handleGetCaseResults(
      "00000000-0000-4000-8000-000000000001",
      {
        cases: new InMemoryCaseRepository(),
        modelCalls: emptyModelCalls,
        async getCaseResults(): Promise<GetCaseResultsResult> {
          return {
            ok: false,
            reason: "INVALID_TOPOLOGY",
            errorMessage: "Case must have exactly one SAME_MODEL Run and one MIXED_MODELS Run.",
          };
        },
      },
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "INVALID_TOPOLOGY");
    }
  });

  it("returns 500 for integrity violations without rerunning the Tribunal", async () => {
    let executed = 0;
    const result = await handleGetCaseResults(
      "00000000-0000-4000-8000-000000000001",
      {
        cases: new InMemoryCaseRepository(),
        modelCalls: emptyModelCalls,
        async getCaseResults(): Promise<GetCaseResultsResult> {
          executed += 1;
          return {
            ok: false,
            reason: "INTEGRITY_VIOLATION",
            errorMessage: "SUCCEEDED Run is missing required advocate outputs.",
          };
        },
      },
    );
    assert.equal(result.status, 500);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "INTEGRITY_VIOLATION");
    }
    assert.equal(executed, 1);
  });

  it("returns 503 for database configuration errors", async () => {
    const result = await handleGetCaseResults(
      "00000000-0000-4000-8000-000000000001",
      {
        cases: {
          async getById() {
            throw new DatabaseConfigError("DATABASE_URL is not configured.");
          },
        },
        modelCalls: emptyModelCalls,
      },
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "DATABASE_UNAVAILABLE");
    }
  });

  it("exposes a successful sibling after a failed Run without inventing a Case verdict", async () => {
    const cases = new InMemoryCaseRepository();
    const created = await cases.create({
      originalFileName: "partial.md",
      chargeSheetText: "# Secret",
    });
    created.runs[0].status = TribunalRunStatus.SUCCEEDED;
    created.runs[0].finalVerdict = TribunalRunVerdict.JUSTIFIED;
    created.runs[1].status = TribunalRunStatus.FAILED;
    created.runs[1].failureReason = "Advocate stage failed.";
    const result = await handleGetCaseResults(created.id, {
      cases,
      modelCalls: emptyModelCalls,
      async getCaseResults(): Promise<GetCaseResultsResult> {
        return {
          ok: true,
          results: {
            case: {
              id: created.id,
              originalFileName: created.originalFileName,
              createdAt: created.createdAt,
            },
            runs: {
              [TribunalRunKind.SAME_MODEL]: {
                id: created.runs[0].id,
                runType: TribunalRunKind.SAME_MODEL,
                status: TribunalRunStatus.SUCCEEDED,
                finalVerdict: TribunalRunVerdict.JUSTIFIED,
                failureReason: null,
                startedAt: new Date("2026-01-01T00:00:00.000Z"),
                completedAt: new Date("2026-01-01T00:01:00.000Z"),
                advocates: {
                  DEFENSE_1: null,
                  DEFENSE_2: null,
                  PROSECUTION_1: null,
                  PROSECUTION_2: null,
                },
                judges: {
                  JUDGE_1: null,
                  JUDGE_2: null,
                  JUDGE_3: null,
                },
                attempts: [],
                accounting: {
                  agents: {
                    DEFENSE_1: emptyUsage(),
                    DEFENSE_2: emptyUsage(),
                    PROSECUTION_1: emptyUsage(),
                    PROSECUTION_2: emptyUsage(),
                    JUDGE_1: emptyUsage(),
                    JUDGE_2: emptyUsage(),
                    JUDGE_3: emptyUsage(),
                  },
                  advocates: emptyUsage(),
                  judges: emptyUsage(),
                  run: emptyUsage(),
                },
              },
              [TribunalRunKind.MIXED_MODELS]: {
                id: created.runs[1].id,
                runType: TribunalRunKind.MIXED_MODELS,
                status: TribunalRunStatus.FAILED,
                finalVerdict: null,
                failureReason: "Advocate stage failed.",
                startedAt: new Date("2026-01-01T00:00:00.000Z"),
                completedAt: new Date("2026-01-01T00:00:30.000Z"),
                advocates: {
                  DEFENSE_1: null,
                  DEFENSE_2: null,
                  PROSECUTION_1: null,
                  PROSECUTION_2: null,
                },
                judges: {
                  JUDGE_1: null,
                  JUDGE_2: null,
                  JUDGE_3: null,
                },
                attempts: [],
                accounting: {
                  agents: {
                    DEFENSE_1: emptyUsage(),
                    DEFENSE_2: emptyUsage(),
                    PROSECUTION_1: emptyUsage(),
                    PROSECUTION_2: emptyUsage(),
                    JUDGE_1: emptyUsage(),
                    JUDGE_2: emptyUsage(),
                    JUDGE_3: emptyUsage(),
                  },
                  advocates: emptyUsage(),
                  judges: emptyUsage(),
                  run: emptyUsage(),
                },
              },
            },
            accounting: emptyUsage(),
          },
        };
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    if (result.body.ok) {
      assert.equal(result.body.runs.SAME_MODEL.finalVerdict, TribunalRunVerdict.JUSTIFIED);
      assert.equal(result.body.runs.MIXED_MODELS.status, TribunalRunStatus.FAILED);
      assert.equal(result.body.runs.SAME_MODEL.startedAt, "2026-01-01T00:00:00.000Z");
      assert.equal("finalVerdict" in result.body, false);
    }
  });
});

function emptyUsage() {
  return {
    inputTokens: { value: 0, complete: true },
    outputTokens: { value: 0, complete: true },
    totalTokens: { value: 0, complete: true },
    inputCost: { value: "0", complete: true },
    outputCost: { value: "0", complete: true },
    totalCost: { value: "0", complete: true },
    durationMs: { value: 0, complete: true },
    attemptCount: 0,
  };
}
