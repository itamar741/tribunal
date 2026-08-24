/**
 * Canonical instructor Case T-001 is a project fixture/reference.
 *
 * The instructor dossier supplies this example charge sheet. It is not a
 * complete generic Markdown grammar. Upload validation still reads `.md`
 * as UTF-8 text; do not parse these labels as a structural contract for
 * every charge sheet.
 *
 * The T-001 ISSUE asks whether Jon Snow's intentional killing of
 * Daenerys Targaryen was justified. Runtime verdicts for that question
 * are `JUSTIFIED` or `NOT_JUSTIFIED`.
 *
 * The fixture preserves the original dossier scope note, including the
 * line that the three opinions are not combined into one verdict. That
 * line is superseded for this project by the recorded majority
 * clarification: each run requires three valid judge opinions and a
 * two-of-three majority as the run's final verdict.
 */

export const CANONICAL_CHARGE_SHEET_CASE_ID = "T-001";

export const CANONICAL_CHARGE_SHEET_TITLE = "The Realm v. Jon Snow";

export const CANONICAL_CHARGE_SHEET_FIXTURE_PATH =
  "fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md";

export const CANONICAL_CHARGE_SHEET_SECTION_LABELS = [
  "Case T-001",
  "Accused",
  "Deceased",
  "Act alleged",
  "Base premises for readers new to the story",
  "Agreed factual record",
  "Question for judgment",
  "ISSUE",
  "Scope note",
] as const;
