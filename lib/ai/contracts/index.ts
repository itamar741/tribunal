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

export const judgeVerdictSchema = z.enum(["GUILTY", "NOT_GUILTY"]);

export const judgeResponseSchema = z.strictObject({
  verdict: judgeVerdictSchema,
  summary: nonEmptyString,
  key_reasons: z.tuple([nonEmptyString, nonEmptyString, nonEmptyString]),
});

export type AdvocateResponse = z.infer<typeof advocateResponseSchema>;
export type JudgeResponse = z.infer<typeof judgeResponseSchema>;
export type JudgeVerdict = z.infer<typeof judgeVerdictSchema>;
