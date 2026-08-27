/**
 * Reusable Tribunal engine boundary.
 *
 * Settled rules:
 * - Exactly one engine implementation for all Tribunal runs.
 * - SAME_MODEL and MIXED_MODELS differ by configuration only.
 * - Inside each run: four advocates in parallel, then three judges in parallel.
 * - Judges start only after all advocate outputs for that run are available.
 * - Each run calculates its own majority verdict.
 * - AI failures must never silently become valid verdicts.
 *
 * The Advocate stage is implemented. Judges, majority, and dual-run
 * orchestration are not.
 */

export { executeAdvocateStage } from "./execute-advocate-stage";
export type {
  AdvocateStageAgentFailure,
  AdvocateStageAgentMeta,
  AdvocateStageFailure,
  AdvocateStageResult,
  AdvocateStageRunRepository,
  AdvocateStageSuccess,
  ExecuteAdvocateStageDeps,
  ExecuteAdvocateStageInput,
} from "./execute-advocate-stage";
