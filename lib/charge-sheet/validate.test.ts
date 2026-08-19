import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CHARGE_SHEET_BYTES } from "./constants";
import { validateAndReadChargeSheet } from "./validate";

function mdFile(name: string, contents: BlobPart): File {
  return new File([contents], name, { type: "text/markdown" });
}

function asciiBuffer(length: number, value = 0x61): ArrayBuffer {
  const buffer = new ArrayBuffer(length);
  new Uint8Array(buffer).fill(value);
  return buffer;
}

describe("validateAndReadChargeSheet", () => {
  it("accepts a valid non-empty .md file", async () => {
    const result = await validateAndReadChargeSheet(
      mdFile("charge.md", "The defendant is accused of fraud."),
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.fileName, "charge.md");
      assert.equal(
        result.value.text,
        "The defendant is accused of fraud.",
      );
    }
  });

  it("accepts a mixed-case .MD extension", async () => {
    const result = await validateAndReadChargeSheet(
      mdFile("Charge.MD", "# Charge sheet\n\nAccused of fraud."),
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.fileName, "Charge.MD");
    }
  });

  it("accepts a file of exactly 1 MB", async () => {
    const result = await validateAndReadChargeSheet(
      mdFile("full.md", asciiBuffer(MAX_CHARGE_SHEET_BYTES)),
    );

    assert.equal(result.ok, true);
  });

  it("rejects an empty .md file", async () => {
    const result = await validateAndReadChargeSheet(mdFile("empty.md", ""));

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "EMPTY_CONTENT");
    }
  });

  it("rejects a whitespace-only .md file", async () => {
    const result = await validateAndReadChargeSheet(
      mdFile("blank.md", "  \n\t  "),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "EMPTY_CONTENT");
    }
  });

  it("rejects a .txt file", async () => {
    const result = await validateAndReadChargeSheet(
      new File(["plain text charge"], "charge.txt", { type: "text/plain" }),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_EXTENSION");
    }
  });

  it("rejects a non-.md file", async () => {
    const result = await validateAndReadChargeSheet(
      new File(["not markdown support"], "charge.pdf", {
        type: "application/pdf",
      }),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_EXTENSION");
    }
  });

  it("rejects a missing file", async () => {
    const result = await validateAndReadChargeSheet(null);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "MISSING_FILE");
    }
  });

  it("rejects a file over 1 MB", async () => {
    const result = await validateAndReadChargeSheet(
      mdFile(
        "huge.md",
        asciiBuffer(MAX_CHARGE_SHEET_BYTES + 1),
      ),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "FILE_TOO_LARGE");
    }
  });

  it("rejects malformed UTF-8 instead of replacing it", async () => {
    const result = await validateAndReadChargeSheet(
      mdFile("bad.md", Uint8Array.of(0x80, 0xff).buffer),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_UTF8");
    }
  });
});
