import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JudgeVerdict } from "../ai/contracts";
import { calculateMajority } from "./majority";

describe("calculateMajority", () => {
  const cases: Array<{
    votes: readonly [JudgeVerdict, JudgeVerdict, JudgeVerdict];
    expected: JudgeVerdict;
  }> = [
    { votes: ["JUSTIFIED", "JUSTIFIED", "JUSTIFIED"], expected: "JUSTIFIED" },
    { votes: ["JUSTIFIED", "JUSTIFIED", "NOT_JUSTIFIED"], expected: "JUSTIFIED" },
    { votes: ["JUSTIFIED", "NOT_JUSTIFIED", "JUSTIFIED"], expected: "JUSTIFIED" },
    { votes: ["NOT_JUSTIFIED", "JUSTIFIED", "JUSTIFIED"], expected: "JUSTIFIED" },
    { votes: ["NOT_JUSTIFIED", "NOT_JUSTIFIED", "NOT_JUSTIFIED"], expected: "NOT_JUSTIFIED" },
    { votes: ["NOT_JUSTIFIED", "NOT_JUSTIFIED", "JUSTIFIED"], expected: "NOT_JUSTIFIED" },
    { votes: ["NOT_JUSTIFIED", "JUSTIFIED", "NOT_JUSTIFIED"], expected: "NOT_JUSTIFIED" },
    { votes: ["JUSTIFIED", "NOT_JUSTIFIED", "NOT_JUSTIFIED"], expected: "NOT_JUSTIFIED" },
  ];

  it("computes two-of-three from verdict values only", () => {
    for (const example of cases) {
      assert.equal(
        calculateMajority(example.votes),
        example.expected,
        example.votes.join("/"),
      );
    }
  });
});
