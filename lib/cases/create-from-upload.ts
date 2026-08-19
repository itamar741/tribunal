import {
  validateAndReadChargeSheet,
  type ChargeSheetValidationErrorCode,
} from "../charge-sheet";
import type { CaseRecord, CaseRepository } from "./types";

export type CreateCaseFromUploadResult =
  | { ok: true; case: CaseRecord }
  | {
      ok: false;
      code: ChargeSheetValidationErrorCode;
      message: string;
    };

/**
 * Validate one uploaded charge sheet, then persist a new Case.
 * Invalid uploads are not stored. Original file/blob is never stored.
 */
export async function createCaseFromUpload(
  file: File | null | undefined,
  repository: CaseRepository,
  options?: { extraFileCount?: number },
): Promise<CreateCaseFromUploadResult> {
  const validation = await validateAndReadChargeSheet(file, options);
  if (!validation.ok) {
    return validation;
  }

  const created = await repository.create({
    originalFileName: validation.value.fileName,
    chargeSheetText: validation.value.text,
  });

  return { ok: true, case: created };
}
