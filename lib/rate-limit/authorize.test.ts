import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeModelAction,
  clientAddress,
  EXECUTION_RATE_LIMIT,
  hashRateLimitSubject,
  RateLimitConfigError,
} from "./index";
import type { ExecutionRateLimitRepository } from "./types";

describe("execution cost guard", () => {
  it("uses the first address supplied by the trusted reverse proxy", () => {
    const request = new Request("https://tribunal.example/api/cases", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.4" },
    });
    assert.equal(clientAddress(request), "203.0.113.7");
  });

  it("uses a stable HMAC without retaining the raw address", () => {
    const address = "203.0.113.7";
    const first = hashRateLimitSubject(address, "a".repeat(32));
    const second = hashRateLimitSubject(address, "a".repeat(32));
    assert.equal(first, second);
    assert.equal(first.length, 64);
    assert.equal(first.includes(address), false);
  });

  it("does nothing unless explicitly enabled", async () => {
    let calls = 0;
    const repository: ExecutionRateLimitRepository = {
      async consume() {
        calls += 1;
        return { allowed: true, remaining: EXECUTION_RATE_LIMIT - 1 };
      },
    };
    const decision = await authorizeModelAction(
      new Request("https://tribunal.example/api/cases"),
      repository,
      { env: { NODE_ENV: "test" } },
    );
    assert.equal(decision, null);
    assert.equal(calls, 0);
  });

  it("rejects an enabled guard without a strong HMAC secret", async () => {
    const repository: ExecutionRateLimitRepository = {
      async consume() {
        throw new Error("should not be called");
      },
    };
    await assert.rejects(
      () =>
        authorizeModelAction(
          new Request("https://tribunal.example/api/cases"),
          repository,
          {
            env: {
              NODE_ENV: "test",
              RATE_LIMIT_ENABLED: "true",
              RATE_LIMIT_HMAC_SECRET: "short",
            },
          },
        ),
      RateLimitConfigError,
    );
  });

  it("delegates one enabled action with a hashed subject and fixed timestamp", async () => {
    const at = new Date("2026-09-02T12:00:00.000Z");
    let receivedHash = "";
    let receivedAt: Date | undefined;
    const repository: ExecutionRateLimitRepository = {
      async consume(subjectHash, timestamp) {
        receivedHash = subjectHash;
        receivedAt = timestamp;
        return { allowed: true, remaining: 4 };
      },
    };
    const request = new Request("https://tribunal.example/api/cases", {
      headers: { "x-forwarded-for": "198.51.100.9" },
    });
    const decision = await authorizeModelAction(request, repository, {
      env: {
        NODE_ENV: "test",
        RATE_LIMIT_ENABLED: "true",
        RATE_LIMIT_HMAC_SECRET: "test-secret-that-is-at-least-32-chars",
      },
      now: at,
    });
    assert.deepEqual(decision, { allowed: true, remaining: 4 });
    assert.equal(receivedHash.length, 64);
    assert.equal(receivedHash.includes("198.51.100.9"), false);
    assert.equal(receivedAt, at);
  });
});
