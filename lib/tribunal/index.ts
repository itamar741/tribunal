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
 * Not implemented in this foundation phase.
 */

export {};
