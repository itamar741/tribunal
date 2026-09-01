import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CANONICAL_CHARGE_SHEET_FILE_NAME,
  CANONICAL_CHARGE_SHEET_FIXTURE_PATH,
} from "../charge-sheet/canonical";
import type { CaseRecord, CaseRepository } from "./types";

export type CanonicalChargeSheetSource = {
  fileName: string;
  text: string;
};

export async function loadCanonicalChargeSheet(): Promise<CanonicalChargeSheetSource> {
  const absolutePath = path.join(
    process.cwd(),
    "fixtures",
    "charge-sheets",
    CANONICAL_CHARGE_SHEET_FILE_NAME,
  );
  const text = await readFile(absolutePath, "utf8");

  if (text.trim().length === 0) {
    throw new Error("The canonical charge sheet is empty.");
  }

  return {
    fileName: path.basename(CANONICAL_CHARGE_SHEET_FIXTURE_PATH),
    text,
  };
}

/** Create a fresh Case from the server-owned canonical Tribunal record. */
export async function createCanonicalCase(
  repository: CaseRepository,
  loadSource: () => Promise<CanonicalChargeSheetSource> = loadCanonicalChargeSheet,
): Promise<CaseRecord> {
  const source = await loadSource();
  return repository.create({
    originalFileName: source.fileName,
    chargeSheetText: source.text,
  });
}
