/**
 * Server-only one-agent execution slice.
 *
 * Builds a representative prompt, makes one OpenRouter attempt,
 * validates through the Advocate Zod contract, and persists a
 * Model Call audit row. Does not retry, orchestrate, or complete
 * a Tribunal Run.
 */

export { executeRepresentativeAttempt } from "./execute-representative-attempt";
export type {
  ChatCompletionsPort,
  ExecuteRepresentativeAttemptDeps,
  ExecuteRepresentativeAttemptInput,
  RepresentativeAttemptResult,
  RepresentativeAttemptRunRepository,
} from "./execute-representative-attempt";
export { AttemptErrorType } from "./errors";
export { parseAdvocateResponse } from "./parse-advocate-response";
export type { AdvocateParseResult } from "./parse-advocate-response";
