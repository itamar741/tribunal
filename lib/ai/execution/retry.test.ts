import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { getModelIdForRole, TribunalRunKind } from "../configurations";
import type { AdvocateResponse } from "../contracts";
import {
  OpenRouterTransportErrorType,
  type OpenRouterChatCompletionInput,
  type OpenRouterChatCompletionResult,
} from "../openrouter";
import { RepresentativeRole } from "../profiles";
import { OUTPUT_CONTRACT_CORRECTION } from "../prompts";
import {
  ModelCallStatus,
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../../model-calls";
import { executeRepresentativeWithRetry } from "./execute-representative-with-retry";
import { AttemptErrorType } from "./errors";
import {
  MAX_RETRY_DELAY_MS,
  RATE_LIMIT_DEFAULT_DELAY_MS,
  TRANSIENT_RETRY_DELAY_MS,
  RetryReason,
  classifyRetry,
  parseRetryAfterMs,
} from "./retryability";

const SAME_MODEL = getModelIdForRole(
  TribunalRunKind.SAME_MODEL,
  RepresentativeRole.DEFENSE_1,
);

const validAdvocate: AdvocateResponse = {
  summary: "The supplied record supports the defense.",
  arguments: [
    {
      title: "Surrender had occurred",
      argument: "The charge sheet records that organized resistance had ceased.",
    },
    {
      title: "The act was intentional but disputed",
      argument:
        "The charge sheet records an intentional killing and competing justifications.",
    },
    {
      title: "Safer alternatives are recorded as unused",
      argument:
        "The charge sheet records that no council or detention was attempted.",
    },
  ],
  conclusion: "On these facts the killing was justified.",
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

function successTransport(): OpenRouterChatCompletionResult {
  return {
    ok: true,
    content: JSON.stringify(validAdvocate),
    returnedModel: SAME_MODEL,
    providerCallId: "gen-success",
    generationId: null,
    usage: {
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      totalCost: "0",
    },
    durationMs: 50,
  };
}

function httpFailure(
  status: number,
  overrides?: Partial<
    Extract<OpenRouterChatCompletionResult, { ok: false }>
  >,
): OpenRouterChatCompletionResult {
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
    durationMs: 20,
    ...overrides,
  };
}

function transportFailure(
  errorType: (typeof OpenRouterTransportErrorType)[keyof typeof OpenRouterTransportErrorType],
  errorMessage: string,
  overrides?: Partial<
    Extract<OpenRouterChatCompletionResult, { ok: false }>
  >,
): OpenRouterChatCompletionResult {
  return {
    ok: false,
    errorType,
    errorMessage,
    httpStatus: null,
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
    durationMs: 20,
    ...overrides,
  };
}

type RecordedCall = {
  input: OpenRouterChatCompletionInput;
  attemptIndex: number;
};

async function runRetry(options: {
  responses: OpenRouterChatCompletionResult[];
  chargeSheetMarkdown?: string;
  runKind?: TribunalRunKind;
  role?: RepresentativeRole;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}) {
  const modelCalls = new MemoryModelCalls();
  const marked: string[] = [];
  const calls: RecordedCall[] = [];
  const delays: number[] = [];
  let attemptIndex = 0;

  const result = await executeRepresentativeWithRetry(
    {
      caseId: "case-retry",
      runId: "run-retry",
      runKind: options.runKind ?? TribunalRunKind.SAME_MODEL,
      role: options.role ?? RepresentativeRole.DEFENSE_1,
      chargeSheetMarkdown: options.chargeSheetMarkdown ?? "# Case\n\nFacts.",
      apiKey: "test-key",
    },
    {
      modelCalls,
      runs: {
        async markRunning(runId) {
          marked.push(runId);
        },
      },
      completeChat: async (input) => {
        const index = attemptIndex;
        attemptIndex += 1;
        calls.push({ input, attemptIndex: index });
        const response = options.responses[index];
        if (!response) {
          throw new Error(`Unexpected attempt ${index + 1}`);
        }
        return response;
      },
      sleep: async (ms) => {
        delays.push(ms);
        if (options.sleep) {
          await options.sleep(ms);
        }
      },
      now: options.now,
    },
  );

  return { result, modelCalls, marked, calls, delays };
}

describe("classifyRetry", () => {
  it("retries timeout, network, 429, 5xx, provider, and invalid output", () => {
    assert.deepEqual(classifyRetry({ errorType: AttemptErrorType.TIMEOUT }), {
      retryable: true,
      reason: RetryReason.TIMEOUT,
      delayMs: TRANSIENT_RETRY_DELAY_MS,
      usesOutputContractCorrection: false,
    });
    assert.deepEqual(classifyRetry({ errorType: AttemptErrorType.NETWORK }), {
      retryable: true,
      reason: RetryReason.NETWORK,
      delayMs: TRANSIENT_RETRY_DELAY_MS,
      usesOutputContractCorrection: false,
    });
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.HTTP_ERROR,
        httpStatus: 429,
        retryAfterHeader: "8",
      }).delayMs,
      8_000,
    );
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.HTTP_ERROR,
        httpStatus: 502,
      }).reason,
      RetryReason.TRANSIENT_HTTP_5XX,
    );
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.PROVIDER_RESPONSE_ERROR,
      }).retryable,
      true,
    );
    assert.equal(
      classifyRetry({ errorType: AttemptErrorType.MALFORMED_JSON }).delayMs,
      0,
    );
    assert.equal(
      classifyRetry({ errorType: AttemptErrorType.CONTRACT_VALIDATION })
        .usesOutputContractCorrection,
      true,
    );
    assert.equal(
      classifyRetry({ errorType: AttemptErrorType.INVALID_RESPONSE }).reason,
      RetryReason.INCOMPLETE_OUTPUT,
    );
  });

  it("does not retry 401, 403, other 4xx, or local configuration failures", () => {
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.HTTP_ERROR,
        httpStatus: 401,
      }).retryable,
      false,
    );
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.HTTP_ERROR,
        httpStatus: 403,
      }).retryable,
      false,
    );
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.HTTP_ERROR,
        httpStatus: 404,
      }).reason,
      RetryReason.PERMANENT_HTTP,
    );
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.HTTP_ERROR,
        httpStatus: 400,
      }).retryable,
      false,
    );
    assert.equal(
      classifyRetry({
        errorType: AttemptErrorType.INVALID_CONFIGURATION,
      }).retryable,
      false,
    );
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds, HTTP-date, and clamps absurd values", () => {
    assert.equal(parseRetryAfterMs("5"), 5_000);
    assert.equal(parseRetryAfterMs("3600"), MAX_RETRY_DELAY_MS);
    assert.equal(parseRetryAfterMs("not-a-header"), null);
    assert.equal(parseRetryAfterMs(""), null);

    const now = Date.parse("Wed, 26 Aug 2026 12:00:00 GMT");
    assert.equal(
      parseRetryAfterMs("Wed, 26 Aug 2026 12:00:10 GMT", { now: () => now }),
      10_000,
    );
    assert.equal(
      parseRetryAfterMs("Wed, 26 Aug 2026 14:00:00 GMT", { now: () => now }),
      MAX_RETRY_DELAY_MS,
    );
  });
});

