export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number };

export interface ExecutionRateLimitRepository {
  consume(subjectHash: string, at: Date): Promise<RateLimitDecision>;
}

export const EXECUTION_RATE_LIMIT = 5;
export const EXECUTION_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
