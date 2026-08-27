const MAX_SAFE_MESSAGE_LENGTH = 240;
const MAX_SAFE_TOKEN_LENGTH = 80;

export type OpenRouterHttpErrorDetail = {
  errorMessage: string;
  errorCode: string | null;
  providerErrorType: string | null;
  providerCode: string | null;
};

function looksSensitive(value: string): boolean {
  return /bearer\s+\S+|sk-[A-Za-z0-9_-]+|OPENROUTER_API_KEY|api[_-]?key/i.test(
    value,
  );
}

export function sanitizeOpenRouterErrorText(value: string): string {
  let text = value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bOPENROUTER_API_KEY\b/g, "[redacted]");
  if (text.length > MAX_SAFE_MESSAGE_LENGTH) {
    text = `${text.slice(0, MAX_SAFE_MESSAGE_LENGTH)}…`;
  }
  return text;
}

export function readSafeToken(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SAFE_TOKEN_LENGTH) {
    return null;
  }
  if (looksSensitive(trimmed)) {
    return null;
  }
  return trimmed;
}

export function readSafeMessage(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return sanitizeOpenRouterErrorText(value.trim());
}

export function readWhitelistedMetadata(metadata: unknown): {
  providerErrorType: string | null;
  providerCode: string | null;
} {
  if (metadata == null || typeof metadata !== "object") {
    return { providerErrorType: null, providerCode: null };
  }
  const record = metadata as Record<string, unknown>;
  return {
    providerErrorType: readSafeToken(record.error_type),
    providerCode: readSafeToken(record.provider_code),
  };
}

export function readRetryAfterHeader(headers?: Headers): string | null {
  if (!headers) {
    return null;
  }
  return readSafeToken(headers.get("retry-after"));
}

function readRateLimitHint(headers?: Headers): string | null {
  if (!headers) {
    return null;
  }
  const parts: string[] = [];
  const retryAfter = readSafeToken(headers.get("retry-after"));
  const remaining = readSafeToken(headers.get("x-ratelimit-remaining"));
  const limit = readSafeToken(headers.get("x-ratelimit-limit"));
  const reset = readSafeToken(headers.get("x-ratelimit-reset"));
  if (retryAfter) {
    parts.push(`retry_after=${retryAfter}`);
  }
  if (remaining) {
    parts.push(`ratelimit_remaining=${remaining}`);
  }
  if (limit) {
    parts.push(`ratelimit_limit=${limit}`);
  }
  if (reset) {
    parts.push(`ratelimit_reset=${reset}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

export type OpenRouterErrorObject = {
  errorCode: string | null;
  message: string | null;
  providerErrorType: string | null;
  providerCode: string | null;
};

export function parseOpenRouterErrorObject(
  error: unknown,
): OpenRouterErrorObject {
  if (typeof error === "string") {
    return {
      errorCode: null,
      message: readSafeMessage(error),
      providerErrorType: null,
      providerCode: null,
    };
  }
  if (error == null || typeof error !== "object") {
    return {
      errorCode: null,
      message: null,
      providerErrorType: null,
      providerCode: null,
    };
  }

  const record = error as Record<string, unknown>;
  const { providerErrorType, providerCode } = readWhitelistedMetadata(
    record.metadata,
  );
  return {
    errorCode: readSafeToken(record.code),
    message: readSafeMessage(record.message),
    providerErrorType,
    providerCode,
  };
}

export function parseOpenRouterHttpError(
  status: number,
  parsed: unknown,
  headers?: Headers,
): OpenRouterHttpErrorDetail {
  const fallbackMessage = `OpenRouter HTTP ${status}`;
  if (parsed == null || typeof parsed !== "object") {
    const hint = readRateLimitHint(headers);
    return {
      errorMessage: hint ? `${fallbackMessage} (${hint})` : fallbackMessage,
      errorCode: null,
      providerErrorType: null,
      providerCode: null,
    };
  }

  const error = (parsed as { error?: unknown }).error;
  if (error == null || typeof error !== "object") {
    const hint = readRateLimitHint(headers);
    return {
      errorMessage: hint ? `${fallbackMessage} (${hint})` : fallbackMessage,
      errorCode: null,
      providerErrorType: null,
      providerCode: null,
    };
  }

  const parsedError = parseOpenRouterErrorObject(error);
  const errorCode = parsedError.errorCode;
  const message = parsedError.message;
  const providerErrorType = parsedError.providerErrorType;
  const providerCode = parsedError.providerCode;
  const hint = readRateLimitHint(headers);

  const extras = [
    errorCode ? `code=${errorCode}` : null,
    providerErrorType ? `error_type=${providerErrorType}` : null,
    providerCode ? `provider_code=${providerCode}` : null,
    hint,
  ].filter((part): part is string => part != null);

  return {
    errorMessage: [
      message ? `${fallbackMessage}: ${message}` : fallbackMessage,
      extras.length > 0 ? `(${extras.join(", ")})` : null,
    ]
      .filter(Boolean)
      .join(" "),
    errorCode,
    providerErrorType,
    providerCode,
  };
}
