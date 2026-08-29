import {
  parseOpenRouterErrorObject,
  readSafeToken,
  type OpenRouterErrorObject,
} from "./http-error";
import type {
  OpenRouterEnvelopeKind,
  OpenRouterRoutingDiagnostics,
  OpenRouterShapeDiagnostics,
  OpenRouterUsage,
} from "./types";
import { mapOpenRouterUsage } from "./usage";

export type { OpenRouterEnvelopeKind, OpenRouterRoutingDiagnostics, OpenRouterShapeDiagnostics };

export type OpenRouterSafeHeaders = {
  generationId: string | null;
  retryAfter: string | null;
  rateLimitLimit: string | null;
  rateLimitRemaining: string | null;
  rateLimitReset: string | null;
  contentType: string | null;
};

export type ParsedOpenRouterChoiceError = OpenRouterErrorObject & {
  present: boolean;
};

export type ParsedOpenRouterCompletion = {
  envelopeKind: OpenRouterEnvelopeKind;
  providerCallId: string | null;
  returnedModel: string | null;
  usage: OpenRouterUsage;
  content: string | null;
  messageRole: string | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  choiceError: ParsedOpenRouterChoiceError;
  topLevelError: ParsedOpenRouterChoiceError;
  shape: OpenRouterShapeDiagnostics;
  routing: OpenRouterRoutingDiagnostics | null;
  generationId: string | null;
};

const MAX_IDENTITY_LENGTH = 200;
const MAX_KEY_COUNT = 16;
const MAX_KEY_LENGTH = 40;
const MAX_ATTEMPT_STATUSES = 8;

function looksSensitiveIdentity(value: string): boolean {
  return /bearer\s+\S+|sk-[A-Za-z0-9_-]+|OPENROUTER_API_KEY/i.test(value);
}

function readIdentity(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_IDENTITY_LENGTH) {
    return null;
  }
  if (looksSensitiveIdentity(trimmed)) {
    return null;
  }
  return trimmed;
}

function readNonEmptyContent(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readSafeKeys(value: unknown): string[] {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    .filter((key) => key.length <= MAX_KEY_LENGTH)
    .filter((key) => !looksSensitiveIdentity(key))
    .slice(0, MAX_KEY_COUNT);
}

function contentKindOf(
  message: Record<string, unknown> | null,
): OpenRouterShapeDiagnostics["contentKind"] {
  if (!message || !("content" in message)) {
    return "absent";
  }
  const content = message.content;
  if (content === null) {
    return "null";
  }
  if (typeof content === "string") {
    return content.trim().length > 0 ? "string" : "empty";
  }
  return "other";
}

function readFirstChoice(parsed: unknown): Record<string, unknown> | null {
  if (parsed == null || typeof parsed !== "object") {
    return null;
  }
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const choice = choices[0];
  if (choice == null || typeof choice !== "object" || Array.isArray(choice)) {
    return null;
  }
  return choice as Record<string, unknown>;
}

function readMessageRecord(
  choice: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!choice || choice.message == null || typeof choice.message !== "object") {
    return null;
  }
  return choice.message as Record<string, unknown>;
}

function emptyError(): ParsedOpenRouterChoiceError {
  return {
    present: false,
    errorCode: null,
    message: null,
    providerErrorType: null,
    providerCode: null,
    providerName: null,
    upstreamRaw: null,
  };
}

function presentError(error: unknown): ParsedOpenRouterChoiceError {
  return {
    present: true,
    ...parseOpenRouterErrorObject(error),
  };
}

