import { AttemptErrorType } from "./errors";

/**
 * Maximum sleep before attempt 2. 60 seconds is a small explicit cap
 * within the 90-second per-attempt operational scale. Retry-After
 * values above this are clamped so a malicious or absurd header cannot
 * stall execution.
 */
export const MAX_RETRY_DELAY_MS = 60_000;

/** Fixed delay before attempt 2 after timeout, network, or transient 5xx. */
export const TRANSIENT_RETRY_DELAY_MS = 1_000;

/**
 * Delay used for HTTP 429 when Retry-After is missing or unusable.
 * Invalid model output retries immediately (0 ms).
 */
export const RATE_LIMIT_DEFAULT_DELAY_MS = 1_000;

export const RetryReason = {
  TIMEOUT: "TIMEOUT",
  NETWORK: "NETWORK",
  RATE_LIMIT: "RATE_LIMIT",
  TRANSIENT_HTTP_5XX: "TRANSIENT_HTTP_5XX",
  PROVIDER_RESPONSE_ERROR: "PROVIDER_RESPONSE_ERROR",
  MALFORMED_JSON: "MALFORMED_JSON",
  CONTRACT_VALIDATION: "CONTRACT_VALIDATION",
  INCOMPLETE_OUTPUT: "INCOMPLETE_OUTPUT",
  AUTH: "AUTH",
  PERMANENT_HTTP: "PERMANENT_HTTP",
  INVALID_CONFIGURATION: "INVALID_CONFIGURATION",
  UNKNOWN: "UNKNOWN",
} as const;

export type RetryReason = (typeof RetryReason)[keyof typeof RetryReason];

export type RetryClassificationInput = {
  errorType: string;
  httpStatus?: number | null;
  retryAfterHeader?: string | null;
};

export type RetryDecision = {
  retryable: boolean;
  reason: RetryReason;
  delayMs: number;
  usesOutputContractCorrection: boolean;
};

const INVALID_OUTPUT_REASONS = new Set<RetryReason>([
  RetryReason.MALFORMED_JSON,
  RetryReason.CONTRACT_VALIDATION,
  RetryReason.INCOMPLETE_OUTPUT,
]);

function clampDelayMs(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) {
    return 0;
  }
  return Math.min(Math.floor(ms), MAX_RETRY_DELAY_MS);
}

/**
 * Parse HTTP Retry-After as delta-seconds or HTTP-date.
 * Returns null when the header is missing or not a reasonable value.
 * Parsed delays are clamped to MAX_RETRY_DELAY_MS.
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  options?: { now?: () => number },
): number | null {
  if (header == null) {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds) || seconds < 0) {
      return null;
    }
    return clampDelayMs(seconds * 1000);
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const now = (options?.now ?? Date.now)();
  return clampDelayMs(parsed - now);
}

function retryable(
  reason: RetryReason,
  delayMs: number,
): RetryDecision {
  return {
    retryable: true,
    reason,
    delayMs,
    usesOutputContractCorrection: INVALID_OUTPUT_REASONS.has(reason),
  };
}

function permanent(reason: RetryReason): RetryDecision {
  return {
    retryable: false,
    reason,
    delayMs: 0,
    usesOutputContractCorrection: false,
  };
}

function rateLimitDelayMs(
  header: string | null | undefined,
  now?: () => number,
): number {
  const parsed = parseRetryAfterMs(header, { now });
  return parsed ?? RATE_LIMIT_DEFAULT_DELAY_MS;
}

/**
 * Central retry decision for one representative attempt.
 * Transport code must not decide whether to retry.
 */
export function classifyRetry(
  input: RetryClassificationInput,
  options?: { now?: () => number },
): RetryDecision {
  const errorType = input.errorType;
  const status = input.httpStatus ?? null;

  if (errorType === AttemptErrorType.INVALID_CONFIGURATION) {
    return permanent(RetryReason.INVALID_CONFIGURATION);
  }

  if (errorType === AttemptErrorType.TIMEOUT) {
    return retryable(RetryReason.TIMEOUT, TRANSIENT_RETRY_DELAY_MS);
  }

  if (errorType === AttemptErrorType.NETWORK) {
    return retryable(RetryReason.NETWORK, TRANSIENT_RETRY_DELAY_MS);
  }

  if (errorType === AttemptErrorType.MALFORMED_JSON) {
    return retryable(RetryReason.MALFORMED_JSON, 0);
  }

  if (errorType === AttemptErrorType.CONTRACT_VALIDATION) {
    return retryable(RetryReason.CONTRACT_VALIDATION, 0);
  }

  if (errorType === AttemptErrorType.INVALID_RESPONSE) {
    return retryable(RetryReason.INCOMPLETE_OUTPUT, 0);
  }

  if (errorType === AttemptErrorType.PROVIDER_RESPONSE_ERROR) {
    return retryable(
      RetryReason.PROVIDER_RESPONSE_ERROR,
      rateLimitDelayMs(input.retryAfterHeader, options?.now),
    );
  }

  if (errorType === AttemptErrorType.HTTP_ERROR) {
    if (status === 429) {
      return retryable(
        RetryReason.RATE_LIMIT,
        rateLimitDelayMs(input.retryAfterHeader, options?.now),
      );
    }
    if (status === 401 || status === 403) {
      return permanent(RetryReason.AUTH);
    }
    if (status != null && status >= 500 && status <= 599) {
      return retryable(RetryReason.TRANSIENT_HTTP_5XX, TRANSIENT_RETRY_DELAY_MS);
    }
    return permanent(RetryReason.PERMANENT_HTTP);
  }

  return permanent(RetryReason.UNKNOWN);
}

export async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
