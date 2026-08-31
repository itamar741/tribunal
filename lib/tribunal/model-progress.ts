import type { TribunalRunKind } from "../ai/configurations";
import type { ModelCallSource, ModelCallStage } from "../model-calls";
import type { TribunalAgentRole } from "../ai/profiles";

export type LiveModelAttempt = {
  runId: string;
  runKind: TribunalRunKind;
  role: TribunalAgentRole;
  stage: ModelCallStage;
  model: string;
  attempt: 1 | 2;
  modelSource: ModelCallSource;
  recoveryCycle: number;
};

/**
 * Ephemeral progress only. `draft_delta` is intentionally never passed to a
 * repository or written to the Case record; it remains in the initiating
 * browser's memory until a validated response replaces it.
 */
export type ModelProgressEvent =
  | ({ type: "attempt_started" } & LiveModelAttempt)
  | ({ type: "draft_delta"; delta: string } & LiveModelAttempt)
  | ({ type: "attempt_succeeded" } & LiveModelAttempt)
  | ({ type: "attempt_failed"; errorType: string } & LiveModelAttempt);

export type ModelProgressListener = (event: ModelProgressEvent) => void;
