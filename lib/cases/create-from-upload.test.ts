import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { MAX_CHARGE_SHEET_BYTES } from "../charge-sheet/constants";
import { createCaseFromUpload } from "./create-from-upload";
import { isCaseId } from "./id";
import { InMemoryCaseRepository } from "./memory-repository";
import { hasRequiredRunKinds } from "./runs";
import { TribunalRunStatus } from "./types";

function mdFile(name: string, contents: BlobPart): File {
  return new File([contents], name, { type: "text/markdown" });
}

function asciiBuffer(length: number, value = 0x61): ArrayBuffer {
  const buffer = new ArrayBuffer(length);
  new Uint8Array(buffer).fill(value);
  return buffer;
}

describe("createCaseFromUpload", () => {
  it("creates a Case from a valid non-empty .md under 1 MB", async () => {
    const repository = new InMemoryCaseRepository();
    const result = await createCaseFromUpload(
      mdFile("charge.md", "The defendant is accused of fraud."),
      repository,
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(isCaseId(result.case.id), true);
      assert.equal(result.case.originalFileName, "charge.md");
      assert.equal(
        result.case.chargeSheetText,
        "The defendant is accused of fraud.",
      );
      assert.equal(repository.size, 1);
      assert.equal(result.case.runs.length, 2);
      assert.equal(hasRequiredRunKinds(result.case.runs), true);
      assert.deepEqual(
        result.case.runs.map((run) => run.runType).sort(),
        ["MIXED_MODELS", "SAME_MODEL"],
      );
      for (const run of result.case.runs) {
        assert.equal(isCaseId(run.id), true);
        assert.equal(run.caseId, result.case.id);
        assert.equal(run.status, TribunalRunStatus.PENDING);
        assert.notEqual(run.id, result.case.id);
      }
      assert.notEqual(result.case.runs[0].id, result.case.runs[1].id);
    }
  });

  it("returns a unique Case ID that can be retrieved", async () => {
    const repository = new InMemoryCaseRepository();
    const created = await createCaseFromUpload(
      mdFile("charge.md", "Accused of theft."),
      repository,
    );
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }

    const found = await repository.getById(created.case.id);
    assert.ok(found);
    assert.equal(found.id, created.case.id);
    assert.equal(found.originalFileName, "charge.md");
    assert.equal(found.chargeSheetText, "Accused of theft.");
    assert.equal(hasRequiredRunKinds(found.runs), true);
    assert.deepEqual(
      found.runs.map((run) => run.id).sort(),
      created.case.runs.map((run) => run.id).sort(),
    );
  });

  it("creates two independent Cases for identical uploads", async () => {
    const repository = new InMemoryCaseRepository();
    const fileContents = "# Charge\n\nSame content.";
    const first = await createCaseFromUpload(
      mdFile("same.md", fileContents),
      repository,
    );
    const second = await createCaseFromUpload(
      mdFile("same.md", fileContents),
      repository,
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) {
      return;
    }

    assert.notEqual(first.case.id, second.case.id);
    assert.equal(first.case.originalFileName, "same.md");
    assert.equal(second.case.originalFileName, "same.md");
    assert.equal(first.case.chargeSheetText, fileContents);
    assert.equal(second.case.chargeSheetText, fileContents);
    assert.equal(repository.size, 2);
    assert.equal(repository.runCount, 4);
    assert.equal(hasRequiredRunKinds(first.case.runs), true);
    assert.equal(hasRequiredRunKinds(second.case.runs), true);
    const allRunIds = [...first.case.runs, ...second.case.runs].map(
      (run) => run.id,
    );
    assert.equal(new Set(allRunIds).size, 4);
  });

  it("does not persist an invalid upload", async () => {
    const repository = new InMemoryCaseRepository();
    const result = await createCaseFromUpload(null, repository);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "MISSING_FILE");
    }
    assert.equal(repository.size, 0);
    assert.equal(repository.runCount, 0);
  });

  it("does not persist empty or whitespace-only files", async () => {
    const repository = new InMemoryCaseRepository();
    const empty = await createCaseFromUpload(mdFile("empty.md", ""), repository);
    const blank = await createCaseFromUpload(
      mdFile("blank.md", "  \n\t"),
      repository,
    );

    assert.equal(empty.ok, false);
    assert.equal(blank.ok, false);
    if (!empty.ok) {
      assert.equal(empty.code, "EMPTY_CONTENT");
    }
    if (!blank.ok) {
      assert.equal(blank.code, "EMPTY_CONTENT");
    }
    assert.equal(repository.size, 0);
    assert.equal(repository.runCount, 0);
  });

  it("does not persist a non-.md file", async () => {
    const repository = new InMemoryCaseRepository();
    const result = await createCaseFromUpload(
      new File(["plain"], "charge.txt", { type: "text/plain" }),
      repository,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_EXTENSION");
    }
    assert.equal(repository.size, 0);
  });

  it("does not persist a file over 1 MB", async () => {
    const repository = new InMemoryCaseRepository();
    const result = await createCaseFromUpload(
      mdFile(
        "huge.md",
        asciiBuffer(MAX_CHARGE_SHEET_BYTES + 1),
      ),
      repository,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "FILE_TOO_LARGE");
    }
    assert.equal(repository.size, 0);
  });

  it("does not persist malformed UTF-8", async () => {
    const repository = new InMemoryCaseRepository();
    const result = await createCaseFromUpload(
      mdFile("bad.md", Uint8Array.of(0x80, 0xff).buffer),
      repository,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_UTF8");
    }
    assert.equal(repository.size, 0);
  });

  it("returns null for an unknown Case ID", async () => {
    const repository = new InMemoryCaseRepository();
    const found = await repository.getById(
      "00000000-0000-4000-8000-000000000000",
    );
    assert.equal(found, null);
  });

  it("never stores an original file blob on the Case record", async () => {
    const repository = new InMemoryCaseRepository();
    const result = await createCaseFromUpload(
      mdFile("charge.md", "Accused of fraud."),
      repository,
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal("blob" in result.case, false);
    assert.equal("file" in result.case, false);
    assert.equal("bytes" in result.case, false);
    assert.deepEqual(Object.keys(result.case).sort(), [
      "chargeSheetText",
      "createdAt",
      "id",
      "originalFileName",
      "runs",
    ]);
  });
});

