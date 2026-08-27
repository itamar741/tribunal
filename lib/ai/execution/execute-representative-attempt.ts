import {
  getModelIdForRole,
  type TribunalRunKind,
} from "../configurations";
import {
  ADVOCATE_RESPONSE_JSON_SCHEMA_NAME,
  advocateResponseJsonSchema,
  type AdvocateResponse,
} from "../contracts";
import { completeChat } from "../openrouter";
import type {
  OpenRouterChatCompletionInput,
  OpenRouterChatCompletionResult,
  OpenRouterClientOptions,
} from "../openrouter";
import { RepresentativeRole } from "../profiles";
import { buildRepresentativePrompt } from "../prompts";
import {
  ModelCallStage,
  ModelCallStatus,
  type ModelCallAttempt,
  type ModelCallRecord,
  type ModelCallRepository,
} from "../../model-calls";
import { outputStrategyForModel } from "./output-strategy";
import { parseAdvocateResponse } from "./parse-advocate-response";

export type ChatCompletionsPort = (
  input: OpenRouterChatCompletionInput,
  options: OpenRouterClientOptions,
) => Promise<OpenRouterChatCompletionResult>;

export type RepresentativeAttemptRunRepository = {
  markRunning(runId: string): Promise<unknown>;
};

export type ExecuteRepresentativeAttemptInput = {
  caseId: string;
  runId: string;
  runKind: TribunalRunKind;
  role: RepresentativeRole;
  chargeSheetMarkdown: string;
  attempt?: ModelCallAttempt;
  apiKey: string;
};

export type ExecuteRepresentativeAttemptDeps = {
  modelCalls: ModelCallRepository;
  runs: RepresentativeAttemptRunRepository;
  completeChat?: ChatCompletionsPort;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

export type RepresentativeAttemptResult = {
  record: ModelCallRecord;
  response: AdvocateResponse | null;
  returnedModel: string | null;
};

function requireRepresentativeRole(role: RepresentativeRole): RepresentativeRole {
  if (!Object.values(RepresentativeRole).includes(role)) {
    throw new Error(`Invalid representative role: ${String(role)}`);
  }
  return role;
}

function toAgentRole(role: RepresentativeRole): ModelCallRecord["agentRole"] {
  return role as ModelCallRecord["agentRole"];
}

export async function executeRepresentativeAttempt(
  input: ExecuteRepresentativeAttemptInput,
  deps: ExecuteRepresentativeAttemptDeps,
): Promise<RepresentativeAttemptResult> {
  const role = requireRepresentativeRole(input.role);
  const attempt = input.attempt ?? 1;
  const model = getModelIdForRole(input.runKind, role);
  const prompt = buildRepresentativePrompt({
    role,
    chargeSheetMarkdown: input.chargeSheetMarkdown,
  });

  await deps.runs.markRunning(input.runId);

  const complete = deps.completeChat ?? completeChat;
  const transport = await complete(
    {
      model,
      messages: prompt.messages,
      output: outputStrategyForModel(model, {
        name: ADVOCATE_RESPONSE_JSON_SCHEMA_NAME,
        schema: advocateResponseJsonSchema(),
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
  let validatedResponse: AdvocateResponse | null = null;
  let errorType: string | null = null;
  let errorMessage: string | null = null;

  if (!transport.ok) {
    errorType = transport.errorType;
    errorMessage = transport.errorMessage;
  } else {
    const parsed = parseAdvocateResponse(transport.content);
    if (parsed.ok) {
      status = ModelCallStatus.SUCCEEDED;
      validatedResponse = parsed.value;
    } else {
      errorType = parsed.errorType;
      errorMessage = parsed.errorMessage;
    }
  }

  const record = await deps.modelCalls.insert({
    caseId: input.caseId,
    runId: input.runId,
    stage: ModelCallStage.ADVOCATES,
    agentRole: toAgentRole(role),
    attempt,
    model,
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
  });

  return {
    record,
    response: validatedResponse,
    returnedModel: transport.returnedModel,
  };
}
