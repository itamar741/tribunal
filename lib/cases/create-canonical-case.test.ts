import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANONICAL_CHARGE_SHEET_FIXTURE_PATH } from "../charge-sheet/canonical";
import { createCanonicalCase, loadCanonicalChargeSheet } from "./create-canonical-case";
import { InMemoryCaseRepository } from "./memory-repository";

describe("createCanonicalCase", () => {
  it("persists the server-owned canonical fixture with two pending Runs", async () => {
    const repository = new InMemoryCaseRepository();
    const source = await loadCanonicalChargeSheet();
    const created = await createCanonicalCase(repository);

    assert.equal(
      created.originalFileName,
      CANONICAL_CHARGE_SHEET_FIXTURE_PATH.split("/").at(-1),
    );
    assert.equal(created.chargeSheetText, source.text);
    assert.deepEqual(
      created.runs.map((run) => [run.runType, run.status]),
      [
        ["SAME_MODEL", "PENDING"],
        ["MIXED_MODELS", "PENDING"],
      ],
    );
  });

  it("creates a fresh Case for every launch", async () => {
    const repository = new InMemoryCaseRepository();
    const loadSource = async () => ({ fileName: "canonical.md", text: "# Charge" });

    const first = await createCanonicalCase(repository, loadSource);
    const second = await createCanonicalCase(repository, loadSource);

    assert.notEqual(first.id, second.id);
    assert.equal(repository.size, 2);
    assert.equal(repository.runCount, 4);
  });
});
