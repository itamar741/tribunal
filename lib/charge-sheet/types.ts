/**
 * Validated charge-sheet text ready for later application stages.
 * Upload transport details are intentionally excluded.
 */
export type ValidatedChargeSheet = {
  fileName: string;
  text: string;
};

export type ChargeSheetValidationErrorCode =
  | "MISSING_FILE"
  | "TOO_MANY_FILES"
  | "INVALID_EXTENSION"
  | "FILE_TOO_LARGE"
  | "INVALID_UTF8"
  | "UNREADABLE_TEXT"
  | "EMPTY_CONTENT";

export type ChargeSheetValidationResult =
  | { ok: true; value: ValidatedChargeSheet }
  | {
      ok: false;
      code: ChargeSheetValidationErrorCode;
      message: string;
    };
