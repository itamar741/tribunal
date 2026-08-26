/**
 * Provider-agnostic prompt representation.
 *
 * `system` carries trusted Tribunal instructions and configuration.
 * `user` carries untrusted case material (charge sheet and advocate
 * outputs). This is not an OpenRouter or vendor SDK type.
 */

export type PromptMessageRole = "system" | "user";

export type PromptMessage = {
  role: PromptMessageRole;
  content: string;
};

export type TribunalPrompt = {
  messages: readonly PromptMessage[];
};
