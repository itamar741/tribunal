import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { ModelOutputMode, TribunalRunKind } from "../configurations";
import {
  ADVOCATE_RESPONSE_JSON_SCHEMA_NAME,
  advocateResponseJsonSchema,
  advocateResponseSchema,
  type AdvocateResponse,
} from "../contracts";
import { getModelIdForRole } from "../configurations";
import {
  OpenRouterTransportErrorType,
  type OpenRouterChatCompletionInput,
  type OpenRouterChatCompletionResult,
} from "../openrouter";
import { RepresentativeRole } from "../profiles";
import {
  ModelCallAgentRole,
  ModelCallStage,
  ModelCallStatus,
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "../../model-calls";
import { executeRepresentativeAttempt } from "./execute-representative-attempt";
import { AttemptErrorType } from "./errors";
import { outputStrategyForModel } from "./output-strategy";
import { parseAdvocateResponse } from "./parse-advocate-response";

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

function successTransport(
  overrides?: Partial<
    Omit<Extract<OpenRouterChatCompletionResult, { ok: true }>, "ok">
  >,
): OpenRouterChatCompletionResult {
  return {
    ok: true,
    content: JSON.stringify(validAdvocate),
    returnedModel: "minimax/minimax-m3:free",
    providerCallId: "gen-success",
    generationId: null,
    usage: {
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      totalCost: "0",
    },
    durationMs: 1234,
    ...overrides,
  };
}

describe("advocateResponseJsonSchema", () => {
  it("is derived from the Advocate Zod contract", () => {
    const schema = advocateResponseJsonSchema();
    const properties = schema.properties as Record<string, unknown>;

    assert.equal(ADVOCATE_RESPONSE_JSON_SCHEMA_NAME, "advocate_response");
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["summary", "arguments", "conclusion"]);
    assert.equal("$schema" in schema, false);
    assert.ok(properties.summary);
    assert.ok(properties.arguments);
    assert.ok(properties.conclusion);
    assert.equal(advocateResponseSchema.safeParse(validAdvocate).success, true);
  });
});

describe("parseAdvocateResponse", () => {
  it("accepts contract-valid JSON and rejects malformed or extra-field payloads", () => {
    const ok = parseAdvocateResponse(JSON.stringify(validAdvocate));
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.value, validAdvocate);
    }

    const malformed = parseAdvocateResponse("not-json");
    assert.equal(malformed.ok, false);
    if (!malformed.ok) {
      assert.equal(malformed.errorType, AttemptErrorType.MALFORMED_JSON);
    }

    const invalid = parseAdvocateResponse(
      JSON.stringify({ ...validAdvocate, extra: true }),
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.errorType, AttemptErrorType.CONTRACT_VALIDATION);
    }
  });
});

