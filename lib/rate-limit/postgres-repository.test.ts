import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { applyMigrations, closePool, query } from "../db";
import { EXECUTION_RATE_LIMIT, PostgresExecutionRateLimitRepository } from "./index";

function loadLocalEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadLocalEnv();
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
const subjectHash = "rate-limit-test-" + "0".repeat(64);

describe("PostgreSQL execution cost guard", {
  skip: !databaseConfigured,
  concurrency: 1,
}, () => {
  after(async () => {
    await query("delete from execution_rate_limits where subject_hash = $1", [subjectHash]);
    await closePool();
  });

  it("atomically allows five concurrent actions, rejects the sixth, and resets after one hour", async () => {
    await applyMigrations();
    await query("delete from execution_rate_limits where subject_hash = $1", [subjectHash]);
    const repository = new PostgresExecutionRateLimitRepository();
    const start = new Date("2026-09-02T12:00:00.000Z");

    const decisions = await Promise.all(
      Array.from({ length: EXECUTION_RATE_LIMIT + 1 }, () =>
        repository.consume(subjectHash, start),
      ),
    );
    assert.equal(decisions.filter((decision) => decision.allowed).length, 5);
    const denied = decisions.find((decision) => !decision.allowed);
    assert.deepEqual(denied, { allowed: false, retryAfterSeconds: 3600 });

    const reset = await repository.consume(
      subjectHash,
      new Date("2026-09-02T13:00:00.000Z"),
    );
    assert.deepEqual(reset, { allowed: true, remaining: 4 });
  });
});
