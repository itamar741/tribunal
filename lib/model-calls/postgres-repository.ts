import { withClient } from "../db";
import {
  ModelCallAgentRole,
  ModelCallStage,
  ModelCallStatus,
  ModelCallSource,
  type ModelCallRecord,
  type ModelCallRepository,
  type NewModelCallInput,
} from "./types";

type ModelCallRow = {
  id: string;
  case_id: string;
  run_id: string;
  stage: string;
  agent_role: string;
  attempt: number;
  model: string;
  model_source: string;
  recovery_cycle: number;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  input_cost: string | null;
  output_cost: string | null;
  total_cost: string | null;
  duration_ms: number | null;
  provider_call_id: string | null;
  validated_response: unknown;
  error_type: string | null;
  error_message: string | null;
  failure_classification: string | null;
  created_at: Date;
};

const MODEL_CALL_COLUMNS = `
  id,
  case_id,
  run_id,
  stage,
  agent_role,
  attempt,
  model,
  model_source,
  recovery_cycle,
  status,
  input_tokens,
  output_tokens,
  total_tokens,
  input_cost,
  output_cost,
  total_cost,
  duration_ms,
  provider_call_id,
  validated_response,
  error_type,
  error_message,
  failure_classification,
  created_at
`;

const MODEL_CALL_ORDER = `
  case
    when stage = 'ADVOCATES' then 0
    when stage = 'JUDGES' then 1
    else 2
  end,
  case agent_role
    when 'DEFENSE_1' then 0
    when 'DEFENSE_2' then 1
    when 'PROSECUTION_1' then 2
    when 'PROSECUTION_2' then 3
    when 'JUDGE_1' then 4
    when 'JUDGE_2' then 5
    when 'JUDGE_3' then 6
    else 7
  end,
  recovery_cycle,
  case model_source
    when 'PRIMARY' then 0
    when 'FALLBACK' then 1
    else 2
  end,
  attempt,
  created_at,
  id
`;

function isModelCallStage(value: string): value is ModelCallRecord["stage"] {
  return Object.values(ModelCallStage).includes(value as ModelCallRecord["stage"]);
}

function isModelCallAgentRole(
  value: string,
): value is ModelCallRecord["agentRole"] {
  return Object.values(ModelCallAgentRole).includes(
    value as ModelCallRecord["agentRole"],
  );
}

function isModelCallStatus(value: string): value is ModelCallRecord["status"] {
  return Object.values(ModelCallStatus).includes(
    value as ModelCallRecord["status"],
  );
}

function isModelCallSource(value: string): value is ModelCallSource {
  return Object.values(ModelCallSource).includes(value as ModelCallSource);
}

function isModelCallAttempt(
  value: number,
): value is ModelCallRecord["attempt"] {
  return value === 1 || value === 2;
}

function toCost(value: string | null): string | null {
  if (value == null) {
    return null;
  }
  if (!value.includes(".")) {
    return value;
  }
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function toRecord(row: ModelCallRow): ModelCallRecord {
  if (!isModelCallStage(row.stage)) {
    throw new Error(`Unexpected Model Call stage: ${row.stage}`);
  }
  if (!isModelCallAgentRole(row.agent_role)) {
    throw new Error(`Unexpected Model Call agent role: ${row.agent_role}`);
  }
  if (!isModelCallAttempt(row.attempt)) {
    throw new Error(`Unexpected Model Call attempt: ${row.attempt}`);
  }
  if (!isModelCallStatus(row.status)) {
    throw new Error(`Unexpected Model Call status: ${row.status}`);
  }
  if (!isModelCallSource(row.model_source) || row.recovery_cycle < 1) {
    throw new Error("Unexpected Model Call recovery provenance.");
  }

  return {
    id: row.id,
    caseId: row.case_id,
    runId: row.run_id,
    stage: row.stage,
    agentRole: row.agent_role,
    attempt: row.attempt,
    model: row.model,
    modelSource: row.model_source,
    recoveryCycle: row.recovery_cycle,
    status: row.status,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    inputCost: toCost(row.input_cost),
    outputCost: toCost(row.output_cost),
    totalCost: toCost(row.total_cost),
    durationMs: row.duration_ms,
    providerCallId: row.provider_call_id,
    validatedResponse: row.validated_response,
    errorType: row.error_type,
    errorMessage: row.error_message,
    failureClassification: row.failure_classification,
    createdAt: row.created_at,
  };
}

export class PostgresModelCallRepository implements ModelCallRepository {
  async insert(input: NewModelCallInput): Promise<ModelCallRecord> {
    return withClient(async (client) => {
      const result = await client.query<ModelCallRow>(
        `
          insert into model_calls (
            case_id,
            run_id,
            stage,
            agent_role,
            attempt,
            model,
            model_source,
            recovery_cycle,
            status,
            input_tokens,
            output_tokens,
            total_tokens,
            input_cost,
            output_cost,
            total_cost,
            duration_ms,
            provider_call_id,
            validated_response,
            error_type,
            error_message,
            failure_classification
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21
          )
          returning ${MODEL_CALL_COLUMNS}
        `,
        [
          input.caseId,
          input.runId,
          input.stage,
          input.agentRole,
          input.attempt,
          input.model,
          input.modelSource ?? ModelCallSource.PRIMARY,
          input.recoveryCycle ?? 1,
          input.status,
          input.inputTokens,
          input.outputTokens,
          input.totalTokens,
          input.inputCost,
          input.outputCost,
          input.totalCost,
          input.durationMs,
          input.providerCallId,
          input.validatedResponse,
          input.errorType,
          input.errorMessage,
          input.failureClassification ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Model Call insert returned no row.");
      }
      return toRecord(row);
    });
  }

  async listByRunId(runId: string): Promise<ModelCallRecord[]> {
    return withClient(async (client) => {
      const result = await client.query<ModelCallRow>(
        `
          select ${MODEL_CALL_COLUMNS}
          from model_calls
          where run_id = $1
          order by ${MODEL_CALL_ORDER}
        `,
        [runId],
      );
      return result.rows.map(toRecord);
    });
  }

  async listByCaseId(caseId: string): Promise<ModelCallRecord[]> {
    return withClient(async (client) => {
      const result = await client.query<ModelCallRow>(
        `
          select ${MODEL_CALL_COLUMNS}
          from model_calls
          where case_id = $1
          order by
            run_id,
            ${MODEL_CALL_ORDER}
        `,
        [caseId],
      );
      return result.rows.map(toRecord);
    });
  }
}
