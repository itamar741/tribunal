import { judgeResponseSchema, type JudgeResponse } from "../contracts";
import { AttemptErrorType } from "./errors";

export type JudgeParseSuccess = {
  ok: true;
  value: JudgeResponse;
};

export type JudgeParseFailure = {
  ok: false;
  errorType:
    | typeof AttemptErrorType.MALFORMED_JSON
    | typeof AttemptErrorType.CONTRACT_VALIDATION;
  errorMessage: string;
};

export type JudgeParseResult = JudgeParseSuccess | JudgeParseFailure;

export function parseJudgeResponse(content: string): JudgeParseResult {
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

  const result = judgeResponseSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      errorType: AttemptErrorType.CONTRACT_VALIDATION,
      errorMessage: "Model output failed the judge response contract.",
    };
  }

  return { ok: true, value: result.data };
}
