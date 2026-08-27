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
  arguments: z.tuple([
    advocateArgumentSchema,
    advocateArgumentSchema,
    advocateArgumentSchema,
  ]),
  conclusion: nonEmptyString,
});

export const judgeVerdictSchema = z.enum(["JUSTIFIED", "NOT_JUSTIFIED"]);

export const judgeResponseSchema = z.strictObject({
  verdict: judgeVerdictSchema,
  summary: nonEmptyString,
  key_reasons: z.tuple([nonEmptyString, nonEmptyString, nonEmptyString]),
});

export type AdvocateResponse = z.infer<typeof advocateResponseSchema>;
export type JudgeResponse = z.infer<typeof judgeResponseSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;

export const ADVOCATE_RESPONSE_JSON_SCHEMA_NAME = "advocate_response";

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

  const properties = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined;
  const argumentsSchema = properties?.arguments;
  if (argumentsSchema && Array.isArray(argumentsSchema.items)) {
    const length = argumentsSchema.items.length;
    argumentsSchema.minItems = length;
    argumentsSchema.maxItems = length;
  }

  return schema;
}