function isUsableIdentity(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function classifyEnvelope(
  record: Record<string, unknown> | null,
  choice: Record<string, unknown> | null,
  topLevelErrorPresent: boolean,
): OpenRouterEnvelopeKind {
  if (topLevelErrorPresent) {
    return "top_level_error";
  }
  if (
    record &&
    isUsableIdentity(record.id) &&
    isUsableIdentity(record.model) &&
    Array.isArray(record.choices) &&
    record.choices.length > 0 &&
    choice != null
  ) {
    return "normal";
  }
  return "malformed";
}

export function parseOpenRouterSafeHeaders(
  headers?: Headers,
): OpenRouterSafeHeaders {
  if (!headers) {
    return {
      generationId: null,
      retryAfter: null,
      rateLimitLimit: null,
      rateLimitRemaining: null,
      rateLimitReset: null,
      contentType: null,
    };
  }
  return {
    generationId: readIdentity(headers.get("x-generation-id")),
    retryAfter: readSafeToken(headers.get("retry-after")),
    rateLimitLimit: readSafeToken(headers.get("x-ratelimit-limit")),
    rateLimitRemaining: readSafeToken(headers.get("x-ratelimit-remaining")),
    rateLimitReset: readSafeToken(headers.get("x-ratelimit-reset")),
    contentType: readSafeToken(headers.get("content-type")),
  };
}

function parseRoutingMetadata(
  value: unknown,
): OpenRouterRoutingDiagnostics | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const endpoints =
    record.endpoints != null && typeof record.endpoints === "object"
      ? (record.endpoints as Record<string, unknown>)
      : null;
  const available = Array.isArray(endpoints?.available)
    ? endpoints.available
    : [];
  const selected = available.find((item) => {
    return (
      item != null &&
      typeof item === "object" &&
      (item as { selected?: unknown }).selected === true
    );
  }) as { provider?: unknown; model?: unknown } | undefined;

  const attempts = Array.isArray(record.attempts) ? record.attempts : [];
  const attemptStatuses = attempts
    .slice(0, MAX_ATTEMPT_STATUSES)
    .map((item) => {
      if (item == null || typeof item !== "object") {
        return null;
      }
      const attempt = item as Record<string, unknown>;
      const provider = readIdentity(attempt.provider) ?? "unknown";
      const status = readSafeToken(attempt.status) ?? "unknown";
      return `${provider}:${status}`;
    })
    .filter((part): part is string => part != null);

  const attemptCount =
    typeof record.attempt === "number" && Number.isInteger(record.attempt)
      ? record.attempt
      : attempts.length > 0
        ? attempts.length
        : null;

  return {
    requestedModel: readIdentity(record.requested),
    strategy: readSafeToken(record.strategy),
    selectedProvider: selected ? readIdentity(selected.provider) : null,
    selectedModel: selected ? readIdentity(selected.model) : null,
    attemptCount,
    attemptStatuses:
      attemptStatuses.length > 0 ? attemptStatuses.join(",") : null,
  };
}