describe("Case schema", () => {
  it("persists text and file name, not an original file blob", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260817180000_create_cases.sql",
      ),
      "utf8",
    );

    assert.match(sql, /original_file_name/);
    assert.match(sql, /charge_sheet_text/);
    assert.doesNotMatch(sql, /bytea/i);
    assert.doesNotMatch(sql, /\bblob\b/i);
    assert.doesNotMatch(sql, /file_bytes/i);
  });
});

describe("Tribunal Run schema", () => {
  it("requires unique (case_id, run_type) and backfills existing Cases", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260819090000_create_tribunal_runs.sql",
      ),
      "utf8",
    );

    assert.match(sql, /create table tribunal_runs/i);
    assert.match(sql, /unique \(case_id, run_type\)/i);
    assert.match(sql, /SAME_MODEL/);
    assert.match(sql, /MIXED_MODELS/);
    assert.match(sql, /PENDING/);
    assert.match(sql, /insert into tribunal_runs/i);
    assert.match(sql, /from cases/i);
    assert.doesNotMatch(sql, /openrouter/i);
  });

  it("expands run lifecycle without rewriting the original table", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260819193000_expand_tribunal_run_lifecycle.sql",
      ),
      "utf8",
    );

    assert.match(sql, /PENDING/);
    assert.match(sql, /RUNNING/);
    assert.match(sql, /SUCCEEDED/);
    assert.match(sql, /FAILED/);
    assert.match(sql, /final_verdict/);
    assert.match(sql, /started_at/);
    assert.match(sql, /completed_at/);
    assert.match(sql, /failure_reason/);
    assert.doesNotMatch(sql, /drop table tribunal_runs/i);
    assert.doesNotMatch(sql, /openrouter/i);
  });

  it("corrects verdict terminology in a later append-only migration", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260824170000_verdict_justified_not_justified.sql",
      ),
      "utf8",
    );

    assert.match(sql, /JUSTIFIED/);
    assert.match(sql, /NOT_JUSTIFIED/);
    assert.match(sql, /tribunal_runs_final_verdict_check/);
    assert.match(sql, /tribunal_runs_lifecycle_check/);
    assert.doesNotMatch(sql, /drop table tribunal_runs/i);
  });
});

describe("Model Call schema", () => {
  it("records one auditable attempt without prompts or raw output", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260819193100_create_model_calls.sql",
      ),
      "utf8",
    );

    assert.match(sql, /create table model_calls/i);
    assert.match(sql, /unique \(run_id, agent_role, attempt\)/i);
    assert.match(sql, /foreign key \(run_id, case_id\)/i);
    assert.match(sql, /validated_response jsonb/i);
    assert.match(sql, /ADVOCATES/);
    assert.match(sql, /JUDGES/);
    assert.match(sql, /model_calls_case_id_idx/);
    assert.doesNotMatch(sql, /\bprompt\b/i);
    assert.doesNotMatch(sql, /raw_output/i);
    assert.doesNotMatch(sql, /reasoning/i);
    assert.doesNotMatch(sql, /openrouter/i);
  });
});

describe("isCaseId", () => {
  it("accepts a UUID and rejects other strings", () => {
    assert.equal(isCaseId("8f3c1a2e-4b5d-4e6f-8a90-1234567890ab"), true);
    assert.equal(isCaseId("not-a-uuid"), false);
    assert.equal(isCaseId(""), false);
  });
});
