export const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

export class MissingOpenRouterApiKeyError extends Error {
  constructor() {
    super(
      "OPENROUTER_API_KEY is not configured. Set a server-only OpenRouter API key to perform live model requests.",
    );
    this.name = "MissingOpenRouterApiKeyError";
  }
}

export function getOpenRouterApiKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env[OPENROUTER_API_KEY_ENV];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

export function requireOpenRouterApiKey(
  env: Record<string, string | undefined> = process.env,
): string {
  const key = getOpenRouterApiKey(env);
  if (!key) {
    throw new MissingOpenRouterApiKeyError();
  }
  return key;
}
