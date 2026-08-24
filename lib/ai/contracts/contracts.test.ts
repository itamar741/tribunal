import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advocateResponseSchema,
  judgeResponseSchema,
} from "./index";

const validAdvocate = {
  summary: "The defense should prevail on the supplied facts.",
  arguments: [
    {
      title: "No intent",
      argument: "The charge sheet does not establish intent.",
    },
    {
      title: "Inconsistent timeline",
      argument: "The recorded timeline contradicts the alleged act.",
    },
    {
      title: "Unmet burden",
      argument: "The remaining facts do not meet the burden of proof.",
    },
  ],
  conclusion: "The killing was not justified on these facts.",
} as const;

const validJustifiedJudge = {
  verdict: "JUSTIFIED",
  summary: "The supplied facts and arguments support justification.",
  key_reasons: [
    "The charge sheet records a clear intentional killing.",
    "Prosecution arguments track those facts.",
    "Defense arguments do not displace the recorded justification analysis.",
  ],
} as const;

const validNotJustifiedJudge = {
  verdict: "NOT_JUSTIFIED",
  summary: "The supplied facts do not establish justification.",
  key_reasons: [
    "The charge sheet leaves a material gap.",
    "Defense arguments stay within those facts.",
    "Prosecution arguments require inferences not in the record.",
  ],
} as const;

describe("advocateResponseSchema", () => {
  it("accepts an exact valid response", () => {
    const result = advocateResponseSchema.safeParse(validAdvocate);

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, validAdvocate);
    }
  });

  it("rejects a missing field", () => {
    const result = advocateResponseSchema.safeParse({
      summary: validAdvocate.summary,
      arguments: validAdvocate.arguments,
    });

    assert.equal(result.success, false);
  });

  it("rejects an additional top-level field", () => {
    const result = advocateResponseSchema.safeParse({
      ...validAdvocate,
      side: "DEFENSE",
    });

    assert.equal(result.success, false);
  });

  it("rejects an additional field inside an argument", () => {
    const result = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: [
        { ...validAdvocate.arguments[0], emphasis: "high" },
        validAdvocate.arguments[1],
        validAdvocate.arguments[2],
      ],
    });

    assert.equal(result.success, false);
  });

  it("rejects 2 arguments", () => {
    const result = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: validAdvocate.arguments.slice(0, 2),
    });

    assert.equal(result.success, false);
  });

  it("rejects 4 arguments", () => {
    const result = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: [
        ...validAdvocate.arguments,
        { title: "Extra", argument: "An additional argument." },
      ],
    });

    assert.equal(result.success, false);
  });

  it("rejects an empty summary", () => {
    const result = advocateResponseSchema.safeParse({
      ...validAdvocate,
      summary: "",
    });

    assert.equal(result.success, false);
  });

  it("rejects a whitespace-only summary", () => {
    const result = advocateResponseSchema.safeParse({
      ...validAdvocate,
      summary: "  \n\t  ",
    });

    assert.equal(result.success, false);
  });

  it("rejects an empty or whitespace title", () => {
    const emptyTitle = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: [
        { title: "", argument: validAdvocate.arguments[0].argument },
        validAdvocate.arguments[1],
        validAdvocate.arguments[2],
      ],
    });
    const whitespaceTitle = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: [
        { title: "   ", argument: validAdvocate.arguments[0].argument },
        validAdvocate.arguments[1],
        validAdvocate.arguments[2],
      ],
    });

    assert.equal(emptyTitle.success, false);
    assert.equal(whitespaceTitle.success, false);
  });

  it("rejects an empty or whitespace argument", () => {
    const emptyArgument = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: [
        { title: validAdvocate.arguments[0].title, argument: "" },
        validAdvocate.arguments[1],
        validAdvocate.arguments[2],
      ],
    });
    const whitespaceArgument = advocateResponseSchema.safeParse({
      ...validAdvocate,
      arguments: [
        { title: validAdvocate.arguments[0].title, argument: " \t " },
        validAdvocate.arguments[1],
        validAdvocate.arguments[2],
      ],
    });

    assert.equal(emptyArgument.success, false);
    assert.equal(whitespaceArgument.success, false);
  });

  it("rejects an empty or whitespace conclusion", () => {
    const emptyConclusion = advocateResponseSchema.safeParse({
      ...validAdvocate,
      conclusion: "",
    });
    const whitespaceConclusion = advocateResponseSchema.safeParse({
      ...validAdvocate,
      conclusion: "\n  ",
    });

    assert.equal(emptyConclusion.success, false);
    assert.equal(whitespaceConclusion.success, false);
  });
});

describe("judgeResponseSchema", () => {
  it("accepts a JUSTIFIED response", () => {
    const result = judgeResponseSchema.safeParse(validJustifiedJudge);

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, validJustifiedJudge);
    }
  });

  it("accepts a NOT_JUSTIFIED response", () => {
    const result = judgeResponseSchema.safeParse(validNotJustifiedJudge);

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, validNotJustifiedJudge);
    }
  });

  it("rejects obsolete GUILTY and NOT_GUILTY verdict values", () => {
    const guilty = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      verdict: "GUILTY",
    });
    const notGuilty = judgeResponseSchema.safeParse({
      ...validNotJustifiedJudge,
      verdict: "NOT_GUILTY",
    });

    assert.equal(guilty.success, false);
    assert.equal(notGuilty.success, false);
  });

  it("rejects an invalid verdict such as MAYBE", () => {
    const result = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      verdict: "MAYBE",
    });

    assert.equal(result.success, false);
  });

  it("rejects lowercase, whitespace-padded, or prose verdicts", () => {
    const lowercase = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      verdict: "justified",
    });
    const padded = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      verdict: "JUSTIFIED ",
    });
    const prose = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      verdict: "likely justified",
    });

    assert.equal(lowercase.success, false);
    assert.equal(padded.success, false);
    assert.equal(prose.success, false);
  });

  it("rejects a missing field", () => {
    const result = judgeResponseSchema.safeParse({
      verdict: validJustifiedJudge.verdict,
      key_reasons: validJustifiedJudge.key_reasons,
    });

    assert.equal(result.success, false);
  });

  it("rejects an additional field", () => {
    const result = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      confidence: 0.9,
    });

    assert.equal(result.success, false);
  });

  it("rejects 2 reasons", () => {
    const result = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      key_reasons: validJustifiedJudge.key_reasons.slice(0, 2),
    });

    assert.equal(result.success, false);
  });

  it("rejects 4 reasons", () => {
    const result = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      key_reasons: [...validJustifiedJudge.key_reasons, "An extra reason."],
    });

    assert.equal(result.success, false);
  });

  it("rejects an empty or whitespace summary", () => {
    const emptySummary = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      summary: "",
    });
    const whitespaceSummary = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      summary: "   ",
    });

    assert.equal(emptySummary.success, false);
    assert.equal(whitespaceSummary.success, false);
  });

  it("rejects an empty or whitespace reason", () => {
    const emptyReason = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      key_reasons: ["", validJustifiedJudge.key_reasons[1], validJustifiedJudge.key_reasons[2]],
    });
    const whitespaceReason = judgeResponseSchema.safeParse({
      ...validJustifiedJudge,
      key_reasons: [
        " \n ",
        validJustifiedJudge.key_reasons[1],
        validJustifiedJudge.key_reasons[2],
      ],
    });

    assert.equal(emptyReason.success, false);
    assert.equal(whitespaceReason.success, false);
  });
});
