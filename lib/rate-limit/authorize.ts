import { createHmac } from "node:crypto";
import type { ExecutionRateLimitRepository, RateLimitDecision } from "./types";

export class RateLimitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitConfigError";
  }
}

export function isExecutionRateLimitEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RATE_LIMIT_ENABLED === "true";
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",", 1)[0]?.trim();
  return first || "local-or-unknown";
}

export function hashRateLimitSubject(address: string, secret: string): string {
  return createHmac("sha256", secret).update(address).digest("hex");
}

export async function authorizeModelAction(
  request: Request,
  repository: ExecutionRateLimitRepository,
  options: {
    env?: NodeJS.ProcessEnv;
    now?: Date;
  } = {},
): Promise<RateLimitDecision | null> {
  const env = options.env ?? process.env;
  if (!isExecutionRateLimitEnabled(env)) {
    return null;
  }
  const secret = env.RATE_LIMIT_HMAC_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new RateLimitConfigError(
      "RATE_LIMIT_HMAC_SECRET must contain at least 32 characters when rate limiting is enabled.",
    );
  }
  return repository.consume(
    hashRateLimitSubject(clientAddress(request), secret),
    options.now ?? new Date(),
  );
}
