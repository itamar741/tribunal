import * as z from "zod";

/**
 * Centralized AI response contracts.
 *
 * - One exact schema shared by all advocates.
 * - One exact schema shared by all judges.
 * - Validate already-parsed unknown data; do not parse free-form prose.
 * - Fail closed: extra fields, missing fields, wrong lengths, and
 *   whitespace-only strings are rejected. Values are not coerced.
 */

const nonEmptyString = z.string().refine((value) => value.trim().length > 0);

const advocateArgumentSchema = z.strictObject({
  title: nonEmptyString,
  argument: nonEmptyString,
});

export const advocateResponseSchema = z.strictObject({
  summary: nonEmptyString,
  // Homogeneous array + exact length, not a tuple: OpenAI-compatible
  // JSON Schema requires a single `items` object plus minItems/maxItems.
  arguments: z.array(advocateArgumentSchema).length(3),
  conclusion: nonEmptyString,
});

export const judgeVerdictSchema = z.enum(["JUSTIFIED", "NOT_JUSTIFIED"]);

export const judgeResponseSchema = z.strictObject({
  verdict: judgeVerdictSchema,
  summary: nonEmptyString,
  // Homogeneous array + exact length, not a tuple: OpenAI-compatible
  // JSON Schema requires a single `items` object plus minItems/maxItems.
  key_reasons: z.array(nonEmptyString).length(3),
});

export type AdvocateResponse = z.infer<typeof advocateResponseSchema>;
export type JudgeResponse = z.infer<typeof judgeResponseSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export const ADVOCATE_RESPONSE_JSON_SCHEMA_NAME = "advocate_response";
export const JUDGE_RESPONSE_JSON_SCHEMA_NAME = "judge_response";

/**
 * JSON Schema derived from advocateResponseSchema for OpenRouter
 * `response_format.json_schema`. Zod remains the authoritative validator.
 */
export function advocateResponseJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(advocateResponseSchema, {
    target: "draft-07",
    reused: "inline",
  }) as Record<string, unknown>;

  delete schema.$schema;

  return schema;
}

/**
 * JSON Schema derived from judgeResponseSchema for OpenRouter
 * `response_format.json_schema`. Zod remains the authoritative validator.
 */
export function judgeResponseJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(judgeResponseSchema, {
    target: "draft-07",
    reused: "inline",
  }) as Record<string, unknown>;

  delete schema.$schema;

  return schema;
}

