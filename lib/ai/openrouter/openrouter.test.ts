import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAME_MODEL_ID } from "../configurations";
import { completeChat } from "./client";
import { parseOpenRouterHttpError } from "./http-error";
import {
  MissingOpenRouterApiKeyError,
  getOpenRouterApiKey,
  requireOpenRouterApiKey,
} from "./env";
import {
  OPENROUTER_ATTEMPT_TIMEOUT_MS,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OpenRouterOutputMode,
  OpenRouterTransportErrorType,
} from "./types";
import { mapOpenRouterUsage } from "./usage";

const MODEL = SAME_MODEL_ID;
const API_KEY = "test-openrouter-key";
const SCHEMA_OUTPUT = {
  mode: OpenRouterOutputMode.JSON_SCHEMA,
  jsonSchema: { name: "advocate_response", schema: {} },
} as const;

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

describe("OpenRouter env", () => {
  it("returns null when the server secret is missing", () => {
    assert.equal(getOpenRouterApiKey({}), null);
    assert.equal(getOpenRouterApiKey({ OPENROUTER_API_KEY: "   " }), null);
    assert.throws(() => requireOpenRouterApiKey({}), (error: unknown) => {
      assert.ok(error instanceof MissingOpenRouterApiKeyError);
      assert.match(error.message, /OPENROUTER_API_KEY is not configured/);
      assert.doesNotMatch(error.message, /sk-/);
      return true;
    });
  });

  it("reads a trimmed server-only key without exposing it in the helper name", () => {
    assert.equal(
      getOpenRouterApiKey({ OPENROUTER_API_KEY: "  secret-value  " }),
      "secret-value",
    );
  });
});

describe("mapOpenRouterUsage", () => {
  it("maps provider usage conservatively and leaves missing cost parts null", () => {
    assert.deepEqual(
      mapOpenRouterUsage({
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        cost: 0,
      }),
      {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
        totalCost: "0",
      },
    );
    assert.deepEqual(mapOpenRouterUsage(null), {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      totalCost: null,
    });
    assert.deepEqual(
      mapOpenRouterUsage({
        prompt_tokens: 1.5,
        completion_tokens: -1,
        total_tokens: "18",
      }),
      {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        totalCost: null,
      },
    );
  });
});

