import {
  advocateResponseSchema,
  type AdvocateResponse,
} from "../contracts";
import { AttemptErrorType } from "./errors";

export type AdvocateParseSuccess = {
  ok: true;
  value: AdvocateResponse;
};

export type AdvocateParseFailure = {
  ok: false;
  errorType:
    | typeof AttemptErrorType.MALFORMED_JSON
    | typeof AttemptErrorType.CONTRACT_VALIDATION;
  errorMessage: string;
};

export type AdvocateParseResult = AdvocateParseSuccess | AdvocateParseFailure;

export function parseAdvocateResponse(content: string): AdvocateParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return {
      ok: false,
      errorType: AttemptErrorType.MALFORMED_JSON,
      errorMessage: "Model output was not valid JSON.",
    };
  }

  const result = advocateResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errorType: AttemptErrorType.CONTRACT_VALIDATION,
      errorMessage: "Model output failed the advocate response contract.",
    };
  }

  return { ok: true, value: result.data };
}
