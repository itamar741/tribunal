import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverySummary } from "./recovery";

describe("recoverySummary", () => {
  it("reports an internal retry after a successful run", () => {
    assert.equal(
      recoverySummary({
        status: "SUCCEEDED",
        attempts: [{ status: "FAILED" }, { status: "SUCCEEDED" }],
      }),
      "Recovered after 1 failed attempt.",
    );
  });

  it("reports a later recovery cycle and preserves the exact failure count", () => {
    assert.equal(
      recoverySummary({
        status: "SUCCEEDED",
        recoveryCycle: 2,
        attempts: [
          { status: "FAILED" },
          { status: "FAILED" },
          { status: "SUCCEEDED" },
        ],
      }),
      "Recovered in recovery cycle 2 after 2 failed attempts.",
    );
  });

  it("does not imply recovery for an unrecovered or clean run", () => {
    assert.equal(recoverySummary({ status: "FAILED", attempts: [{ status: "FAILED" }] }), null);
    assert.equal(recoverySummary({ status: "SUCCEEDED", attempts: [{ status: "SUCCEEDED" }] }), null);
  });
});
