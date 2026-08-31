import {
  OPENROUTER_ATTEMPT_TIMEOUT_MS,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OpenRouterOutputMode,
  OpenRouterTransportErrorType,
  type OpenRouterChatCompletionInput,
  type OpenRouterChatCompletionResult,
  type OpenRouterClientOptions,
} from "./types";
import { parseOpenRouterHttpError, readRetryAfterHeader } from "./http-error";
import {
  formatInvalidResponseMessage,
  formatProviderResponseError,
  formatRoutingSummary,
  hasProviderResponseError,
  parseOpenRouterCompletion,
} from "./parse-completion";
import { EMPTY_OPENROUTER_USAGE } from "./usage";

const FORBIDDEN_ROUTER_ID = "openrouter/free";

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError" || name === "TimeoutError";
}

function failureFields() {
  return {
    retryAfterHeader: null as string | null,
    errorCode: null as string | null,
    providerErrorType: null as string | null,
    providerCode: null as string | null,
    finishReason: null as string | null,
    nativeFinishReason: null as string | null,
    envelopeKind: null,
    generationId: null as string | null,
    shape: null,
    routing: null,
  };
}

function buildRequestBody(
  input: OpenRouterChatCompletionInput,
  stream: boolean,
): string {
  if (input.model.trim() === FORBIDDEN_ROUTER_ID) {
    throw new Error("OpenRouter requests must use a concrete model ID.");
  }

  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
  };

  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }

  if (input.output.mode === OpenRouterOutputMode.JSON_SCHEMA) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: input.output.jsonSchema.name,
        strict: true,
        schema: input.output.jsonSchema.schema,
      },
    };
    body.provider = {
      require_parameters: true,
    };
  } else if (input.output.mode === OpenRouterOutputMode.JSON_OBJECT) {
    body.response_format = {
      type: "json_object",
    };
  }

  return JSON.stringify(body);
}

