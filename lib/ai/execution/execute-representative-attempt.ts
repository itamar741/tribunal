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
  ModelCallSource,
  type ModelCallRecord,
  type ModelCallRepository,
} from "../../model-calls";
import { outputStrategyForModel } from "./output-strategy";
import { classifyFailure } from "./failure-classification";
import { parseAdvocateResponse } from "./parse-advocate-response";
import type { ModelProgressListener } from "../../tribunal/model-progress";

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
  model?: string;
  modelSource?: ModelCallSource;
  recoveryCycle?: number;
  includeOutputContractCorrection?: boolean;
  apiKey: string;
};

export type ExecuteRepresentativeAttemptDeps = {
  modelCalls: ModelCallRepository;
  runs: RepresentativeAttemptRunRepository;
  completeChat?: ChatCompletionsPort;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  /** When true, the caller owns marking the Tribunal Run RUNNING. */
  skipMarkRunning?: boolean;
  onProgress?: ModelProgressListener;
};

export type RepresentativeAttemptFailure = {
  errorType: string;
  errorMessage: string;
  httpStatus: number | null;
  retryAfterHeader: string | null;
};

export type RepresentativeAttemptResult = {
  record: ModelCallRecord;
  response: AdvocateResponse | null;
  returnedModel: string | null;
  failure: RepresentativeAttemptFailure | null;
};

function requireRepresentativeRole(role: RepresentativeRole): RepresentativeRole {
  if (!Object.values(RepresentativeRole).includes(role)) {
    throw new Error(`Invalid representative role: ${String(role)}`);
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

function toAgentRole(role: RepresentativeRole): ModelCallRecord["agentRole"] {
  return role as ModelCallRecord["agentRole"];
}

export async function executeRepresentativeAttempt(
  input: ExecuteRepresentativeAttemptInput,
  deps: ExecuteRepresentativeAttemptDeps,
): Promise<RepresentativeAttemptResult> {
  const role = requireRepresentativeRole(input.role);
  const attempt = requireAttempt(input.attempt);
  const model = input.model ?? getModelIdForRole(input.runKind, role);
  const modelSource = input.modelSource ?? ModelCallSource.PRIMARY;
  const recoveryCycle = input.recoveryCycle ?? 1;
  const prompt = buildRepresentativePrompt({
    role,
    chargeSheetMarkdown: input.chargeSheetMarkdown,
    includeOutputContractCorrection: input.includeOutputContractCorrection,
  });

  if (attempt === 1 && !deps.skipMarkRunning) {
    await deps.runs.markRunning(input.runId);
  }

  const complete = deps.completeChat ?? completeChat;
  const progress = {
    runId: input.runId,
    runKind: input.runKind,
    role: toAgentRole(role),
    stage: ModelCallStage.ADVOCATES,
    model,
    attempt,
    modelSource,
    recoveryCycle,
  } as const;
  deps.onProgress?.({ type: "attempt_started", ...progress });
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
      onDelta: (delta) => deps.onProgress?.({ type: "draft_delta", ...progress, delta }),
    },
  );

  let status: (typeof ModelCallStatus)[keyof typeof ModelCallStatus] =
    ModelCallStatus.FAILED;
  let validatedResponse: AdvocateResponse | null = null;
  let errorType: string | null = null;
  let errorMessage: string | null = null;
  let failure: RepresentativeAttemptFailure | null = null;

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
    const parsed = parseAdvocateResponse(transport.content);
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
    stage: ModelCallStage.ADVOCATES,
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

  deps.onProgress?.(
    validatedResponse
      ? { type: "attempt_succeeded", ...progress }
      : { type: "attempt_failed", ...progress, errorType: errorType ?? "UNKNOWN" },
  );

  return {
    record,
    response: validatedResponse,
    returnedModel: transport.returnedModel,
    failure,
  };
}
