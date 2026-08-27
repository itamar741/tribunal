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
 * Advocate and Judge stages and single-run orchestration are
 * implemented. Dual-run orchestration is not.
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
export { executeJudgeStage } from "./execute-judge-stage";
export type {
  ExecuteJudgeStageDeps,
  ExecuteJudgeStageInput,
  JudgeStageAgentFailure,
  JudgeStageAgentMeta,
  JudgeStageFailure,
  JudgeStageResult,
  JudgeStageRunRepository,
  JudgeStageSuccess,
} from "./execute-judge-stage";
export { calculateMajority } from "./majority";
export { executeTribunalRun } from "./execute-tribunal-run";
export type {
  ExecuteTribunalRunDeps,
  ExecuteTribunalRunInput,
  TribunalRunAdvocateFailure,
  TribunalRunFailure,
  TribunalRunJudgeFailure,
  TribunalRunNotExecutableFailure,
  TribunalRunRepositoryPort,
  TribunalRunResult,
  TribunalRunSuccess,
} from "./execute-tribunal-run";
