import type { AdvocateResponse, JudgeResponse } from "../contracts";

/**
 * Contract shapes for prompt text, keyed to the existing TypeScript
 * contract types so this cannot drift into a second schema.
 */
export const ADVOCATE_RESPONSE_CONTRACT_SHAPE = {
  summary: "<non-empty string>",
  arguments: [
    { title: "<non-empty string>", argument: "<non-empty string>" },
    { title: "<non-empty string>", argument: "<non-empty string>" },
    { title: "<non-empty string>", argument: "<non-empty string>" },
  ],
  conclusion: "<non-empty string>",
} as const satisfies Record<keyof AdvocateResponse, unknown>;

export const JUDGE_RESPONSE_CONTRACT_SHAPE = {
  verdict: "<JUSTIFIED | NOT_JUSTIFIED>",
  summary: "<non-empty string>",
  key_reasons: [
    "<non-empty string>",
    "<non-empty string>",
    "<non-empty string>",
  ],
} as const satisfies Record<keyof JudgeResponse, unknown>;

export const ADVOCATE_CONTRACT_REQUIREMENTS = [
  "The JSON object must contain exactly these keys: summary, arguments, conclusion.",
  "summary: required non-empty string.",
  "arguments: required array of exactly 3 objects.",
  "Each argument object must contain exactly title and argument, both non-empty strings.",
  "The 3 arguments must be distinct.",
  "conclusion: required non-empty string.",
  "Additional fields are forbidden.",
].join("\n");

export const JUDGE_CONTRACT_REQUIREMENTS = [
  "The JSON object must contain exactly these keys: verdict, summary, key_reasons.",
  'verdict: exactly "JUSTIFIED" or "NOT_JUSTIFIED".',
  "summary: required non-empty string.",
  "key_reasons: required array of exactly 3 non-empty strings.",
  "Additional fields are forbidden.",
].join("\n");

export function renderContractShape(shape: unknown): string {
  return JSON.stringify(shape, null, 2);
}
