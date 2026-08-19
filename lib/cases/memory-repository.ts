import { randomUUID } from "node:crypto";
import { INITIAL_RUN_TYPES, sortInitialRuns } from "./runs";
import { TribunalRunStatus } from "./types";
import type { CaseRecord, CaseRepository, NewCaseInput } from "./types";

export class InMemoryCaseRepository implements CaseRepository {
  private readonly records = new Map<string, CaseRecord>();

  async create(input: NewCaseInput): Promise<CaseRecord> {
    const createdAt = new Date();
    const id = randomUUID();
    const record: CaseRecord = {
      id,
      originalFileName: input.originalFileName,
      chargeSheetText: input.chargeSheetText,
      createdAt,
      runs: sortInitialRuns(
        INITIAL_RUN_TYPES.map((runType) => ({
          id: randomUUID(),
          caseId: id,
          runType,
          status: TribunalRunStatus.PENDING,
          createdAt,
        })),
      ),
    };
    this.records.set(record.id, record);
    return record;
  }

  async getById(id: string): Promise<CaseRecord | null> {
    return this.records.get(id) ?? null;
  }

  get size(): number {
    return this.records.size;
  }

  get runCount(): number {
    let count = 0;
    for (const record of this.records.values()) {
      count += record.runs.length;
    }
    return count;
  }
}
