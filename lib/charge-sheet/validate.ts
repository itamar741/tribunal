import { MAX_CHARGE_SHEET_BYTES } from "./constants";
import type {
  ChargeSheetValidationResult,
  ValidatedChargeSheet,
} from "./types";

const MD_EXTENSION = /\.md$/i;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function isMdFileName(fileName: string): boolean {
  return MD_EXTENSION.test(fileName.trim());
}

function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

/**
 * Server-authoritative validation and UTF-8 text read for a charge sheet.
 * Returns validated Markdown text only — no parsing, rendering, or persistence.
 * Malformed UTF-8 is rejected rather than replaced.
 */
export async function validateAndReadChargeSheet(
  file: File | null | undefined,
  options?: { extraFileCount?: number },
): Promise<ChargeSheetValidationResult> {
  const extraFileCount = options?.extraFileCount ?? 0;

  if (extraFileCount > 0) {
    return {
      ok: false,
      code: "TOO_MANY_FILES",
      message: "Only one charge sheet file may be uploaded.",
    };
  }

  if (!file) {
    return {
      ok: false,
      code: "MISSING_FILE",
      message: "A charge sheet file is required.",
    };
  }

  if (!isMdFileName(file.name)) {
    return {
      ok: false,
      code: "INVALID_EXTENSION",
      message: "Only .md charge sheet files are supported.",
    };
  }

  if (file.size > MAX_CHARGE_SHEET_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "Charge sheet files must be 1 MB or smaller.",
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      code: "UNREADABLE_TEXT",
      message: "The charge sheet file could not be read as text.",
    };
  }

  if (bytes.byteLength > MAX_CHARGE_SHEET_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "Charge sheet files must be 1 MB or smaller.",
    };
  }

  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch {
    return {
      ok: false,
      code: "INVALID_UTF8",
      message: "The charge sheet file must be valid UTF-8.",
    };
  }

  if (text.trim().length === 0) {
    return {
      ok: false,
      code: "EMPTY_CONTENT",
      message: "The charge sheet file must contain non-empty text.",
    };
  }

  const value: ValidatedChargeSheet = {
    fileName: file.name,
    text,
  };

  return { ok: true, value };
}
