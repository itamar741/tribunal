/**
 * Settled Tribunal run configurations.
 *
 * Both runs use the same reusable Tribunal engine.
 * Behavior differs by configuration only — never by duplicated workflow code.
 * Concrete model IDs are assigned in ./models.ts.
 */
export const TribunalRunKind = {
  SAME_MODEL: "SAME_MODEL",
  MIXED_MODELS: "MIXED_MODELS",
} as const;

export type TribunalRunKind =
  (typeof TribunalRunKind)[keyof typeof TribunalRunKind];