describe("executeRepresentativeAttempt", () => {
  it("audits a successful DEFENSE_1 SAME_MODEL attempt without choosing a model", async () => {
    const modelCalls = new MemoryModelCalls();
    const marked: string[] = [];
    let captured: OpenRouterChatCompletionInput | undefined;

    const result = await executeRepresentativeAttempt(
      {
        caseId: "case-1",
        runId: "run-1",
        runKind: TribunalRunKind.SAME_MODEL,
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "# Case\n\nThe accused killed the deceased.",
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
          captured = input;
          return successTransport();
        },
      },
    );

    assert.deepEqual(marked, ["run-1"]);
    assert.equal(
      captured?.model,
      getModelIdForRole(TribunalRunKind.SAME_MODEL, RepresentativeRole.DEFENSE_1),
    );
    assert.equal(captured?.model, "minimax/minimax-m3:free");
    assert.equal(captured?.output.mode, "JSON_OBJECT");
    assert.equal("jsonSchema" in (captured?.output ?? {}), false);
    assert.equal(result.record.status, ModelCallStatus.SUCCEEDED);
    assert.equal(result.record.stage, ModelCallStage.ADVOCATES);
    assert.equal(result.record.agentRole, ModelCallAgentRole.DEFENSE_1);
    assert.equal(result.record.attempt, 1);
    assert.equal(result.record.model, "minimax/minimax-m3:free");
    assert.deepEqual(result.record.validatedResponse, validAdvocate);
    assert.equal(result.record.inputTokens, 100);
    assert.equal(result.record.outputTokens, 40);
    assert.equal(result.record.totalTokens, 140);
    assert.equal(result.record.inputCost, null);
    assert.equal(result.record.outputCost, null);
    assert.equal(result.record.totalCost, "0");
    assert.equal(result.record.durationMs, 1234);
    assert.equal(result.record.providerCallId, "gen-success");
    assert.equal(result.record.errorType, null);
    assert.deepEqual(result.response, validAdvocate);
    assert.equal(modelCalls.records.length, 1);
  });

  it("persists failed attempts with null validated_response", async () => {
    const cases: Array<{
      label: string;
      transport: OpenRouterChatCompletionResult;
      errorType: string;
    }> = [
      {
        label: "http",
        transport: {
          ok: false,
          errorType: OpenRouterTransportErrorType.HTTP_ERROR,
          errorMessage: "OpenRouter HTTP 500",
          httpStatus: 500,
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
          providerCallId: "gen-fail",
          usage: {
            promptTokens: 3,
            completionTokens: null,
            totalTokens: null,
            totalCost: null,
          },
          durationMs: 50,
        },
        errorType: AttemptErrorType.HTTP_ERROR,
      },
      {
        label: "malformed",
        transport: successTransport({ content: "{not json" }),
        errorType: AttemptErrorType.MALFORMED_JSON,
      },
      {
        label: "contract",
        transport: successTransport({
          content: JSON.stringify({ summary: "only" }),
        }),
        errorType: AttemptErrorType.CONTRACT_VALIDATION,
      },
      {
        label: "timeout",
        transport: {
          ok: false,
          errorType: OpenRouterTransportErrorType.TIMEOUT,
          errorMessage: "OpenRouter request timed out after 90ms.",
          httpStatus: null,
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
          durationMs: 90,
        },
        errorType: AttemptErrorType.TIMEOUT,
      },
      {
        label: "provider-response",
        transport: {
          ok: false,
          errorType: OpenRouterTransportErrorType.PROVIDER_RESPONSE_ERROR,
          errorMessage:
            "OpenRouter provider response error: Provider returned error (code=429, finish_reason=error)",
          httpStatus: 200,
          errorCode: "429",
          providerErrorType: null,
          providerCode: null,
          finishReason: "error",
          nativeFinishReason: "stop",
          envelopeKind: "normal",
          generationId: null,
          shape: null,
          routing: null,
          content: null,
          returnedModel: "minimax/minimax-m3:free",
          providerCallId: "gen-choice-error",
          usage: {
            promptTokens: 11,
            completionTokens: 0,
            totalTokens: 11,
            totalCost: "0",
          },
          durationMs: 640,
        },
        errorType: AttemptErrorType.PROVIDER_RESPONSE_ERROR,
      },
    ];

    for (const example of cases) {
      const modelCalls = new MemoryModelCalls();
      const result = await executeRepresentativeAttempt(
        {
          caseId: `case-${example.label}`,
          runId: `run-${example.label}`,
          runKind: TribunalRunKind.SAME_MODEL,
          role: RepresentativeRole.DEFENSE_1,
          chargeSheetMarkdown: "# Case\n\nFacts.",
          apiKey: "test-key",
        },
        {
          modelCalls,
          runs: { async markRunning() {} },
          completeChat: async () => example.transport,
        },
      );

      assert.equal(result.record.status, ModelCallStatus.FAILED, example.label);
      assert.equal(result.record.validatedResponse, null, example.label);
      assert.equal(result.response, null, example.label);
      assert.equal(result.record.errorType, example.errorType, example.label);
      assert.equal(modelCalls.records.length, 1, example.label);
      if (example.label === "provider-response" && !example.transport.ok) {
        assert.equal(result.record.providerCallId, "gen-choice-error");
        assert.equal(result.record.inputTokens, 11);
        assert.equal(result.record.outputTokens, 0);
        assert.equal(result.record.totalTokens, 11);
        assert.equal(result.record.totalCost, "0");
        assert.equal(
          result.returnedModel,
          "minimax/minimax-m3:free",
        );
      }
    }
  });

  it("skips markRunning when the caller owns run lifecycle", async () => {
    const marked: string[] = [];
    await executeRepresentativeAttempt(
      {
        caseId: "case-skip-running",
        runId: "run-skip-running",
        runKind: TribunalRunKind.SAME_MODEL,
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        apiKey: "test-key",
      },
      {
        modelCalls: new MemoryModelCalls(),
        runs: {
          async markRunning(runId) {
            marked.push(runId);
          },
        },
        skipMarkRunning: true,
        completeChat: async () => successTransport(),
      },
    );
    assert.deepEqual(marked, []);
  });

  it("does not mark the run running again on attempt 2", async () => {
    const marked: string[] = [];
    await executeRepresentativeAttempt(
      {
        caseId: "case-attempt-2",
        runId: "run-attempt-2",
        runKind: TribunalRunKind.SAME_MODEL,
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        attempt: 2,
        apiKey: "test-key",
      },
      {
        modelCalls: new MemoryModelCalls(),
        runs: {
          async markRunning(runId) {
            marked.push(runId);
          },
        },
        completeChat: async () => successTransport(),
      },
    );
    assert.deepEqual(marked, []);
  });

  it("does not call transport until after markRunning", async () => {
    const order: string[] = [];
    await executeRepresentativeAttempt(
      {
        caseId: "case-order",
        runId: "run-order",
        runKind: TribunalRunKind.SAME_MODEL,
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        apiKey: "test-key",
      },
      {
        modelCalls: new MemoryModelCalls(),
        runs: {
          async markRunning() {
            order.push("running");
          },
        },
        completeChat: async () => {
          order.push("transport");
          return successTransport();
        },
      },
    );
    assert.deepEqual(order, ["running", "transport"]);
  });

  it("derives PROMPT_ONLY for MIXED DEFENSE_1 and still fails closed on bad JSON", async () => {
    let captured: OpenRouterChatCompletionInput | undefined;
    const result = await executeRepresentativeAttempt(
      {
        caseId: "case-prompt-only",
        runId: "run-prompt-only",
        runKind: TribunalRunKind.MIXED_MODELS,
        role: RepresentativeRole.DEFENSE_1,
        chargeSheetMarkdown: "# Case\n\nFacts.",
        apiKey: "test-key",
      },
      {
        modelCalls: new MemoryModelCalls(),
        runs: { async markRunning() {} },
        completeChat: async (input) => {
          captured = input;
          return successTransport({ content: "{not json" });
        },
      },
    );
    assert.equal(captured?.model, "nvidia/nemotron-3.5-lightning:free");
    assert.equal(captured?.output.mode, ModelOutputMode.PROMPT_ONLY);
    assert.equal(result.record.status, ModelCallStatus.FAILED);
    assert.equal(result.record.errorType, AttemptErrorType.MALFORMED_JSON);
    assert.equal(result.record.validatedResponse, null);
  });
});

describe("outputStrategyForModel", () => {
  const schema = {
    name: ADVOCATE_RESPONSE_JSON_SCHEMA_NAME,
    schema: advocateResponseJsonSchema(),
  };

  it("maps configured models to explicit request strategies", () => {
    assert.deepEqual(outputStrategyForModel("z-ai/glm-5.2:free", schema), {
      mode: "JSON_SCHEMA",
      jsonSchema: schema,
    });
    assert.deepEqual(outputStrategyForModel("minimax/minimax-m3:free", schema), {
      mode: "JSON_OBJECT",
    });
    assert.deepEqual(
      outputStrategyForModel("nvidia/nemotron-3.5-lightning:free", schema),
      { mode: "PROMPT_ONLY" },
    );
  });
});
