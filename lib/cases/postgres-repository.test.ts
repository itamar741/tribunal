import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { DatabaseError } from "pg";
import { TribunalRunKind } from "../ai/configurations";
import {
  advocateResponseSchema,
  judgeResponseSchema,
} from "../ai/contracts";
import {
  applyMigrations,
  closePool,
  inspectClientTls,
  query,
  withClient,
  withTransaction,
} from "../db";
import { PostgresModelCallRepository } from "../model-calls";
import {
  ModelCallAgentRole,
  ModelCallStage,
  ModelCallStatus,
  type NewModelCallInput,
} from "../model-calls/types";
import { PostgresCaseRepository } from "./postgres-repository";
import { PostgresTribunalRunRepository } from "./postgres-run-repository";
import { hasRequiredRunKinds } from "./runs";
import { TribunalRunStatus, TribunalRunVerdict } from "./types";

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
const PHASE2_FILE_PREFIX = "phase2-verify-";
const PHASE4A_FILE_PREFIX = "phase4a-verify-";

function isCheckViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === "23514";
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === "23505";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === "23503";
}

function advocateResponse() {
  return advocateResponseSchema.parse({
    summary: "Defense summary",
    arguments: [
      { title: "One", argument: "First argument" },
      { title: "Two", argument: "Second argument" },
      { title: "Three", argument: "Third argument" },
    ],
    conclusion: "The charge is not proven.",
  });
}

function judgeResponse() {
  return judgeResponseSchema.parse({
    verdict: "NOT_GUILTY",
    summary: "The evidence is insufficient.",
    key_reasons: ["Reason one", "Reason two", "Reason three"],
  });
}

