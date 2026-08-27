import type { OpenRouterUsage } from "./types";

export const EMPTY_OPENROUTER_USAGE: OpenRouterUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  totalCost: null,
};

function toTokenCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (!Number.isInteger(value)) {
    return null;
  }
  return value;
}

function toCostString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

export function mapOpenRouterUsage(usage: unknown): OpenRouterUsage {
  if (usage == null || typeof usage !== "object") {
    return { ...EMPTY_OPENROUTER_USAGE };
  }

  const record = usage as Record<string, unknown>;
  return {
    promptTokens: toTokenCount(record.prompt_tokens),
    completionTokens: toTokenCount(record.completion_tokens),
    totalTokens: toTokenCount(record.total_tokens),
    totalCost: toCostString(record.cost),
  };
}
