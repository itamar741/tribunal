/**
 * Provider-agnostic Tribunal prompt builders.
 *
 * Trusted instructions and configuration are assembled on the server
 * from profiles and contracts. Charge-sheet Markdown and advocate
 * outputs are included as delimited untrusted case material.
 *
 * There is one representative builder and one judge builder.
 * Seat differences come from the profile catalog, not separate prompt
 * implementations. Model IDs and provider APIs are not part of this
 * layer.
 */

export type { PromptMessage, PromptMessageRole, TribunalPrompt } from "./types";
export {
  buildRepresentativePrompt,
  type RepresentativePromptInput,
} from "./representative";
export {
  buildJudgePrompt,
  type JudgeAdvocateResponses,
  type JudgePromptInput,
} from "./judge";
