/**
 * Server-only OpenRouter Chat Completions transport.
 *
 * Isolated from prompt construction and model assignment.
 * The caller supplies a concrete model ID and already-built messages.
 */

export { completeChat } from "./client";
export { parseOpenRouterHttpError, readRetryAfterHeader } from "./http-error";
export type { OpenRouterHttpErrorDetail } from "./http-error";
export {
  formatInvalidResponseMessage,
  formatProviderResponseError,
  formatShapeSummary,
  hasProviderResponseError,
  parseOpenRouterCompletion,
  parseOpenRouterSafeHeaders,
} from "./parse-completion";
export type { ParsedOpenRouterCompletion } from "./parse-completion";
export {
  MissingOpenRouterApiKeyError,
  OPENROUTER_API_KEY_ENV,
  getOpenRouterApiKey,
  requireOpenRouterApiKey,
} from "./env";
export {
  OPENROUTER_ATTEMPT_TIMEOUT_MS,
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OpenRouterOutputMode,
  OpenRouterTransportErrorType,
} from "./types";
export type {
  OpenRouterChatCompletionFailure,
  OpenRouterChatCompletionInput,
  OpenRouterChatCompletionResult,
  OpenRouterChatCompletionSuccess,
  OpenRouterChatMessage,
  OpenRouterClientOptions,
  OpenRouterEnvelopeKind,
  OpenRouterJsonSchemaFormat,
  OpenRouterOutputStrategy,
  OpenRouterRoutingDiagnostics,
  OpenRouterShapeDiagnostics,
  OpenRouterUsage,
} from "./types";
export { EMPTY_OPENROUTER_USAGE, mapOpenRouterUsage } from "./usage";