type StreamReadResult = {
  payload: unknown;
  content: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function streamPayloadWithContent(
  lastPayload: Record<string, unknown> | null,
  content: string,
): unknown {
  if (lastPayload?.error != null) {
    return lastPayload;
  }

  const lastChoice = Array.isArray(lastPayload?.choices)
    ? asRecord(lastPayload.choices[0])
    : null;
  return {
    ...(lastPayload ?? {}),
    choices: [
      {
        ...(lastChoice ?? {}),
        message: { role: "assistant", content },
      },
    ],
  };
}

/** Reads OpenAI-compatible SSE without retaining the raw stream anywhere. */
async function readStreamingCompletion(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<StreamReadResult> {
  if (!response.body) {
    return { payload: null, content: "" };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let content = "";
  let lastPayload: Record<string, unknown> | null = null;

  const consumeEvent = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return;
    }
    const record = asRecord(parsed);
    if (!record) {
      return;
    }
    lastPayload = record;
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const delta = asRecord(asRecord(choices[0])?.delta)?.content;
    if (typeof delta === "string" && delta.length > 0) {
      content += delta;
      onDelta(delta);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let separator = buffer.search(/\r?\n\r?\n/);
    while (separator >= 0) {
      const event = buffer.slice(0, separator);
      const separatorLength = buffer.startsWith("\r\n\r\n", separator)
        ? 4
        : 2;
      buffer = buffer.slice(separator + separatorLength);
      consumeEvent(event);
      separator = buffer.search(/\r?\n\r?\n/);
    }
    if (done) {
      break;
    }
  }
  if (buffer.trim().length > 0) {
    consumeEvent(buffer);
  }

  return {
    payload: streamPayloadWithContent(lastPayload, content),
    content,
  };
}

export async function completeChat(
  input: OpenRouterChatCompletionInput,
  options: OpenRouterClientOptions,
): Promise<OpenRouterChatCompletionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? OPENROUTER_ATTEMPT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const body = buildRequestBody(input, Boolean(options.onDelta));
  const startedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const duration = () => Math.max(0, now() - startedAt);

  try {
    const response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Metadata": "enabled",
      },
      body,
      signal: controller.signal,
    });

    let parsed: unknown = null;
    if (options.onDelta && response.ok) {
      parsed = (await readStreamingCompletion(response, options.onDelta)).payload;
    } else {
      const rawText = await response.text();
      if (rawText.length > 0) {
        try {
          parsed = JSON.parse(rawText) as unknown;
        } catch {
          parsed = null;
        }
      }
    }

    const completion = parseOpenRouterCompletion(parsed, response.headers);
    const providerError = completion.topLevelError.present
      ? completion.topLevelError
      : completion.choiceError;

    if (!response.ok) {
      const detail = parseOpenRouterHttpError(
        response.status,
        parsed,
        response.headers,
      );
      const identityExtras = [
        completion.generationId
          ? `generation_id=${completion.generationId}`
          : null,
        completion.providerCallId &&
        completion.providerCallId !== completion.generationId
          ? `provider_call_id=${completion.providerCallId}`
          : null,
        formatRoutingSummary(completion.routing),
      ].filter((part): part is string => part != null);
      return {
        ok: false,
        errorType: OpenRouterTransportErrorType.HTTP_ERROR,
        errorMessage:
          identityExtras.length > 0
            ? `${detail.errorMessage} (${identityExtras.join(", ")})`
            : detail.errorMessage,
        httpStatus: response.status,
        retryAfterHeader: readRetryAfterHeader(response.headers),
        errorCode: detail.errorCode,
        providerErrorType: detail.providerErrorType,
        providerCode: detail.providerCode,
        finishReason: completion.finishReason,
        nativeFinishReason: completion.nativeFinishReason,
        envelopeKind: completion.envelopeKind,
        generationId: completion.generationId,
        shape: completion.shape,
        routing: completion.routing,
        content: null,
        returnedModel: completion.returnedModel,
        providerCallId: completion.providerCallId,
        usage: completion.usage,
        durationMs: duration(),
      };
    }

    if (
      completion.envelopeKind === "top_level_error" ||
      hasProviderResponseError(completion)
    ) {
      return {
        ok: false,
        errorType: OpenRouterTransportErrorType.PROVIDER_RESPONSE_ERROR,
        errorMessage: formatProviderResponseError(completion),
        httpStatus: response.status,
        retryAfterHeader: readRetryAfterHeader(response.headers),
        errorCode: providerError.errorCode,
        providerErrorType: providerError.providerErrorType,
        providerCode: providerError.providerCode,
        finishReason: completion.finishReason,
        nativeFinishReason: completion.nativeFinishReason,
        envelopeKind: completion.envelopeKind,
        generationId: completion.generationId,
        shape: completion.shape,
        routing: completion.routing,
        content: null,
        returnedModel: completion.returnedModel,
        providerCallId: completion.providerCallId,
        usage: completion.usage,
        durationMs: duration(),
      };
    }

    if (completion.envelopeKind === "malformed" || completion.content == null) {
      return {
        ok: false,
        errorType: OpenRouterTransportErrorType.INVALID_RESPONSE,
        errorMessage: formatInvalidResponseMessage(completion),
        httpStatus: response.status,
        retryAfterHeader: readRetryAfterHeader(response.headers),
        errorCode: null,
        providerErrorType: null,
        providerCode: null,
        finishReason: completion.finishReason,
        nativeFinishReason: completion.nativeFinishReason,
        envelopeKind: completion.envelopeKind,
        generationId: completion.generationId,
        shape: completion.shape,
        routing: completion.routing,
        content: null,
        returnedModel: completion.returnedModel,
        providerCallId: completion.providerCallId,
        usage: completion.usage,
        durationMs: duration(),
      };
    }

    return {
      ok: true,
      content: completion.content,
      returnedModel: completion.returnedModel,
      providerCallId: completion.providerCallId,
      generationId: completion.generationId,
      usage: completion.usage,
      durationMs: duration(),
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        errorType: OpenRouterTransportErrorType.TIMEOUT,
        errorMessage: `OpenRouter request timed out after ${timeoutMs}ms.`,
        httpStatus: null,
        ...failureFields(),
        content: null,
        returnedModel: null,
        providerCallId: null,
        usage: { ...EMPTY_OPENROUTER_USAGE },
        durationMs: duration(),
      };
    }

    return {
      ok: false,
      errorType: OpenRouterTransportErrorType.NETWORK,
      errorMessage: "OpenRouter network request failed.",
      httpStatus: null,
      ...failureFields(),
      content: null,
      returnedModel: null,
      providerCallId: null,
      usage: { ...EMPTY_OPENROUTER_USAGE },
      durationMs: duration(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
