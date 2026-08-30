import { AttemptErrorType } from "./errors";

export const FailureClassification = {
  RATE_LIMITED: "RATE_LIMITED",
  TEMPORARY_PROVIDER_ERROR: "TEMPORARY_PROVIDER_ERROR",
  INVALID_OUTPUT: "INVALID_OUTPUT",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  AUTH_OR_CONFIGURATION_ERROR: "AUTH_OR_CONFIGURATION_ERROR",
  SYSTEM_ERROR: "SYSTEM_ERROR",
} as const;

export type FailureClassification =
  (typeof FailureClassification)[keyof typeof FailureClassification];

export function classifyFailure(input: { errorType: string | null; httpStatus?: number | null }): {
  classification: FailureClassification;
  fallbackEligible: boolean;
} {
  const status = input.httpStatus ?? null;
  if (input.errorType === AttemptErrorType.HTTP_ERROR && status === 429) return { classification: FailureClassification.RATE_LIMITED, fallbackEligible: true };
  if (input.errorType === AttemptErrorType.MALFORMED_JSON || input.errorType === AttemptErrorType.CONTRACT_VALIDATION || input.errorType === AttemptErrorType.INVALID_RESPONSE) return { classification: FailureClassification.INVALID_OUTPUT, fallbackEligible: true };
  if (input.errorType === AttemptErrorType.HTTP_ERROR && (status === 404 || status === 410)) return { classification: FailureClassification.MODEL_UNAVAILABLE, fallbackEligible: true };
  if (input.errorType === AttemptErrorType.TIMEOUT || input.errorType === AttemptErrorType.NETWORK || input.errorType === AttemptErrorType.PROVIDER_RESPONSE_ERROR || (input.errorType === AttemptErrorType.HTTP_ERROR && status != null && status >= 500)) return { classification: FailureClassification.TEMPORARY_PROVIDER_ERROR, fallbackEligible: true };
  if (input.errorType === AttemptErrorType.INVALID_CONFIGURATION || (input.errorType === AttemptErrorType.HTTP_ERROR && (status === 401 || status === 403))) return { classification: FailureClassification.AUTH_OR_CONFIGURATION_ERROR, fallbackEligible: false };
  return { classification: FailureClassification.SYSTEM_ERROR, fallbackEligible: false };
}
