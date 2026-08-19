import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { DatabaseError } from "pg";
import { TribunalRunKind } from "../ai/configurations";
import {
  applyMigrations,
  closePool,
  inspectClientTls,
  query,
  withClient,
  withTransaction,
} from "../db";
import { PostgresCaseRepository } from "./postgres-repository";
import { hasRequiredRunKinds } from "./runs";
import { TribunalRunStatus } from "./types";

function loadLocalEnv() {
  if (process.env.DATABASE_URL) {
    return;
  }
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
const TEST_FILE_PREFIX = "phase2-verify-";

describe("PostgresCaseRepository run invariants", {
  skip: !databaseConfigured,
  concurrency: 1,
}, () => {
  after(async () => {
    await query(
      "delete from cases where original_file_name like $1",
      [`${TEST_FILE_PREFIX}%`],
    );
    await closePool();
  });

  it("connects over verified TLS to the configured database", async () => {
    const tls = await withClient(async (client) => inspectClientTls(client));
    assert.equal(tls.encrypted, true);
    assert.equal(tls.authorized, true);
    assert.ok(tls.protocol);
  });

  it("creates a Case with exactly two distinct run kinds atomically", async () => {
    await applyMigrations();
    const repository = new PostgresCaseRepository();
    const created = await repository.create({
      originalFileName: `${TEST_FILE_PREFIX}new.md`,
      chargeSheetText: "# Charge\n\nPhase 2 verification.",
    });

    assert.equal(hasRequiredRunKinds(created.runs), true);
    assert.equal(created.runs.length, 2);
    assert.notEqual(created.runs[0].id, created.runs[1].id);
    assert.deepEqual(
      created.runs.map((run) => run.runType).sort(),
      [TribunalRunKind.MIXED_MODELS, TribunalRunKind.SAME_MODEL],
    );
    for (const run of created.runs) {
      assert.equal(run.caseId, created.id);
      assert.equal(run.status, TribunalRunStatus.PENDING);
    }

    const found = await repository.getById(created.id);
    assert.ok(found);
    assert.equal(found.chargeSheetText, created.chargeSheetText);
    assert.equal(hasRequiredRunKinds(found.runs), true);
  });

  it("rejects a duplicate (case_id, run_type)", async () => {
    const repository = new PostgresCaseRepository();
    const created = await repository.create({
      originalFileName: `${TEST_FILE_PREFIX}dup.md`,
      chargeSheetText: "Duplicate run kind check.",
    });

    await assert.rejects(
      () =>
        query(
          `
            insert into tribunal_runs (case_id, run_type, status)
            values ($1, $2, $3)
          `,
          [
            created.id,
            TribunalRunKind.SAME_MODEL,
            TribunalRunStatus.PENDING,
          ],
        ),
      (error: unknown) =>
        error instanceof DatabaseError && error.code === "23505",
    );

    const found = await repository.getById(created.id);
    assert.ok(found);
    assert.equal(found.runs.length, 2);
  });

  it("rolls back Case insert when the transaction fails", async () => {
    const marker = `${TEST_FILE_PREFIX}atomic-${Date.now()}.md`;

    await assert.rejects(
      () =>
        withTransaction(async (client) => {
          await client.query(
            `
              insert into cases (original_file_name, charge_sheet_text)
              values ($1, $2)
            `,
            [marker, "should not remain"],
          );
          throw new Error("forced initialization failure");
        }),
      /forced initialization failure/,
    );

    const leftover = await query<{ id: string }>(
      "select id from cases where original_file_name = $1",
      [marker],
    );
    assert.equal(leftover.rowCount, 0);
  });

  it("leaves existing Cases with exactly two runs after backfill", async () => {
    const counts = await query<{
      case_count: string;
      run_count: string;
      incomplete: string;
    }>(
      `
        select
          (select count(*) from cases) as case_count,
          (select count(*) from tribunal_runs) as run_count,
          (
            select count(*)
            from cases c
            where (
              select count(*)
              from tribunal_runs r
              where r.case_id = c.id
            ) <> 2
            or exists (
              select 1
              from tribunal_runs r
              where r.case_id = c.id
              group by r.run_type
              having count(*) > 1
            )
            or not exists (
              select 1 from tribunal_runs r
              where r.case_id = c.id and r.run_type = 'SAME_MODEL'
            )
            or not exists (
              select 1 from tribunal_runs r
              where r.case_id = c.id and r.run_type = 'MIXED_MODELS'
            )
          ) as incomplete
      `,
    );

    const row = counts.rows[0];
    assert.ok(row);
    assert.equal(Number(row.run_count), Number(row.case_count) * 2);
    assert.equal(Number(row.incomplete), 0);
  });
});