describe("completeChat", () => {
  it("posts a concrete model with JSON Schema and require_parameters", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: {
          mode: OpenRouterOutputMode.JSON_SCHEMA,
          jsonSchema: {
            name: "advocate_response",
            schema: { type: "object" },
          },
        },
      },
      {
        apiKey: API_KEY,
        fetchImpl: async (url, init) => {
          capturedUrl = String(url);
          capturedInit = init;
          return jsonResponse({
            id: "gen-1",
            model: MODEL,
            choices: [{ message: { role: "assistant", content: "{}" } }],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 2,
              total_tokens: 6,
              cost: 0,
            },
          });
        },
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(capturedUrl, OPENROUTER_CHAT_COMPLETIONS_URL);
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.model, MODEL);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.name, "advocate_response");
    assert.equal(body.provider.require_parameters, true);
    assert.equal("models" in body, false);
    assert.equal("usage" in body, false);
    assert.equal(JSON.stringify(body).includes("openrouter/free"), false);
    assert.equal(
      (capturedInit?.headers as Record<string, string>).Authorization,
      `Bearer ${API_KEY}`,
    );
    assert.equal(
      (capturedInit?.headers as Record<string, string>)["X-OpenRouter-Metadata"],
      "enabled",
    );
    assert.equal(result.providerCallId, "gen-1");
    assert.equal(result.generationId, null);
    assert.equal(result.usage.totalCost, "0");
    assert.equal(OPENROUTER_ATTEMPT_TIMEOUT_MS, 90_000);
  });

  it("sends json_object response_format without a schema", async () => {
    let capturedInit: RequestInit | undefined;
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: { mode: OpenRouterOutputMode.JSON_OBJECT },
      },
      {
        apiKey: API_KEY,
        fetchImpl: async (_url, init) => {
          capturedInit = init;
          return jsonResponse({
            id: "gen-json-object",
            model: MODEL,
            choices: [{ message: { role: "assistant", content: "{}" } }],
          });
        },
      },
    );

    assert.equal(result.ok, true);
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal(body.response_format.type, "json_object");
    assert.equal("json_schema" in (body.response_format ?? {}), false);
    assert.equal("provider" in body, false);
  });

  it("omits response_format for prompt-only requests", async () => {
    let capturedInit: RequestInit | undefined;
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: { mode: OpenRouterOutputMode.PROMPT_ONLY },
      },
      {
        apiKey: API_KEY,
        fetchImpl: async (_url, init) => {
          capturedInit = init;
          return jsonResponse({
            id: "gen-prompt-only",
            model: MODEL,
            choices: [{ message: { role: "assistant", content: "{}" } }],
          });
        },
      },
    );

    assert.equal(result.ok, true);
    const body = JSON.parse(String(capturedInit?.body));
    assert.equal("response_format" in body, false);
    assert.equal("provider" in body, false);
  });

  it("rejects the openrouter/free router before fetching", async () => {
    let called = false;
    await assert.rejects(
      () =>
        completeChat(
          {
            model: "openrouter/free",
            messages: [{ role: "user", content: "hello" }],
            output: SCHEMA_OUTPUT,
          },
          {
            apiKey: API_KEY,
            fetchImpl: async () => {
              called = true;
              return jsonResponse({});
            },
          },
        ),
      /concrete model ID/,
    );
    assert.equal(called, false);
  });

  it("classifies HTTP, timeout, and invalid responses", async () => {
    const http = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        fetchImpl: async () => jsonResponse({ error: { message: "no" } }, 401),
      },
    );
    assert.equal(http.ok, false);
    if (!http.ok) {
      assert.equal(http.errorType, OpenRouterTransportErrorType.HTTP_ERROR);
      assert.equal(http.httpStatus, 401);
      assert.match(http.errorMessage, /401/);
      assert.doesNotMatch(http.errorMessage, new RegExp(API_KEY));
    }

    const timeout = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        timeoutMs: 5,
        fetchImpl: async (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      },
    );
    assert.equal(timeout.ok, false);
    if (!timeout.ok) {
      assert.equal(timeout.errorType, OpenRouterTransportErrorType.TIMEOUT);
    }

    const invalid = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        fetchImpl: async () =>
          jsonResponse({
            id: "gen-empty",
            choices: [{ message: { role: "assistant" } }],
          }),
      },
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(
        invalid.errorType,
        OpenRouterTransportErrorType.INVALID_RESPONSE,
      );
      assert.equal(invalid.envelopeKind, "malformed");
      assert.match(invalid.errorMessage, /malformed or unexpected/);
      assert.equal(invalid.providerCallId, "gen-empty");
    }
  });

  it("classifies a 2xx choice error as a provider response failure", async () => {
    const secretKey = "sk-or-v1-choice-error-secret";
    const prompt = "SECRET_CHOICE_PROMPT charge sheet";
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: secretKey,
        fetchImpl: async () =>
          jsonResponse({
            id: "gen-choice-error",
            model: MODEL,
            choices: [
              {
                finish_reason: "error",
                native_finish_reason: "error",
                error: {
                  code: 429,
                  message: "Provider returned error Bearer sk-or-v1-choice-error-secret",
                  metadata: {
                    error_type: "rate_limit_exceeded",
                    provider_code: 429,
                    flagged_input: prompt,
                    reasoning: "do not persist this reasoning chain",
                  },
                },
                message: {
                  role: "assistant",
                  content: null,
                  reasoning: "hidden chain of thought that must not leak",
                },
              },
            ],
            usage: {
              prompt_tokens: 21,
              completion_tokens: 0,
              total_tokens: 21,
              cost: 0,
            },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(
      result.errorType,
      OpenRouterTransportErrorType.PROVIDER_RESPONSE_ERROR,
    );
    assert.notEqual(result.errorType, OpenRouterTransportErrorType.INVALID_RESPONSE);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.errorCode, "429");
    assert.equal(result.providerErrorType, "rate_limit_exceeded");
    assert.equal(result.providerCode, "429");
    assert.equal(result.finishReason, "error");
    assert.equal(result.nativeFinishReason, "error");
    assert.equal(result.content, null);
    assert.equal(result.providerCallId, "gen-choice-error");
    assert.equal(result.returnedModel, MODEL);
    assert.equal(result.usage.promptTokens, 21);
    assert.equal(result.usage.completionTokens, 0);
    assert.equal(result.usage.totalTokens, 21);
    assert.equal(result.usage.totalCost, "0");
    assert.match(result.errorMessage, /OpenRouter provider response error/);
    assert.match(result.errorMessage, /Provider returned error/);
    assert.match(result.errorMessage, /finish_reason=error/);
    assert.doesNotMatch(result.errorMessage, /did not include assistant text/);
    assert.doesNotMatch(result.errorMessage, /SECRET_CHOICE_PROMPT/);
    assert.doesNotMatch(result.errorMessage, /hidden chain of thought/);
    assert.doesNotMatch(result.errorMessage, /do not persist this reasoning/);
    assert.doesNotMatch(result.errorMessage, new RegExp(secretKey));
  });

  it("keeps 2xx null content without a choice error as INVALID_RESPONSE", async () => {
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        fetchImpl: async () =>
          jsonResponse({
            id: "gen-null-content",
            model: MODEL,
            choices: [
              {
                finish_reason: "stop",
                native_finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: null,
                  reasoning: "must not be used as the Tribunal response",
                },
              },
            ],
            usage: {
              prompt_tokens: 8,
              completion_tokens: 2,
              total_tokens: 10,
              cost: 0,
            },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorType, OpenRouterTransportErrorType.INVALID_RESPONSE);
    assert.equal(result.envelopeKind, "normal");
    assert.match(result.errorMessage, /did not include assistant text/);
    assert.doesNotMatch(result.errorMessage, /malformed or unexpected/);
    assert.equal(result.finishReason, "stop");
    assert.equal(result.nativeFinishReason, "stop");
    assert.equal(result.shape?.contentKind, "null");
    assert.equal(result.providerCallId, "gen-null-content");
    assert.equal(result.returnedModel, MODEL);
    assert.equal(result.usage.promptTokens, 8);
    assert.equal(result.usage.totalTokens, 10);
    assert.equal(result.usage.totalCost, "0");
    assert.doesNotMatch(result.errorMessage, /must not be used/);
  });

  it("classifies a top-level error inside HTTP 2xx as a provider response failure", async () => {
    const secretKey = "sk-or-v1-toplevel-2xx";
    const prompt = "SECRET_TOPLEVEL_PROMPT";
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: secretKey,
        fetchImpl: async () =>
          jsonResponse({
            error: {
              code: 502,
              message: "No providers available Bearer sk-or-v1-toplevel-2xx",
              metadata: {
                error_type: "provider_unavailable",
                provider_code: 502,
                flagged_input: prompt,
              },
            },
            openrouter_metadata: {
              requested: MODEL,
              strategy: "direct",
              attempt: 0,
              endpoints: {
                available: [{ provider: "NVIDIA", model: MODEL, selected: false }],
              },
            },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(
      result.errorType,
      OpenRouterTransportErrorType.PROVIDER_RESPONSE_ERROR,
    );
    assert.equal(result.envelopeKind, "top_level_error");
    assert.equal(result.httpStatus, 200);
    assert.equal(result.errorCode, "502");
    assert.equal(result.providerErrorType, "provider_unavailable");
    assert.match(result.errorMessage, /OpenRouter provider response error/);
    assert.doesNotMatch(result.errorMessage, /did not include assistant text/);
    assert.doesNotMatch(result.errorMessage, /SECRET_TOPLEVEL_PROMPT/);
    assert.doesNotMatch(result.errorMessage, new RegExp(secretKey));
    assert.equal(result.routing?.requestedModel, MODEL);
    assert.equal(result.routing?.strategy, "direct");
    assert.equal(result.content, null);
  });

  it("classifies a 2xx body without id/model/choices as a malformed envelope", async () => {
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "SECRET_MALFORMED_PROMPT" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        fetchImpl: async () =>
          new Response(JSON.stringify({ object: "unexpected", foo: true }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-generation-id": "gen-from-header",
            },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorType, OpenRouterTransportErrorType.INVALID_RESPONSE);
    assert.equal(result.envelopeKind, "malformed");
    assert.match(result.errorMessage, /malformed or unexpected/);
    assert.doesNotMatch(result.errorMessage, /did not include assistant text/);
    assert.equal(result.generationId, "gen-from-header");
    assert.equal(result.providerCallId, "gen-from-header");
    assert.equal(result.shape?.hasId, false);
    assert.equal(result.shape?.hasModel, false);
    assert.equal(result.shape?.hasChoices, false);
    assert.deepEqual(result.shape?.topLevelKeys, ["object", "foo"]);
    assert.doesNotMatch(result.errorMessage, /SECRET_MALFORMED_PROMPT/);
    assert.equal(result.content, null);
  });

  it("classifies an empty choices array as a malformed envelope", async () => {
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        fetchImpl: async () =>
          jsonResponse({
            id: "gen-empty-choices",
            model: MODEL,
            choices: [],
            usage: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3, cost: 0 },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorType, OpenRouterTransportErrorType.INVALID_RESPONSE);
    assert.equal(result.envelopeKind, "malformed");
    assert.match(result.errorMessage, /malformed or unexpected/);
    assert.equal(result.shape?.hasId, true);
    assert.equal(result.shape?.hasModel, true);
    assert.equal(result.shape?.hasChoices, true);
    assert.equal(result.shape?.choicesLength, 0);
    assert.equal(result.providerCallId, "gen-empty-choices");
    assert.equal(result.returnedModel, MODEL);
    assert.equal(result.usage.totalTokens, 3);
  });

  it("captures X-Generation-Id and safe OpenRouter routing metadata", async () => {
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "hello" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: API_KEY,
        fetchImpl: async () =>
          jsonResponse(
            {
              id: "gen-body-id",
              model: MODEL,
              choices: [{ message: { role: "assistant", content: "{}" } }],
              usage: {
                prompt_tokens: 4,
                completion_tokens: 2,
                total_tokens: 6,
                cost: 0,
              },
              openrouter_metadata: {
                requested: MODEL,
                strategy: "direct",
                region: "iad",
                summary: "available=1, selected=NVIDIA",
                attempt: 1,
                pipeline: [
                  {
                    type: "guardrail",
                    data: { patterns: ["ignore all previous instructions"] },
                  },
                ],
                endpoints: {
                  available: [
                    {
                      provider: "NVIDIA",
                      model: MODEL,
                      selected: true,
                    },
                  ],
                },
                attempts: [{ provider: "NVIDIA", model: MODEL, status: 200 }],
              },
            },
            200,
            { "x-generation-id": "gen-header-id" },
          ),
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.providerCallId, "gen-body-id");
    assert.equal(result.generationId, "gen-header-id");
    assert.equal(result.content, "{}");
  });

  it("extracts routing metadata on a failed 2xx without leaking pipeline or secrets", async () => {
    const secretKey = "sk-or-v1-routing-secret";
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: "SECRET_ROUTING_PROMPT" }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: secretKey,
        fetchImpl: async () =>
          jsonResponse({
            id: "gen-routing-fail",
            model: MODEL,
            choices: [
              {
                finish_reason: "error",
                native_finish_reason: "error",
                error: { code: 429, message: "Provider returned error" },
                message: {
                  role: "assistant",
                  content: null,
                  reasoning: "do not leak reasoning",
                },
              },
            ],
            openrouter_metadata: {
              requested: MODEL,
              strategy: "fallback",
              attempt: 2,
              endpoints: {
                available: [
                  { provider: "NVIDIA", model: MODEL, selected: true },
                ],
              },
              attempts: [
                { provider: "NVIDIA", model: MODEL, status: 429 },
                { provider: "Together", model: MODEL, status: 429 },
              ],
              pipeline: [
                {
                  data: {
                    flagged_input: "SECRET_ROUTING_PROMPT",
                    reasoning: "internal",
                  },
                },
              ],
            },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.envelopeKind, "normal");
    assert.equal(result.routing?.requestedModel, MODEL);
    assert.equal(result.routing?.strategy, "fallback");
    assert.equal(result.routing?.selectedProvider, "NVIDIA");
    assert.equal(result.routing?.selectedModel, MODEL);
    assert.equal(result.routing?.attemptCount, 2);
    assert.equal(result.routing?.attemptStatuses, "NVIDIA:429,Together:429");
    assert.match(result.errorMessage, /strategy=fallback/);
    assert.doesNotMatch(result.errorMessage, /SECRET_ROUTING_PROMPT/);
    assert.doesNotMatch(result.errorMessage, /do not leak reasoning/);
    assert.doesNotMatch(result.errorMessage, /internal/);
    assert.doesNotMatch(result.errorMessage, new RegExp(secretKey));
    assert.equal(result.shape?.messageKeys?.includes("reasoning"), true);
    assert.doesNotMatch(JSON.stringify(result.shape), /do not leak reasoning/);
  });

  it("parses a JSON OpenRouter HTTP error without leaking prompts or secrets", async () => {
    const secretKey = "sk-or-v1-super-secret-test-key";
    const prompt = "SECRET_PROMPT_DO_NOT_LEAK charge sheet facts";
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: secretKey,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 429,
                message: "Rate limit exceeded: Bearer sk-or-v1-super-secret-test-key",
                metadata: {
                  error_type: "rate_limit_exceeded",
                  provider_code: 429,
                  flagged_input: prompt,
                },
              },
            }),
            {
              status: 429,
              headers: {
                "content-type": "application/json",
                "retry-after": "12",
                "x-ratelimit-limit": "20",
                "x-ratelimit-remaining": "0",
              },
            },
          ),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorType, OpenRouterTransportErrorType.HTTP_ERROR);
    assert.equal(result.httpStatus, 429);
    assert.equal(result.retryAfterHeader, "12");
    assert.equal(result.errorCode, "429");
    assert.equal(result.providerErrorType, "rate_limit_exceeded");
    assert.equal(result.providerCode, "429");
    assert.match(result.errorMessage, /OpenRouter HTTP 429/);
    assert.match(result.errorMessage, /Rate limit exceeded/);
    assert.match(result.errorMessage, /error_type=rate_limit_exceeded/);
    assert.match(result.errorMessage, /retry_after=12/);
    assert.match(result.errorMessage, /ratelimit_remaining=0/);
    assert.doesNotMatch(result.errorMessage, /sk-or-v1-super-secret-test-key/);
    assert.doesNotMatch(result.errorMessage, /SECRET_PROMPT_DO_NOT_LEAK/);
    assert.doesNotMatch(result.errorMessage, new RegExp(secretKey));
    assert.equal(result.content, null);
  });

  it("keeps a non-JSON HTTP error as a short status message", async () => {
    const secretKey = "sk-or-v1-another-secret";
    const prompt = "another secret prompt body";
    const result = await completeChat(
      {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        output: SCHEMA_OUTPUT,
      },
      {
        apiKey: secretKey,
        fetchImpl: async () =>
          new Response("<html>upstream 429</html>", {
            status: 429,
            headers: { "content-type": "text/html" },
          }),
      },
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.errorType, OpenRouterTransportErrorType.HTTP_ERROR);
    assert.equal(result.httpStatus, 429);
    assert.equal(result.errorCode, null);
    assert.equal(result.providerErrorType, null);
    assert.equal(result.providerCode, null);
    assert.equal(result.errorMessage, "OpenRouter HTTP 429");
    assert.doesNotMatch(result.errorMessage, /upstream 429/);
    assert.doesNotMatch(result.errorMessage, /<html>/);
    assert.doesNotMatch(result.errorMessage, new RegExp(secretKey));
    assert.doesNotMatch(result.errorMessage, /another secret prompt body/);
  });
});

describe("parseOpenRouterHttpError", () => {
  it("does not copy untrusted metadata or secrets into the diagnostic message", () => {
    const detail = parseOpenRouterHttpError(429, {
      error: {
        code: 429,
        message: "Provider busy. Authorization: Bearer leaked-token",
        metadata: {
          error_type: "rate_limit_exceeded",
          provider_code: "provider-429",
          flagged_input: "full prompt text that must not leak",
          reasons: ["the accused killed the deceased"],
        },
      },
    });

    assert.equal(detail.errorCode, "429");
    assert.equal(detail.providerErrorType, "rate_limit_exceeded");
    assert.equal(detail.providerCode, "provider-429");
    assert.match(detail.errorMessage, /Provider busy/);
    assert.match(detail.errorMessage, /Bearer \[redacted\]/);
    assert.doesNotMatch(detail.errorMessage, /leaked-token/);
    assert.doesNotMatch(detail.errorMessage, /full prompt text/);
    assert.doesNotMatch(detail.errorMessage, /the accused killed/);
  });
});
