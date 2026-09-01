import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  CANONICAL_CHARGE_SHEET_CASE_ID,
  CANONICAL_CHARGE_SHEET_FILE_NAME,
  CANONICAL_CHARGE_SHEET_FIXTURE_PATH,
  CANONICAL_CHARGE_SHEET_SECTION_LABELS,
  CANONICAL_CHARGE_SHEET_TITLE,
} from "./canonical";

describe("canonical T-001 charge sheet fixture", () => {
  it("is a valid non-empty Markdown charge sheet with the instructor labels", async () => {
    const fixturePath = path.join(
      process.cwd(),
      CANONICAL_CHARGE_SHEET_FIXTURE_PATH,
    );
    const text = await readFile(fixturePath, "utf8");

    assert.equal(text.trim().length > 0, true);
    assert.match(text, new RegExp(CANONICAL_CHARGE_SHEET_CASE_ID));
    assert.match(text, new RegExp(CANONICAL_CHARGE_SHEET_TITLE));
    for (const label of CANONICAL_CHARGE_SHEET_SECTION_LABELS) {
      assert.match(text, new RegExp(label));
    }

    assert.equal(
      path.basename(CANONICAL_CHARGE_SHEET_FIXTURE_PATH),
      CANONICAL_CHARGE_SHEET_FILE_NAME,
    );
  });
});
