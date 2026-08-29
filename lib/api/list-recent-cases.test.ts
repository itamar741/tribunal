import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseConfigError } from "../db";
import type { RecentExecutedCase } from "../results";
import { handleListRecentCases } from "./list-recent-cases";

function recentCase(
  overrides: Partial<RecentExecutedCase> = {},
): RecentExecutedCase {
  return {
    caseId: "00000000-0000-4000-8000-000000000001",
    originalFileName: "01-t-001-charge-sheet.md",
    executedAt: new Date("2026-08-29T10:42:00.000Z"),
    totalCost: { value: "0.0124", complete: true },
    ...overrides,
  };
}

describe("handleListRecentCases", () => {
  it("returns five recent Cases as a public DTO", async () => {
    const listed: Array<{ limit?: number }> = [];
    const cases = Array.from({ length: 5 }, (_, index) =>
      recentCase({
        caseId: `00000000-0000-4000-8000-00000000000${index + 1}`,
        originalFileName: `case-${index + 1}.md`,
        executedAt: new Date(`2026-08-2${9 - index}T10:42:00.000Z`),
      }),
    );

    const result = await handleListRecentCases({
      async listRecentExecutedCases(input = {}) {
        listed.push(input);
        return cases;
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    if (result.body.ok) {
      assert.equal(result.body.cases.length, 5);
      assert.deepEqual(
        result.body.cases.map((row) => row.originalFileName),
        ["case-1.md", "case-2.md", "case-3.md", "case-4.md", "case-5.md"],
      );
      assert.equal(result.body.cases[0]?.executedAt, "2026-08-29T10:42:00.000Z");
      assert.equal("chargeSheetText" in result.body.cases[0]!, false);
      assert.equal("validatedResponse" in result.body.cases[0]!, false);
    }
    assert.deepEqual(listed, [{ limit: 5 }]);
  });

  it("returns an empty list when no Cases have been executed", async () => {
    const result = await handleListRecentCases({
      async listRecentExecutedCases() {
        return [];
      },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, cases: [] });
  });

  it("does not execute models or mutate Case lifecycle", async () => {
    const calls: string[] = [];
    const result = await handleListRecentCases({
      async listRecentExecutedCases() {
        calls.push("list");
        return [recentCase()];
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.deepEqual(calls, ["list"]);
  });

  it("returns a safe error when the database is unavailable", async () => {
    const result = await handleListRecentCases({
      async listRecentExecutedCases() {
        throw new DatabaseConfigError("DATABASE_URL is not configured.");
      },
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "DATABASE_UNAVAILABLE");
      assert.equal(result.body.error.includes("OPENROUTER"), false);
      assert.equal(result.body.error.includes("sk-"), false);
    }
  });

  it("returns a safe internal error for unexpected failures", async () => {
    const result = await handleListRecentCases({
      async listRecentExecutedCases() {
        throw new Error("select * from secrets");
      },
    });
    assert.equal(result.status, 500);
    assert.equal(result.body.ok, false);
    if (!result.body.ok) {
      assert.equal(result.body.code, "INTERNAL_ERROR");
      assert.equal(result.body.error.includes("secrets"), false);
    }
  });
});
