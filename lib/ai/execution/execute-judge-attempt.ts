import {
  getModelIdForRole,
  type TribunalRunKind,
} from "../configurations";
import {
  JUDGE_RESPONSE_JSON_SCHEMA_NAME,
  judgeResponseJsonSchema,
  type JudgeResponse,
} from "../contracts";
import { completeChat } from "../openrouter";
import type { OpenRouterChatCompletionResult } from "../openrouter";
import { JudgeRole, isJudgeRole } from "../profiles";
import { buildJudgePrompt, type JudgeAdvocateResponses } from "../prompts";
import {
  ModelCallStage,
  ModelCallStatus,
  type ModelCallAttempt,
  ModelCallSource,
  type ModelCallRecord,
  type ModelCallRepository,
} from "../../model-calls";
import type { ChatCompletionsPort } from "./execute-representative-attempt";
import { outputStrategyForModel } from "./output-strategy";
import { classifyFailure } from "./failure-classification";
import { parseJudgeResponse } from "./parse-judge-response";

export type ExecuteJudgeAttemptInput = {
  caseId: string;
  runId: string;
  runKind: TribunalRunKind;
  role: JudgeRole;
  chargeSheetMarkdown: string;
  advocateResponses: JudgeAdvocateResponses;
  attempt?: ModelCallAttempt;
  model?: string;
  modelSource?: ModelCallSource;
  recoveryCycle?: number;
  includeOutputContractCorrection?: boolean;
  apiKey: string;
};

export type ExecuteJudgeAttemptDeps = {
  modelCalls: ModelCallRepository;
  completeChat?: ChatCompletionsPort;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

export type JudgeAttemptFailure = {
  errorType: string;
  errorMessage: string;
  httpStatus: number | null;
  retryAfterHeader: string | null;
};

export type JudgeAttemptResult = {
  record: ModelCallRecord;
  response: JudgeResponse | null;
  returnedModel: string | null;
  failure: JudgeAttemptFailure | null;
};

function requireJudgeRole(role: JudgeRole): JudgeRole {
  if (!isJudgeRole(role)) {
    throw new Error(`Invalid judge role: ${String(role)}`);
  }
  return role;
}

function requireAttempt(attempt: ModelCallAttempt | undefined): ModelCallAttempt {
  const value = attempt ?? 1;
  if (value !== 1 && value !== 2) {
    throw new Error(`Invalid model-call attempt: ${String(value)}`);
  }
  return value;
}

function toAgentRole(role: JudgeRole): ModelCallRecord["agentRole"] {
  return role as ModelCallRecord["agentRole"];
}

/**
 * One Judge API attempt. Does not mark the Tribunal Run RUNNING,
 * SUCCEEDED, or FAILED.
 */
export async function executeJudgeAttempt(
  input: ExecuteJudgeAttemptInput,
  deps: ExecuteJudgeAttemptDeps,
): Promise<JudgeAttemptResult> {
  const role = requireJudgeRole(input.role);
  const attempt = requireAttempt(input.attempt);
  const model = input.model ?? getModelIdForRole(input.runKind, role);
  const modelSource = input.modelSource ?? ModelCallSource.PRIMARY;
  const recoveryCycle = input.recoveryCycle ?? 1;
  const prompt = buildJudgePrompt({
    role,
    chargeSheetMarkdown: input.chargeSheetMarkdown,
    advocateResponses: input.advocateResponses,
    includeOutputContractCorrection: input.includeOutputContractCorrection,
  });

  const complete = deps.completeChat ?? completeChat;
  const transport: OpenRouterChatCompletionResult = await complete(
    {
      model,
      messages: prompt.messages,
      output: outputStrategyForModel(model, {
        name: JUDGE_RESPONSE_JSON_SCHEMA_NAME,
        schema: judgeResponseJsonSchema(),
      }),
    },
    {
      apiKey: input.apiKey,
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
      now: deps.now,
    },
  );

  let status: (typeof ModelCallStatus)[keyof typeof ModelCallStatus] =
    ModelCallStatus.FAILED;
  let validatedResponse: JudgeResponse | null = null;
  let errorType: string | null = null;
  let errorMessage: string | null = null;
  let failure: JudgeAttemptFailure | null = null;

  if (!transport.ok) {
    errorType = transport.errorType;
    errorMessage = transport.errorMessage;
    failure = {
      errorType: transport.errorType,
      errorMessage: transport.errorMessage,
      httpStatus: transport.httpStatus,
      retryAfterHeader: transport.retryAfterHeader ?? null,
    };
  } else {
    const parsed = parseJudgeResponse(transport.content);
    if (parsed.ok) {
      status = ModelCallStatus.SUCCEEDED;
      validatedResponse = parsed.value;
    } else {
      errorType = parsed.errorType;
      errorMessage = parsed.errorMessage;
      failure = {
        errorType: parsed.errorType,
        errorMessage: parsed.errorMessage,
        httpStatus: null,
        retryAfterHeader: null,
      };
    }
  }

  const record = await deps.modelCalls.insert({
    caseId: input.caseId,
    runId: input.runId,
    stage: ModelCallStage.JUDGES,
    agentRole: toAgentRole(role),
    attempt,
    model,
    modelSource,
    recoveryCycle,
    status,
    inputTokens: transport.usage.promptTokens,
    outputTokens: transport.usage.completionTokens,
    totalTokens: transport.usage.totalTokens,
    inputCost: null,
    outputCost: null,
    totalCost: transport.usage.totalCost,
    durationMs: transport.durationMs,
    providerCallId: transport.providerCallId,
    validatedResponse,
    errorType,
    errorMessage,
    failureClassification: failure ? classifyFailure({ errorType: failure.errorType, httpStatus: failure.httpStatus }).classification : null,
  });

  return {
    record,
    response: validatedResponse,
    returnedModel: transport.returnedModel,
    failure,
  };
}