function successfulCall(
  overrides: Pick<NewModelCallInput, "caseId" | "runId" | "stage" | "agentRole"> &
    Partial<NewModelCallInput>,
): NewModelCallInput {
  return {
    attempt: 1,
    model: "test-model",
    status: ModelCallStatus.SUCCEEDED,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    inputCost: "0.00001000",
    outputCost: "0.00002000",
    totalCost: "0.00003000",
    durationMs: 800,
    providerCallId: "gen-test-success",
    validatedResponse: advocateResponse(),
    errorType: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("PostgreSQL persistence", {
  skip: !databaseConfigured,
  concurrency: 1,
}, () => {
  after(async () => {
    await query(
      "delete from cases where original_file_name like $1 or original_file_name like $2",
      [`${PHASE2_FILE_PREFIX}%`, `${PHASE4A_FILE_PREFIX}%`],
    );
    await closePool();
  });

  describe("PostgresCaseRepository run invariants", () => {
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
        originalFileName: `${PHASE2_FILE_PREFIX}new.md`,
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
        assert.equal(run.finalVerdict, null);
        assert.equal(run.startedAt, null);
        assert.equal(run.completedAt, null);
        assert.equal(run.failureReason, null);
      }

      const found = await repository.getById(created.id);
      assert.ok(found);
      assert.equal(found.chargeSheetText, created.chargeSheetText);
      assert.equal(hasRequiredRunKinds(found.runs), true);
    });

    it("rejects a duplicate (case_id, run_type)", async () => {
      const repository = new PostgresCaseRepository();
      const created = await repository.create({
        originalFileName: `${PHASE2_FILE_PREFIX}dup.md`,
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
        isUniqueViolation,
      );

      const found = await repository.getById(created.id);
      assert.ok(found);
      assert.equal(found.runs.length, 2);
    });

    it("rolls back Case insert when the transaction fails", async () => {
      const marker = `${PHASE2_FILE_PREFIX}atomic-${Date.now()}.md`;

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

  describe("Tribunal Run lifecycle schema", () => {
    it("leaves existing Cases and PENDING runs intact after migration", async () => {
      await applyMigrations();
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}survive.md`,
        chargeSheetText: "Existing rows must remain valid.",
      });

      const before = await query<{
        id: string;
        status: string;
        final_verdict: string | null;
        started_at: Date | null;
        completed_at: Date | null;
        failure_reason: string | null;
      }>(
        `
          select id, status, final_verdict, started_at, completed_at, failure_reason
          from tribunal_runs
          where case_id = $1
          order by run_type
        `,
        [created.id],
      );

      const appliedAgain = await applyMigrations();
      assert.equal(appliedAgain.length, 0);

      const after = await query<{
        id: string;
        status: string;
        final_verdict: string | null;
        started_at: Date | null;
        completed_at: Date | null;
        failure_reason: string | null;
      }>(
        `
          select id, status, final_verdict, started_at, completed_at, failure_reason
          from tribunal_runs
          where case_id = $1
          order by run_type
        `,
        [created.id],
      );

      assert.equal(after.rowCount, 2);
      assert.deepEqual(
        after.rows.map((row) => row.id),
        before.rows.map((row) => row.id),
      );
      for (const row of after.rows) {
        assert.equal(row.status, TribunalRunStatus.PENDING);
        assert.equal(row.final_verdict, null);
        assert.equal(row.started_at, null);
        assert.equal(row.completed_at, null);
        assert.equal(row.failure_reason, null);
      }

      const found = await cases.getById(created.id);
      assert.ok(found);
      assert.equal(found.originalFileName, created.originalFileName);
      assert.equal(found.chargeSheetText, created.chargeSheetText);
    });

    it("accepts PENDING, RUNNING, SUCCEEDED, and FAILED with valid companion fields", async () => {
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}statuses.md`,
        chargeSheetText: "Lifecycle status acceptance.",
      });
      const pendingId = created.runs[0].id;
      const runningId = created.runs[1].id;

      await query(
        `
          update tribunal_runs
          set status = 'RUNNING', started_at = now()
          where id = $1
        `,
        [runningId],
      );

      const second = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}statuses-2.md`,
        chargeSheetText: "More lifecycle statuses.",
      });
      const succeededId = second.runs[0].id;
      const failedId = second.runs[1].id;

      await query(
        `
          update tribunal_runs
          set
            status = 'SUCCEEDED',
            final_verdict = 'GUILTY',
            started_at = now(),
            completed_at = now()
          where id = $1
        `,
        [succeededId],
      );
      await query(
        `
          update tribunal_runs
          set
            status = 'FAILED',
            started_at = now(),
            completed_at = now(),
            failure_reason = 'advocate stage failed'
          where id = $1
        `,
        [failedId],
      );

      const rows = await query<{ id: string; status: string }>(
        "select id, status from tribunal_runs where id = any($1::uuid[])",
        [[pendingId, runningId, succeededId, failedId]],
      );
      const byId = new Map(rows.rows.map((row) => [row.id, row.status]));
      assert.equal(byId.get(pendingId), TribunalRunStatus.PENDING);
      assert.equal(byId.get(runningId), TribunalRunStatus.RUNNING);
      assert.equal(byId.get(succeededId), TribunalRunStatus.SUCCEEDED);
      assert.equal(byId.get(failedId), TribunalRunStatus.FAILED);
    });

    it("rejects an invalid run status", async () => {
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}bad-status.md`,
        chargeSheetText: "Invalid status must be rejected.",
      });

      await assert.rejects(
        () =>
          query("update tribunal_runs set status = $2 where id = $1", [
            created.runs[0].id,
            "COMPLETE",
          ]),
        isCheckViolation,
      );
    });

    it("rejects an invalid final verdict", async () => {
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}bad-verdict.md`,
        chargeSheetText: "Invalid verdict must be rejected.",
      });

      await assert.rejects(
        () =>
          query(
            `
              update tribunal_runs
              set
                status = 'SUCCEEDED',
                final_verdict = 'INNOCENT',
                started_at = now(),
                completed_at = now()
              where id = $1
            `,
            [created.runs[0].id],
          ),
        isCheckViolation,
      );
    });
  });

  describe("Tribunal Run lifecycle repository", () => {
    it("persists PENDING -> RUNNING", async () => {
      const cases = new PostgresCaseRepository();
      const runs = new PostgresTribunalRunRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}running.md`,
        chargeSheetText: "Mark running.",
      });

      const updated = await runs.markRunning(created.runs[0].id);
      assert.equal(updated.status, TribunalRunStatus.RUNNING);
      assert.equal(updated.finalVerdict, null);
      assert.ok(updated.startedAt instanceof Date);
      assert.equal(updated.completedAt, null);
      assert.equal(updated.failureReason, null);

      const found = await runs.getById(created.runs[0].id);
      assert.ok(found);
      assert.equal(found.status, TribunalRunStatus.RUNNING);
      assert.ok(found.startedAt instanceof Date);
    });

    it("persists SUCCEEDED with a final verdict", async () => {
      const cases = new PostgresCaseRepository();
      const runs = new PostgresTribunalRunRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}succeeded.md`,
        chargeSheetText: "Mark succeeded.",
      });

      await runs.markRunning(created.runs[0].id);
      const updated = await runs.markSucceeded(
        created.runs[0].id,
        TribunalRunVerdict.NOT_GUILTY,
      );

      assert.equal(updated.status, TribunalRunStatus.SUCCEEDED);
      assert.equal(updated.finalVerdict, TribunalRunVerdict.NOT_GUILTY);
      assert.ok(updated.startedAt instanceof Date);
      assert.ok(updated.completedAt instanceof Date);
      assert.equal(updated.failureReason, null);

      const caseRecord = await cases.getById(created.id);
      assert.ok(caseRecord);
      const persisted = caseRecord.runs.find((run) => run.id === created.runs[0].id);
      assert.ok(persisted);
      assert.equal(persisted.status, TribunalRunStatus.SUCCEEDED);
      assert.equal(persisted.finalVerdict, TribunalRunVerdict.NOT_GUILTY);
    });

    it("persists FAILED with a failure reason and no final verdict", async () => {
      const cases = new PostgresCaseRepository();
      const runs = new PostgresTribunalRunRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}failed.md`,
        chargeSheetText: "Mark failed.",
      });

      await runs.markRunning(created.runs[0].id);
      const updated = await runs.markFailed(
        created.runs[0].id,
        "Advocate stage failed after two attempts.",
      );

      assert.equal(updated.status, TribunalRunStatus.FAILED);
      assert.equal(updated.finalVerdict, null);
      assert.equal(
        updated.failureReason,
        "Advocate stage failed after two attempts.",
      );
      assert.ok(updated.startedAt instanceof Date);
      assert.ok(updated.completedAt instanceof Date);

      const found = await runs.getById(created.runs[0].id);
      assert.ok(found);
      assert.equal(found.status, TribunalRunStatus.FAILED);
      assert.equal(found.finalVerdict, null);
      assert.equal(
        found.failureReason,
        "Advocate stage failed after two attempts.",
      );
    });
  });

  describe("Model Call persistence", () => {
    it("persists a valid successful advocate attempt", async () => {
      const cases = new PostgresCaseRepository();
      const modelCalls = new PostgresModelCallRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}advocate.md`,
        chargeSheetText: "Advocate model call.",
      });
      const response = advocateResponse();

      const stored = await modelCalls.insert(
        successfulCall({
          caseId: created.id,
          runId: created.runs[0].id,
          stage: ModelCallStage.ADVOCATES,
          agentRole: ModelCallAgentRole.DEFENSE_1,
          validatedResponse: response,
        }),
      );

      assert.equal(stored.caseId, created.id);
      assert.equal(stored.runId, created.runs[0].id);
      assert.equal(stored.stage, ModelCallStage.ADVOCATES);
      assert.equal(stored.agentRole, ModelCallAgentRole.DEFENSE_1);
      assert.equal(stored.attempt, 1);
      assert.equal(stored.status, ModelCallStatus.SUCCEEDED);
      assert.deepEqual(stored.validatedResponse, response);
    });

    it("persists a valid successful judge attempt", async () => {
      const cases = new PostgresCaseRepository();
      const modelCalls = new PostgresModelCallRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}judge.md`,
        chargeSheetText: "Judge model call.",
      });
      const response = judgeResponse();

      const stored = await modelCalls.insert(
        successfulCall({
          caseId: created.id,
          runId: created.runs[0].id,
          stage: ModelCallStage.JUDGES,
          agentRole: ModelCallAgentRole.JUDGE_2,
          validatedResponse: response,
        }),
      );

      assert.equal(stored.stage, ModelCallStage.JUDGES);
      assert.equal(stored.agentRole, ModelCallAgentRole.JUDGE_2);
      assert.equal(stored.status, ModelCallStatus.SUCCEEDED);
      assert.deepEqual(stored.validatedResponse, response);
    });

    it("persists a failed attempt with null token and cost fields", async () => {
      const cases = new PostgresCaseRepository();
      const modelCalls = new PostgresModelCallRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}failed-call.md`,
        chargeSheetText: "Failed model call.",
      });

      const stored = await modelCalls.insert({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.PROSECUTION_1,
        attempt: 1,
        model: "test-model",
        status: ModelCallStatus.FAILED,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        inputCost: null,
        outputCost: null,
        totalCost: null,
        durationMs: null,
        providerCallId: null,
        validatedResponse: null,
        errorType: "TIMEOUT",
        errorMessage: "The provider request timed out.",
      });

      assert.equal(stored.status, ModelCallStatus.FAILED);
      assert.equal(stored.inputTokens, null);
      assert.equal(stored.outputTokens, null);
      assert.equal(stored.totalTokens, null);
      assert.equal(stored.inputCost, null);
      assert.equal(stored.outputCost, null);
      assert.equal(stored.totalCost, null);
      assert.equal(stored.durationMs, null);
      assert.equal(stored.providerCallId, null);
      assert.equal(stored.validatedResponse, null);
      assert.equal(stored.errorType, "TIMEOUT");
      assert.equal(stored.errorMessage, "The provider request timed out.");
    });

    it("persists usage and cost values accurately and round-trips JSON", async () => {
      const cases = new PostgresCaseRepository();
      const modelCalls = new PostgresModelCallRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}usage.md`,
        chargeSheetText: "Usage accuracy.",
      });
      const response = advocateResponse();

      const stored = await modelCalls.insert({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.DEFENSE_2,
        attempt: 2,
        model: "test-model",
        status: ModelCallStatus.SUCCEEDED,
        inputTokens: 123,
        outputTokens: 456,
        totalTokens: 579,
        inputCost: "0.00001234",
        outputCost: "0.00005678",
        totalCost: "0.00006912",
        durationMs: 1234,
        providerCallId: "gen-test-123",
        validatedResponse: response,
        errorType: null,
        errorMessage: null,
      });

      assert.equal(stored.inputTokens, 123);
      assert.equal(stored.outputTokens, 456);
      assert.equal(stored.totalTokens, 579);
      assert.equal(stored.inputCost, "0.00001234");
      assert.equal(stored.outputCost, "0.00005678");
      assert.equal(stored.totalCost, "0.00006912");
      assert.equal(stored.durationMs, 1234);
      assert.equal(stored.providerCallId, "gen-test-123");
      assert.deepEqual(stored.validatedResponse, response);

      const listed = await modelCalls.listByRunId(created.runs[0].id);
      assert.equal(listed.length, 1);
      assert.deepEqual(listed[0].validatedResponse, response);
      assert.equal(listed[0].inputCost, "0.00001234");
    });

    it("retrieves Model Calls for a run and Case in deterministic order", async () => {
      const cases = new PostgresCaseRepository();
      const modelCalls = new PostgresModelCallRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}order.md`,
        chargeSheetText: "Deterministic retrieval.",
      });
      const runId = created.runs[0].id;

      await modelCalls.insert(
        successfulCall({
          caseId: created.id,
          runId,
          stage: ModelCallStage.JUDGES,
          agentRole: ModelCallAgentRole.JUDGE_1,
          validatedResponse: judgeResponse(),
        }),
      );
      await modelCalls.insert(
        successfulCall({
          caseId: created.id,
          runId,
          stage: ModelCallStage.ADVOCATES,
          agentRole: ModelCallAgentRole.PROSECUTION_2,
        }),
      );
      await modelCalls.insert(
        successfulCall({
          caseId: created.id,
          runId,
          stage: ModelCallStage.ADVOCATES,
          agentRole: ModelCallAgentRole.DEFENSE_1,
        }),
      );

      const byRun = await modelCalls.listByRunId(runId);
      assert.deepEqual(
        byRun.map((call) => call.agentRole),
        [
          ModelCallAgentRole.DEFENSE_1,
          ModelCallAgentRole.PROSECUTION_2,
          ModelCallAgentRole.JUDGE_1,
        ],
      );

      const byCase = await modelCalls.listByCaseId(created.id);
      assert.equal(byCase.length, 3);
      assert.deepEqual(
        byCase.map((call) => call.agentRole),
        [
          ModelCallAgentRole.DEFENSE_1,
          ModelCallAgentRole.PROSECUTION_2,
          ModelCallAgentRole.JUDGE_1,
        ],
      );
    });

    it("rejects an invalid stage", async () => {
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}bad-stage.md`,
        chargeSheetText: "Invalid stage.",
      });

      await assert.rejects(
        () =>
          query(
            `
              insert into model_calls (
                case_id, run_id, stage, agent_role, attempt, model, status, validated_response
              )
              values ($1, $2, 'OPENING', 'DEFENSE_1', 1, 'test-model', 'SUCCEEDED', '{}'::jsonb)
            `,
            [created.id, created.runs[0].id],
          ),
        isCheckViolation,
      );
    });

    it("rejects an invalid agent role", async () => {
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}bad-role.md`,
        chargeSheetText: "Invalid agent role.",
      });

      await assert.rejects(
        () =>
          query(
            `
              insert into model_calls (
                case_id, run_id, stage, agent_role, attempt, model, status, validated_response
              )
              values ($1, $2, 'ADVOCATES', 'DEFENSE_3', 1, 'test-model', 'SUCCEEDED', '{}'::jsonb)
            `,
            [created.id, created.runs[0].id],
          ),
        isCheckViolation,
      );
    });

    it("rejects attempt 0 or 3", async () => {
      const cases = new PostgresCaseRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}bad-attempt.md`,
        chargeSheetText: "Invalid attempt.",
      });

      for (const attempt of [0, 3]) {
        await assert.rejects(
          () =>
            query(
              `
                insert into model_calls (
                  case_id, run_id, stage, agent_role, attempt, model, status, validated_response
                )
                values ($1, $2, 'ADVOCATES', 'DEFENSE_1', $3, 'test-model', 'SUCCEEDED', '{}'::jsonb)
              `,
              [created.id, created.runs[0].id, attempt],
            ),
          isCheckViolation,
        );
      }
    });

    it("rejects a duplicate (run_id, agent_role, attempt)", async () => {
      const cases = new PostgresCaseRepository();
      const modelCalls = new PostgresModelCallRepository();
      const created = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}dup-call.md`,
        chargeSheetText: "Duplicate attempt.",
      });
      const input = successfulCall({
        caseId: created.id,
        runId: created.runs[0].id,
        stage: ModelCallStage.ADVOCATES,
        agentRole: ModelCallAgentRole.PROSECUTION_2,
      });

      await modelCalls.insert(input);
      await assert.rejects(() => modelCalls.insert(input), isUniqueViolation);
    });

    it("rejects invalid foreign keys", async () => {
      const missing = "00000000-0000-4000-8000-000000000099";

      await assert.rejects(
        () =>
          query(
            `
              insert into model_calls (
                case_id, run_id, stage, agent_role, attempt, model, status, validated_response
              )
              values ($1, $2, 'ADVOCATES', 'DEFENSE_1', 1, 'test-model', 'SUCCEEDED', '{}'::jsonb)
            `,
            [missing, missing],
          ),
        isForeignKeyViolation,
      );
    });

    it("rejects a mismatched case_id and run_id", async () => {
      const cases = new PostgresCaseRepository();
      const first = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}mismatch-a.md`,
        chargeSheetText: "First case.",
      });
      const second = await cases.create({
        originalFileName: `${PHASE4A_FILE_PREFIX}mismatch-b.md`,
        chargeSheetText: "Second case.",
      });

      await assert.rejects(
        () =>
          query(
            `
              insert into model_calls (
                case_id, run_id, stage, agent_role, attempt, model, status, validated_response
              )
              values ($1, $2, 'ADVOCATES', 'DEFENSE_1', 1, 'test-model', 'SUCCEEDED', '{}'::jsonb)
            `,
            [first.id, second.runs[0].id],
          ),
        isForeignKeyViolation,
      );
    });
  });
});