describe("executeRepresentativeWithRetry", () => {
  it("succeeds on attempt 1 with exactly one request", async () => {
    const { result, modelCalls, marked, calls, delays } = await runRetry({
      responses: [successTransport()],
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.successfulAttempt, 1);
    assert.equal(result.attemptsMade, 1);
    assert.equal(calls.length, 1);
    assert.equal(modelCalls.records.length, 1);
    assert.equal(modelCalls.records[0]?.attempt, 1);
    assert.equal(modelCalls.records[0]?.status, ModelCallStatus.SUCCEEDED);
    assert.deepEqual(result.response, validAdvocate);
    assert.equal(result.model, SAME_MODEL);
    assert.deepEqual(marked, ["run-retry"]);
    assert.deepEqual(delays, []);
    assert.equal(result.retry.decided, false);
  });

  it("does not retry 401, 403, or permanent 4xx", async () => {
    for (const status of [401, 403, 404, 400]) {
      const { result, calls, modelCalls, delays } = await runRetry({
        responses: [httpFailure(status)],
      });
      assert.equal(result.ok, false, String(status));
      if (result.ok) {
        continue;
      }
      assert.equal(result.attemptsMade, 1, String(status));
      assert.equal(calls.length, 1, String(status));
      assert.equal(modelCalls.records.length, 1, String(status));
      assert.equal(modelCalls.records[0]?.attempt, 1, String(status));
      assert.deepEqual(delays, [], String(status));
      assert.equal(result.retry.decided, false, String(status));
    }
  });

  it("retries 429, 502, network, timeout, malformed JSON, contract failure, and provider errors then succeeds", async () => {
    const cases: Array<{
      label: string;
      first: OpenRouterChatCompletionResult;
      expectedReason: string;
      expectedDelay: number;
      expectsCorrection: boolean;
    }> = [
      {
        label: "429",
        first: httpFailure(429, { retryAfterHeader: "3" }),
        expectedReason: RetryReason.RATE_LIMIT,
        expectedDelay: 3_000,
        expectsCorrection: false,
      },
      {
        label: "502",
        first: httpFailure(502),
        expectedReason: RetryReason.TRANSIENT_HTTP_5XX,
        expectedDelay: TRANSIENT_RETRY_DELAY_MS,
        expectsCorrection: false,
      },
      {
        label: "network",
        first: transportFailure(
          OpenRouterTransportErrorType.NETWORK,
          "OpenRouter network request failed.",
        ),
        expectedReason: RetryReason.NETWORK,
        expectedDelay: TRANSIENT_RETRY_DELAY_MS,
        expectsCorrection: false,
      },
      {
        label: "timeout",
        first: transportFailure(
          OpenRouterTransportErrorType.TIMEOUT,
          "OpenRouter request timed out after 90ms.",
        ),
        expectedReason: RetryReason.TIMEOUT,
        expectedDelay: TRANSIENT_RETRY_DELAY_MS,
        expectsCorrection: false,
      },
      {
        label: "malformed",
        first: {
          ...successTransport(),
          content: "{not json",
        },
        expectedReason: RetryReason.MALFORMED_JSON,
        expectedDelay: 0,
        expectsCorrection: true,
      },
      {
        label: "contract",
        first: {
          ...successTransport(),
          content: JSON.stringify({ summary: "only" }),
        },
        expectedReason: RetryReason.CONTRACT_VALIDATION,
        expectedDelay: 0,
        expectsCorrection: true,
      },
      {
        label: "provider",
        first: transportFailure(
          OpenRouterTransportErrorType.PROVIDER_RESPONSE_ERROR,
          "Upstream error from Nvidia: Internal server error (code=502)",
          { httpStatus: 200 },
        ),
        expectedReason: RetryReason.PROVIDER_RESPONSE_ERROR,
        expectedDelay: RATE_LIMIT_DEFAULT_DELAY_MS,
        expectsCorrection: false,
      },
      {
        label: "incomplete",
        first: transportFailure(
          OpenRouterTransportErrorType.INVALID_RESPONSE,
          "OpenRouter response did not include assistant text",
          { httpStatus: 200 },
        ),
        expectedReason: RetryReason.INCOMPLETE_OUTPUT,
        expectedDelay: 0,
        expectsCorrection: true,
      },
    ];

    for (const example of cases) {
      const { result, calls, modelCalls, delays, marked } = await runRetry({
        responses: [example.first, successTransport()],
      });

      assert.equal(result.ok, true, example.label);
      if (!result.ok) {
        continue;
      }
      assert.equal(result.successfulAttempt, 2, example.label);
      assert.equal(result.attemptsMade, 2, example.label);
      assert.equal(calls.length, 2, example.label);
      assert.equal(modelCalls.records.length, 2, example.label);
      assert.equal(modelCalls.records[0]?.attempt, 1, example.label);
      assert.equal(modelCalls.records[1]?.attempt, 2, example.label);
      assert.equal(modelCalls.records[0]?.status, ModelCallStatus.FAILED, example.label);
      assert.equal(
        modelCalls.records[1]?.status,
        ModelCallStatus.SUCCEEDED,
        example.label,
      );
      assert.notEqual(
        modelCalls.records[0]?.id,
        modelCalls.records[1]?.id,
        example.label,
      );
      assert.equal(modelCalls.records[0]?.model, SAME_MODEL, example.label);
      assert.equal(modelCalls.records[1]?.model, SAME_MODEL, example.label);
      assert.equal(calls[0]?.input.model, SAME_MODEL, example.label);
      assert.equal(calls[1]?.input.model, SAME_MODEL, example.label);
      assert.equal(calls[0]?.input.model, calls[1]?.input.model, example.label);
      assert.deepEqual(marked, ["run-retry"], example.label);
      if (example.expectedDelay > 0) {
        assert.deepEqual(delays, [example.expectedDelay], example.label);
      } else {
        assert.deepEqual(delays, [], example.label);
      }
      assert.equal(result.retry.decided, true, example.label);
      assert.equal(result.retry.reason, example.expectedReason, example.label);
      assert.equal(result.retry.delayMs, example.expectedDelay, example.label);

      const firstSystem = calls[0]?.input.messages[0]?.content ?? "";
      const secondSystem = calls[1]?.input.messages[0]?.content ?? "";
      const firstUser = calls[0]?.input.messages[1]?.content ?? "";
      const secondUser = calls[1]?.input.messages[1]?.content ?? "";
      assert.equal(firstUser, secondUser, example.label);
      assert.match(firstSystem, /DEFENSE_1/, example.label);
      assert.match(secondSystem, /DEFENSE_1/, example.label);
      assert.match(firstSystem, /DEFENSE/, example.label);
      assert.equal(
        secondSystem.includes(OUTPUT_CONTRACT_CORRECTION),
        example.expectsCorrection,
        example.label,
      );
      assert.equal(secondSystem.includes("{not json"), false, example.label);
      assert.equal(
        Object.prototype.hasOwnProperty.call(calls[0]?.input, "models"),
        false,
        example.label,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(calls[1]?.input, "models"),
        false,
        example.label,
      );
    }
  });

  it("fails permanently after two 429s or two invalid outputs", async () => {
    const twice429 = await runRetry({
      responses: [
        httpFailure(429, { retryAfterHeader: "1" }),
        httpFailure(429, { retryAfterHeader: "1" }),
      ],
    });
    assert.equal(twice429.result.ok, false);
    if (!twice429.result.ok) {
      assert.equal(twice429.result.attemptsMade, 2);
      assert.equal(twice429.result.errorType, AttemptErrorType.HTTP_ERROR);
    }
    assert.equal(twice429.calls.length, 2);
    assert.equal(twice429.modelCalls.records.length, 2);
    assert.deepEqual(
      twice429.modelCalls.records.map((record) => record.attempt),
      [1, 2],
    );

    const twiceInvalid = await runRetry({
      responses: [
        { ...successTransport(), content: "{not json" },
        { ...successTransport(), content: "{not json" },
      ],
    });
    assert.equal(twiceInvalid.result.ok, false);
    if (!twiceInvalid.result.ok) {
      assert.equal(twiceInvalid.result.attemptsMade, 2);
      assert.equal(twiceInvalid.result.errorType, AttemptErrorType.MALFORMED_JSON);
    }
    assert.equal(twiceInvalid.calls.length, 2);
    assert.equal(twiceInvalid.modelCalls.records.length, 2);
  });

  it("does not create an audit row when local configuration fails before a request", async () => {
    const modelCalls = new MemoryModelCalls();
    const calls: OpenRouterChatCompletionInput[] = [];
    const result = await executeRepresentativeWithRetry(
      {
        caseId: "case-config",
        runId: "run-config",
        runKind: TribunalRunKind.SAME_MODEL,
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "   ",
        apiKey: "test-key",
      },
      {
        modelCalls,
        runs: { async markRunning() {} },
        completeChat: async (input) => {
          calls.push(input);
          return successTransport();
        },
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.attemptsMade, 0);
      assert.equal(result.errorType, AttemptErrorType.INVALID_CONFIGURATION);
      assert.deepEqual(result.attempts, []);
    }
    assert.equal(calls.length, 0);
    assert.equal(modelCalls.records.length, 0);
  });

  it("honors Retry-After and keeps the delay function testable", async () => {
    const slept: number[] = [];
    const { result, delays } = await runRetry({
      responses: [httpFailure(429, { retryAfterHeader: "7" }), successTransport()],
      sleep: async (ms) => {
        slept.push(ms);
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(delays, [7_000]);
    assert.deepEqual(slept, [7_000]);
    if (result.ok) {
      assert.equal(result.retry.delayMs, 7_000);
    }
  });

  it("caps absurd Retry-After values", async () => {
    const { delays, result } = await runRetry({
      responses: [
        httpFailure(429, { retryAfterHeader: "3600" }),
        successTransport(),
      ],
    });
    assert.deepEqual(delays, [MAX_RETRY_DELAY_MS]);
    if (result.ok) {
      assert.equal(result.retry.delayMs, MAX_RETRY_DELAY_MS);
    }
  });

  it("never issues a third attempt or switches models", async () => {
    const { result, calls, modelCalls } = await runRetry({
      responses: [httpFailure(502), httpFailure(502), successTransport()],
    });

    assert.equal(result.ok, false);
    assert.equal(calls.length, 2);
    assert.equal(modelCalls.records.length, 2);
    assert.deepEqual(
      modelCalls.records.map((record) => record.attempt),
      [1, 2],
    );
    assert.equal(
      calls.every((call) => call.input.model === SAME_MODEL),
      true,
    );
    assert.equal(
      calls.every((call) => call.input.output.mode === "JSON_SCHEMA"),
      true,
    );
  });
});
