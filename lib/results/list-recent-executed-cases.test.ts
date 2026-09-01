import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, describe, it } from "node:test";
import { advocateResponseSchema } from "../ai/contracts";
import {
  ModelCallAgentRole,
  ModelCallStage,
  ModelCallStatus,
  PostgresModelCallRepository,
  type NewModelCallInput,
} from "../model-calls";
import { PostgresCaseRepository } from "../cases";
import { applyMigrations, closePool, query } from "../db";
import {
  listRecentExecutedCases,
  type ListRecentExecutedCasesSource,
  type RecentExecutedCaseRow,
} from "./list-recent-executed-cases";

type StoredRecentCase = {
  caseId: string;
  originalFileName: string;
  runs: Array<{ startedAt: Date | null }>;
  totalCosts: Array<string | null>;
};

class MemoryRecentCasesSource implements ListRecentExecutedCasesSource {
  readonly cases: StoredRecentCase[] = [];

  add(row: StoredRecentCase): void {
    this.cases.push(row);
  }

  async loadRecentExecutedCaseRows(
    limit: number,
  ): Promise<RecentExecutedCaseRow[]> {
    return this.cases
      .map((row) => {
        const started = row.runs
          .map((run) => run.startedAt)
          .filter((value): value is Date => value != null);
        if (started.length === 0) {
          return null;
        }
        const executedAt = started.reduce((latest, value) =>
          value > latest ? value : latest,
        );
        return {
          caseId: row.caseId,
          originalFileName: row.originalFileName,
          executedAt,
          totalCosts: row.totalCosts,
        };
      })
      .filter((row): row is RecentExecutedCaseRow => row != null)
      .sort((left, right) => {
        const delta = right.executedAt.getTime() - left.executedAt.getTime();
        if (delta !== 0) {
          return delta;
        }
        return right.caseId.localeCompare(left.caseId);
      })
      .slice(0, limit);
  }
}

function memoryCase(
  caseId: string,
  originalFileName: string,
  startedAt: Date | readonly [Date | null, Date | null],
  totalCosts: Array<string | null> = [],
): StoredRecentCase {
  const runs = Array.isArray(startedAt)
    ? startedAt.map((value) => ({ startedAt: value }))
    : [{ startedAt }, { startedAt: null }];
  return { caseId, originalFileName, runs, totalCosts };
}

describe("listRecentExecutedCases", () => {
  it("returns at most five Cases, newest executed first", async () => {
    const source = new MemoryRecentCasesSource();
    for (let index = 1; index <= 6; index += 1) {
      source.add(
        memoryCase(
          `00000000-0000-4000-8000-00000000000${index}`,
          `case-${index}.md`,
          new Date(`2026-08-0${index}T12:00:00.000Z`),
        ),
      );
    }

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.equal(result.length, 5);
    assert.deepEqual(
      result.map((row) => row.originalFileName),
      ["case-6.md", "case-5.md", "case-4.md", "case-3.md", "case-2.md"],
    );
  });

  it("excludes Cases that were created and never started", async () => {
    const source = new MemoryRecentCasesSource();
    source.add(
      memoryCase(
        "00000000-0000-4000-8000-000000000001",
        "started.md",
        new Date("2026-08-29T12:00:00.000Z"),
      ),
    );
    source.add(
      memoryCase("00000000-0000-4000-8000-000000000002", "pending.md", [
        null,
        null,
      ]),
    );

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.originalFileName, "started.md");
  });

  it("orders by the latest Tribunal Run started_at", async () => {
    const source = new MemoryRecentCasesSource();
    source.add(
      memoryCase("00000000-0000-4000-8000-00000000000a", "older-latest.md", [
        new Date("2026-08-01T12:00:00.000Z"),
        new Date("2026-08-29T18:00:00.000Z"),
      ]),
    );
    source.add(
      memoryCase("00000000-0000-4000-8000-00000000000b", "newer-first-run.md", [
        new Date("2026-08-20T12:00:00.000Z"),
        new Date("2026-08-20T12:01:00.000Z"),
      ]),
    );

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.deepEqual(
      result.map((row) => row.originalFileName),
      ["older-latest.md", "newer-first-run.md"],
    );
    assert.equal(
      result[0]?.executedAt.toISOString(),
      "2026-08-29T18:00:00.000Z",
    );
  });

  it("aggregates every Model Call attempt for the Case", async () => {
    const source = new MemoryRecentCasesSource();
    source.add(
      memoryCase(
        "00000000-0000-4000-8000-00000000000c",
        "costs.md",
        new Date("2026-08-29T12:00:00.000Z"),
        ["0.00003000", "0.00000300", "0.00001000"],
      ),
    );

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.deepEqual(result[0]?.totalCost, {
      value: "0.000043",
      complete: true,
    });
  });

  it("keeps a provider-reported zero as a known complete zero", async () => {
    const source = new MemoryRecentCasesSource();
    source.add(
      memoryCase(
        "00000000-0000-4000-8000-00000000000d",
        "zero.md",
        new Date("2026-08-29T12:00:00.000Z"),
        ["0", "0"],
      ),
    );

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.deepEqual(result[0]?.totalCost, { value: "0", complete: true });
  });

  it("returns the known subtotal with complete: false when a cost is unknown", async () => {
    const source = new MemoryRecentCasesSource();
    source.add(
      memoryCase(
        "00000000-0000-4000-8000-00000000000e",
        "incomplete.md",
        new Date("2026-08-29T12:00:00.000Z"),
        ["0.0124", null],
      ),
    );

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.deepEqual(result[0]?.totalCost, {
      value: "0.0124",
      complete: false,
    });
  });

  it("treats an executed Case with no Model Calls as a known complete zero", async () => {
    const source = new MemoryRecentCasesSource();
    source.add(
      memoryCase(
        "00000000-0000-4000-8000-00000000000f",
        "started-only.md",
        new Date("2026-08-29T12:00:00.000Z"),
      ),
    );

    const result = await listRecentExecutedCases({ limit: 5 }, { source });
    assert.deepEqual(result[0]?.totalCost, { value: "0", complete: true });
  });
});

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
const RECENT_FILE_PREFIX = "recent-exec-verify-";

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

