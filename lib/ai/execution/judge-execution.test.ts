import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { getModelIdForRole, TribunalRunKind } from "../configurations";
import {
  JUDGE_RESPONSE_JSON_SCHEMA_NAME,
  judgeResponseJsonSchema,
  judgeResponseSchema,
  type AdvocateResponse,
  type JudgeResponse,
} from "../contracts";
import {
  OpenRouterTransportErrorType,
  type OpenRouterChatCompletionInput,
  type OpenRouterChatCompletionResult,
} from "../openrouter";
import { JudgeRole, RepresentativeRole } from "../profiles";
import type { JudgeAdvocateResponses } from "../prompts";
import { OUTPUT_CONTRACT_CORRECTION } from "../prompts";
import {
  ModelCallStage,
  ModelCallStatus,
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../../model-calls";
import { executeJudgeAttempt } from "./execute-judge-attempt";
import { executeJudgeWithRetry } from "./execute-judge-with-retry";
import { AttemptErrorType } from "./errors";
import { parseJudgeResponse } from "./parse-judge-response";

const SAME_MODEL = getModelIdForRole(TribunalRunKind.SAME_MODEL, JudgeRole.JUDGE_1);

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

const validJudge: JudgeResponse = {
  verdict: "JUSTIFIED",
  summary: "The supplied record supports justification.",
  key_reasons: [
    "The charge sheet records a surrender.",
    "Safer alternatives are recorded as unused.",
    "The act was intentional on the supplied facts.",
  ],
};

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

function successTransport(
  overrides?: Partial<Extract<OpenRouterChatCompletionResult, { ok: true }>>,
): OpenRouterChatCompletionResult {
  return {
    ok: true,
    content: JSON.stringify(validJudge),
    returnedModel: SAME_MODEL,
    providerCallId: "gen-judge-success",
    generationId: null,
    usage: {
      promptTokens: 80,
      completionTokens: 30,
      totalTokens: 110,
      totalCost: "0",
    },
    durationMs: 40,
    ...overrides,
  };
}

function httpFailure(status: number): OpenRouterChatCompletionResult {
  return {
    ok: false,
    errorType: OpenRouterTransportErrorType.HTTP_ERROR,
    errorMessage: `OpenRouter HTTP ${status}`,
    httpStatus: status,
    retryAfterHeader: status === 429 ? "3" : null,
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
    durationMs: 15,
  };
}

describe("judgeResponseJsonSchema", () => {
  it("is derived from the Judge Zod contract", () => {
    const schema = judgeResponseJsonSchema();
    const properties = schema.properties as Record<string, unknown>;
    assert.equal(JUDGE_RESPONSE_JSON_SCHEMA_NAME, "judge_response");
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["verdict", "summary", "key_reasons"]);
    assert.equal("$schema" in schema, false);
    assert.ok(properties.verdict);
    assert.ok(properties.summary);
    assert.ok(properties.key_reasons);
    assert.equal(judgeResponseSchema.safeParse(validJudge).success, true);
  });
});

describe("parseJudgeResponse", () => {
  it("accepts contract-valid JSON and rejects malformed or extra-field payloads", () => {
    const ok = parseJudgeResponse(JSON.stringify(validJudge));
    assert.equal(ok.ok, true);
    const malformed = parseJudgeResponse("not-json");
    assert.equal(malformed.ok, false);
    if (!malformed.ok) {
      assert.equal(malformed.errorType, AttemptErrorType.MALFORMED_JSON);
    }
    const invalid = parseJudgeResponse(
      JSON.stringify({ ...validJudge, extra: true }),
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.errorType, AttemptErrorType.CONTRACT_VALIDATION);
    }
  });
});