export function formatRoutingSummary(
  routing: OpenRouterRoutingDiagnostics | null,
): string | null {
  if (!routing) {
    return null;
  }
  const parts = [
    routing.requestedModel ? `requested=${routing.requestedModel}` : null,
    routing.strategy ? `strategy=${routing.strategy}` : null,
    routing.selectedProvider
      ? `selected_provider=${routing.selectedProvider}`
      : null,
    routing.selectedModel ? `selected_model=${routing.selectedModel}` : null,
    routing.attemptCount != null ? `attempts=${routing.attemptCount}` : null,
    routing.attemptStatuses
      ? `attempt_statuses=${routing.attemptStatuses}`
      : null,
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function formatShapeSummary(shape: OpenRouterShapeDiagnostics): string {
  return [
    `has_id=${shape.hasId}`,
    `has_model=${shape.hasModel}`,
    `has_usage=${shape.hasUsage}`,
    `has_error=${shape.hasTopLevelError}`,
    `has_choices=${shape.hasChoices}`,
    `choices_length=${shape.choicesLength ?? "null"}`,
    `has_message=${shape.hasMessage}`,
    `content=${shape.contentKind}`,
    shape.finishReason ? `finish_reason=${shape.finishReason}` : null,
    shape.nativeFinishReason
      ? `native_finish_reason=${shape.nativeFinishReason}`
      : null,
    shape.contentType ? `content_type=${shape.contentType}` : null,
    shape.topLevelKeys.length > 0
      ? `top_level_keys=${shape.topLevelKeys.join(",")}`
      : "top_level_keys=none",
    shape.firstChoiceKeys && shape.firstChoiceKeys.length > 0
      ? `choice_keys=${shape.firstChoiceKeys.join(",")}`
      : null,
    shape.messageKeys && shape.messageKeys.length > 0
      ? `message_keys=${shape.messageKeys.join(",")}`
      : null,
  ]
    .filter((part): part is string => part != null)
    .join(", ");
}

export function parseOpenRouterCompletion(
  parsed: unknown,
  headers?: Headers,
): ParsedOpenRouterCompletion {
  const safeHeaders = parseOpenRouterSafeHeaders(headers);
  const object = parsed != null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
  const choice = readFirstChoice(parsed);
  const message = readMessageRecord(choice);
  const topLevelErrorPresent = Boolean(object && object.error != null);
  const choiceErrorPresent = Boolean(choice && choice.error != null);
  const envelopeKind = classifyEnvelope(object, choice, topLevelErrorPresent);
  const choices = object && Array.isArray(object.choices) ? object.choices : null;

  const completion: ParsedOpenRouterCompletion = {
    envelopeKind,
    providerCallId:
      (object ? readIdentity(object.id) : null) ?? safeHeaders.generationId,
    returnedModel: object ? readIdentity(object.model) : null,
    usage: mapOpenRouterUsage(object?.usage),
    content: readNonEmptyContent(message?.content),
    messageRole: message ? readSafeToken(message.role) : null,
    finishReason: choice ? readSafeToken(choice.finish_reason) : null,
    nativeFinishReason: choice
      ? readSafeToken(choice.native_finish_reason)
      : null,
    choiceError: choiceErrorPresent
      ? presentError(choice?.error)
      : emptyError(),
    topLevelError: topLevelErrorPresent
      ? presentError(object?.error)
      : emptyError(),
    shape: {
      parsedJson: object != null,
      topLevelKeys: readSafeKeys(object),
      hasId: Boolean(object && "id" in object),
      hasModel: Boolean(object && "model" in object),
      hasUsage: Boolean(object && "usage" in object),
      hasTopLevelError: topLevelErrorPresent,
      hasChoices: Boolean(object && "choices" in object),
      choicesLength: Array.isArray(choices) ? choices.length : null,
      firstChoiceKeys: choice ? readSafeKeys(choice) : null,
      hasMessage: message != null,
      messageKeys: message ? readSafeKeys(message) : null,
      contentKind: contentKindOf(message),
      finishReason: choice ? readSafeToken(choice.finish_reason) : null,
      nativeFinishReason: choice
        ? readSafeToken(choice.native_finish_reason)
        : null,
      contentType: safeHeaders.contentType,
    },
    routing: parseRoutingMetadata(object?.openrouter_metadata),
    generationId: safeHeaders.generationId,
  };
  return completion;
}

export function hasProviderResponseError(
  completion: ParsedOpenRouterCompletion,
): boolean {
  return (
    completion.topLevelError.present ||
    completion.choiceError.present ||
    completion.finishReason === "error" ||
    completion.nativeFinishReason === "error"
  );
}

export function formatProviderResponseError(
  completion: ParsedOpenRouterCompletion,
): string {
  const source = completion.topLevelError.present
    ? completion.topLevelError
    : completion.choiceError;
  const extras = [
    source.errorCode ? `code=${source.errorCode}` : null,
    source.providerErrorType ? `error_type=${source.providerErrorType}` : null,
    source.providerCode ? `provider_code=${source.providerCode}` : null,
    source.providerName ? `provider=${source.providerName}` : null,
    source.upstreamRaw ? `raw=${source.upstreamRaw}` : null,
    completion.finishReason
      ? `finish_reason=${completion.finishReason}`
      : null,
    completion.nativeFinishReason
      ? `native_finish_reason=${completion.nativeFinishReason}`
      : null,
    formatRoutingSummary(completion.routing),
  ].filter((part): part is string => part != null);

  const message = source.message;
  return [
    message
      ? `OpenRouter provider response error: ${message}`
      : "OpenRouter provider response error",
    extras.length > 0 ? `(${extras.join(", ")})` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatInvalidResponseMessage(
  completion: ParsedOpenRouterCompletion,
): string {
  const prefix =
    completion.envelopeKind === "malformed"
      ? "OpenRouter response envelope was malformed or unexpected"
      : "OpenRouter response did not include assistant text";
  return `${prefix} (${formatShapeSummary(completion.shape)})`;
}