function callInput(
  overrides: Pick<NewModelCallInput, "caseId" | "runId" | "agentRole"> &
    Partial<NewModelCallInput>,
): NewModelCallInput {
  return {
    stage: ModelCallStage.ADVOCATES,
    attempt: 1,
    model: "test-model",
    status: ModelCallStatus.SUCCEEDED,
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    inputCost: "0.00001000",
    outputCost: "0.00002000",
    totalCost: "0.00003000",
    durationMs: 100,
    providerCallId: "gen-recent-test",
    validatedResponse: advocateResponse(),
    errorType: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("listRecentExecutedCases PostgreSQL", {
  skip: !databaseConfigured,
  concurrency: 1,
}, () => {
  after(async () => {
    await query("delete from cases where original_file_name like $1", [
      `${RECENT_FILE_PREFIX}%`,
    ]);
    await closePool();
  });

  it("uses one bounded SQL query: max five, newest first, never-started excluded", async () => {
    await applyMigrations();
    const cases = new PostgresCaseRepository();
    const modelCalls = new PostgresModelCallRepository();
    const created = [];

    const pending = await cases.create({
      originalFileName: `${RECENT_FILE_PREFIX}pending.md`,
      chargeSheetText: "# Pending",
    });

    for (let index = 0; index < 6; index += 1) {
      const record = await cases.create({
        originalFileName: `${RECENT_FILE_PREFIX}${index}.md`,
        chargeSheetText: `# Recent ${index}`,
      });
      const startedAt = new Date(Date.UTC(2099, 0, 1, 12, 0, index));
      await query(
        `
          update tribunal_runs
          set status = 'RUNNING', started_at = $2
          where id = $1
        `,
        [record.runs[0].id, startedAt],
      );
      created.push(record);
    }

    const newest = created[5];
    if (!newest) {
      throw new Error("Expected six executed Cases.");
    }
    await modelCalls.insert(
      callInput({
        caseId: newest.id,
        runId: newest.runs[0].id,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        totalCost: "0.00003000",
      }),
    );
    await modelCalls.insert(
      callInput({
        caseId: newest.id,
        runId: newest.runs[0].id,
        agentRole: ModelCallAgentRole.DEFENSE_1,
        attempt: 2,
        totalCost: "0.00000300",
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "HTTP_ERROR",
        errorMessage: "OpenRouter HTTP 429",
      }),
    );
    await modelCalls.insert(
      callInput({
        caseId: newest.id,
        runId: newest.runs[1].id,
        agentRole: ModelCallAgentRole.PROSECUTION_1,
        totalCost: null,
        status: ModelCallStatus.FAILED,
        validatedResponse: null,
        errorType: "TIMEOUT",
        errorMessage: "The provider request timed out.",
      }),
    );

    const laterSibling = new Date(Date.UTC(2099, 0, 1, 12, 0, 30));
    await query(
      `
        update tribunal_runs
        set status = 'RUNNING', started_at = $2
        where id = $1
      `,
      [created[0]?.runs[1].id, laterSibling],
    );

    const result = await listRecentExecutedCases({ limit: 5 });
    const ours = result.filter((row) =>
      row.originalFileName.startsWith(RECENT_FILE_PREFIX),
    );

    assert.equal(ours.length, 5);
    assert.equal(
      result.some((row) => row.caseId === pending.id),
      false,
    );
    assert.deepEqual(
      ours.map((row) => row.originalFileName),
      [
        `${RECENT_FILE_PREFIX}0.md`,
        `${RECENT_FILE_PREFIX}5.md`,
        `${RECENT_FILE_PREFIX}4.md`,
        `${RECENT_FILE_PREFIX}3.md`,
        `${RECENT_FILE_PREFIX}2.md`,
      ],
    );
    assert.equal(
      ours[0]?.executedAt.toISOString(),
      laterSibling.toISOString(),
    );

    const newestRow = ours.find((row) => row.caseId === newest.id);
    assert.deepEqual(newestRow?.totalCost, {
      value: "0.000033",
      complete: false,
    });
  });
});
