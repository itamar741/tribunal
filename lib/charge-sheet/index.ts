/**
 * Charge-sheet input boundary.
 *
 * Upload transport (HTTP multipart) stays in the route handler.
 * This module validates and reads `.md` UTF-8 text for later stages.
 * Markdown is not parsed or rendered here. Original uploads are not persisted.
 */

export { MAX_CHARGE_SHEET_BYTES } from "./constants";
export { isMdFileName, validateAndReadChargeSheet } from "./validate";
export type {
  ChargeSheetValidationErrorCode,
  ChargeSheetValidationResult,
  ValidatedChargeSheet,
} from "./types";
