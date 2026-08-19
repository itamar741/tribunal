/**
 * Centralized AI response contracts.
 *
 * Settled rules:
 * - One exact response schema shared by all advocates.
 * - One exact response schema shared by all judges.
 * - All advocate calls validate against the advocate contract at runtime.
 * - All judge calls validate against the judge contract at runtime.
 * - Orchestration must never depend on parsing free-form prose.
 *
 * Unresolved: exact schema fields have not been supplied yet.
 * Do not invent advocate or judge response fields here.
 */

export type AdvocateResponseContract = unknown;
export type JudgeResponseContract = unknown;
