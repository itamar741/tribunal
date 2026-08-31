export const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/** Settled per-attempt timeout. Runtime retry is not implemented here. */
export const OPENROUTER_ATTEMPT_TIMEOUT_MS = 90_000;

export const OpenRouterTransportErrorType = {
  TIMEOUT: "TIMEOUT",
  NETWORK: "NETWORK",
  HTTP_ERROR: "HTTP_ERROR",
  PROVIDER_RESPONSE_ERROR: "PROVIDER_RESPONSE_ERROR",
  INVALID_RESPONSE: "INVALID_RESPONSE",
} as const;

export type OpenRouterTransportErrorType =
  (typeof OpenRouterTransportErrorType)[keyof typeof OpenRouterTransportErrorType];

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterJsonSchemaFormat = {
  name: string;
  schema: Record<string, unknown>;
};

export const OpenRouterOutputMode = {
  JSON_SCHEMA: "JSON_SCHEMA",
  JSON_OBJECT: "JSON_OBJECT",
  PROMPT_ONLY: "PROMPT_ONLY",
} as const;

export type OpenRouterOutputMode =
  (typeof OpenRouterOutputMode)[keyof typeof OpenRouterOutputMode];

export type OpenRouterOutputStrategy =
  | {
      mode: typeof OpenRouterOutputMode.JSON_SCHEMA;
      jsonSchema: OpenRouterJsonSchemaFormat;
    }
  | { mode: typeof OpenRouterOutputMode.JSON_OBJECT }
  | { mode: typeof OpenRouterOutputMode.PROMPT_ONLY };

export type OpenRouterUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  totalCost: string | null;
};

export type OpenRouterChatCompletionInput = {
  model: string;
  messages: readonly OpenRouterChatMessage[];
  output: OpenRouterOutputStrategy;
};

export type OpenRouterEnvelopeKind = "normal" | "top_level_error" | "malformed";

export type OpenRouterShapeDiagnostics = {
  parsedJson: boolean;
  topLevelKeys: string[];
  hasId: boolean;
  hasModel: boolean;
  hasUsage: boolean;
  hasTopLevelError: boolean;
  hasChoices: boolean;
  choicesLength: number | null;
  firstChoiceKeys: string[] | null;
  hasMessage: boolean;
  messageKeys: string[] | null;
  contentKind: "absent" | "null" | "string" | "empty" | "other";
  finishReason: string | null;
  nativeFinishReason: string | null;
  contentType: string | null;
};

export type OpenRouterRoutingDiagnostics = {
  requestedModel: string | null;
  strategy: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  attemptCount: number | null;
  attemptStatuses: string | null;
};

export type OpenRouterChatCompletionSuccess = {
  ok: true;
  content: string;
  returnedModel: string | null;
  providerCallId: string | null;
  generationId: string | null;
  usage: OpenRouterUsage;
  durationMs: number;
};

export type OpenRouterChatCompletionFailure = {
  ok: false;
  errorType: OpenRouterTransportErrorType;
  errorMessage: string;
  httpStatus: number | null;
  retryAfterHeader?: string | null;
  errorCode: string | null;
  providerErrorType: string | null;
  providerCode: string | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  envelopeKind: OpenRouterEnvelopeKind | null;
  generationId: string | null;
  shape: OpenRouterShapeDiagnostics | null;
  routing: OpenRouterRoutingDiagnostics | null;
  content: string | null;
  returnedModel: string | null;
  providerCallId: string | null;
  usage: OpenRouterUsage;
  durationMs: number;
};

export type OpenRouterChatCompletionResult =
  | OpenRouterChatCompletionSuccess
  | OpenRouterChatCompletionFailure;

export type OpenRouterClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  /**
   * Receives transient text from a streaming provider response. Callers must
   * treat it as unvalidated: it is never persisted by this transport.
   */
  onDelta?: (delta: string) => void;
};
