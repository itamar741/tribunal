import { TribunalRunKind } from "../ai/configurations";
import { withClient, withTransaction } from "../db";
import { TRIBUNAL_RUN_COLUMNS, toRun, type RunRow } from "./run-mapping";
import {
  hasRequiredRunKinds,
  INITIAL_RUN_TYPES,
  sortInitialRuns,
} from "./runs";
import { TribunalRunStatus } from "./types";
import type {
  CaseRecord,
  CaseRepository,
  NewCaseInput,
  TribunalRunRecord,
} from "./types";

type CaseRow = {
  id: string;
  original_file_name: string;
  charge_sheet_text: string;
  created_at: Date;
};

function toRecord(row: CaseRow, runs: TribunalRunRecord[]): CaseRecord {
  const ordered = sortInitialRuns(runs);
  if (!hasRequiredRunKinds(ordered)) {
    throw new Error(`Case ${row.id} is missing required Tribunal Runs.`);
  }

  return {
    id: row.id,
    originalFileName: row.original_file_name,
    chargeSheetText: row.charge_sheet_text,
    createdAt: row.created_at,
    runs: ordered,
  };
}

export class PostgresCaseRepository implements CaseRepository {
  async create(input: NewCaseInput): Promise<CaseRecord> {
    return withTransaction(async (client) => {
      const caseResult = await client.query<CaseRow>(
        `
          insert into cases (original_file_name, charge_sheet_text)
          values ($1, $2)
          returning id, original_file_name, charge_sheet_text, created_at
        `,
        [input.originalFileName, input.chargeSheetText],
      );
      const caseRow = caseResult.rows[0];
      if (!caseRow) {
        throw new Error("Case insert returned no row.");
      }

      const runResult = await client.query<RunRow>(
        `
          insert into tribunal_runs (case_id, run_type, status)
          values
            ($1, $2, $4),
            ($1, $3, $4)
          returning ${TRIBUNAL_RUN_COLUMNS}
        `,
        [
          caseRow.id,
          TribunalRunKind.SAME_MODEL,
          TribunalRunKind.MIXED_MODELS,
          TribunalRunStatus.PENDING,
        ],
      );

      if (runResult.rows.length !== INITIAL_RUN_TYPES.length) {
        throw new Error("Tribunal Run insert did not return both runs.");
      }

      return toRecord(caseRow, runResult.rows.map(toRun));
    });
  }

  async getById(id: string): Promise<CaseRecord | null> {
    return withClient(async (client) => {
      const caseResult = await client.query<CaseRow>(
        `
          select id, original_file_name, charge_sheet_text, created_at
          from cases
          where id = $1
        `,
        [id],
      );
      const caseRow = caseResult.rows[0];
      if (!caseRow) {
        return null;
      }

      const runResult = await client.query<RunRow>(
        `
          select ${TRIBUNAL_RUN_COLUMNS}
          from tribunal_runs
          where case_id = $1
          order by run_type
        `,
        [id],
      );

      return toRecord(caseRow, runResult.rows.map(toRun));
    });
  }
}