describe("executeJudgeAttempt", () => {
  it("audits a successful JUDGE_1 attempt without marking the run", async () => {
    const modelCalls = new MemoryModelCalls();
    let captured: OpenRouterChatCompletionInput | undefined;
    const result = await executeJudgeAttempt(
      {
        caseId: "case-j",
        runId: "run-j",
        runKind: TribunalRunKind.SAME_MODEL,
        role: JudgeRole.JUDGE_1,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        advocateResponses: advocates,
        apiKey: "test-key",
      },
      {
        modelCalls,
        completeChat: async (input) => {
          captured = input;
          return successTransport();
        },
      },
    );

    assert.equal(captured?.model, SAME_MODEL);
    assert.equal(result.record.stage, ModelCallStage.JUDGES);
    assert.equal(result.record.agentRole, "JUDGE_1");
    assert.equal(result.record.attempt, 1);
    assert.equal(result.record.status, ModelCallStatus.SUCCEEDED);
    assert.deepEqual(result.response, validJudge);
    assert.deepEqual(result.record.validatedResponse, validJudge);
    assert.equal(modelCalls.records.length, 1);
  });
});

describe("executeJudgeWithRetry", () => {
  async function runRetry(responses: OpenRouterChatCompletionResult[]) {
    const modelCalls = new MemoryModelCalls();
    const calls: OpenRouterChatCompletionInput[] = [];
    const delays: number[] = [];
    let index = 0;
    const result = await executeJudgeWithRetry(
      {
        caseId: "case-jr",
        runId: "run-jr",
        runKind: TribunalRunKind.SAME_MODEL,
        role: JudgeRole.JUDGE_2,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        advocateResponses: advocates,
        apiKey: "test-key",
      },
      {
        modelCalls,
        sleep: async (ms) => {
          delays.push(ms);
        },
        completeChat: async (input) => {
          calls.push(input);
          const response = responses[index];
          index += 1;
          if (!response) {
            throw new Error("Unexpected extra judge attempt.");
          }
          return response;
        },
      },
    );
    return { result, modelCalls, calls, delays };
  }

  it("succeeds on attempt 1", async () => {
    const { result, calls } = await runRetry([successTransport()]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.successfulAttempt, 1);
    }
    assert.equal(calls.length, 1);
  });

  it("retries 429 then succeeds", async () => {
    const { result, calls, delays, modelCalls } = await runRetry([
      httpFailure(429),
      successTransport(),
    ]);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(delays, [3000]);
    assert.equal(calls[0]?.model, calls[1]?.model);
    assert.deepEqual(
      modelCalls.records.map((record) => record.attempt),
      [1, 2],
    );
  });

  it("retries 502 then succeeds", async () => {
    const { result, calls } = await runRetry([httpFailure(502), successTransport()]);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
  });

  it("retries invalid JSON then succeeds", async () => {
    const { result, calls } = await runRetry([
      successTransport({ content: "{not json" }),
      successTransport(),
    ]);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    const secondSystem = calls[1]?.messages[0]?.content ?? "";
    assert.equal(secondSystem.includes(OUTPUT_CONTRACT_CORRECTION), true);
    assert.equal(secondSystem.includes("{not json"), false);
  });

  it("retries Zod failure then succeeds", async () => {
    const { result, calls } = await runRetry([
      successTransport({ content: JSON.stringify({ verdict: "JUSTIFIED" }) }),
      successTransport(),
    ]);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
  });

  it("does not retry 401", async () => {
    const { result, calls } = await runRetry([httpFailure(401)]);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
    if (!result.ok) {
      assert.equal(result.errorType, AttemptErrorType.HTTP_ERROR);
    }
  });

  it("fails permanently after two retryable failures and never attempts a third", async () => {
    const { result, calls, modelCalls } = await runRetry([
      httpFailure(502),
      httpFailure(502),
      successTransport(),
    ]);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 2);
    assert.equal(modelCalls.records.length, 2);
    assert.deepEqual(
      modelCalls.records.map((record) => record.attempt),
      [1, 2],
    );
    assert.equal(
      calls.every((call) => call.model === SAME_MODEL),
      true,
    );
  });
});
