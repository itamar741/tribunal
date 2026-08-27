import { sanitizeOpenRouterErrorText } from "../ai/openrouter";

export type ApiErrorBody = {
  ok: false;
  code: string;
  error: string;
};

export type ApiJsonResult<T> = {
  status: number;
  body: T | ApiErrorBody;
};

export function apiError(
  status: number,
  code: string,
  error: string,
): ApiJsonResult<never> {
  return {
    status,
    body: {
      ok: false,
      code,
      error: sanitizeOpenRouterErrorText(error),
    },
  };
}

export function internalError(): ApiJsonResult<never> {
  return apiError(
    500,
    "INTERNAL_ERROR",
    "The request could not be completed.",
  );
}

export const OPENROUTER_UNAVAILABLE_MESSAGE =
  "The AI gateway is not configured.";
