import type { AgentRoleView } from "./types";

export type LiveExecutionRunType = "SAME_MODEL" | "MIXED_MODELS";
export type LiveSeatStatus = "LOADING" | "FAILED";

export type LiveSeatUpdate = {
  role: AgentRoleView;
  stage: "ADVOCATES" | "JUDGES";
  model: string;
  attempt: 1 | 2;
  modelSource: "PRIMARY" | "FALLBACK";
  recoveryCycle: number;
  status: LiveSeatStatus;
  draft: string;
};

export type LiveExecutionUpdates = Partial<
  Record<LiveExecutionRunType, Partial<Record<AgentRoleView, LiveSeatUpdate>>>
>;

type LiveProgressPayload = LiveSeatUpdate & {
  type: "attempt_started" | "draft_delta" | "attempt_succeeded" | "attempt_failed";
  runId: string;
  runKind: LiveExecutionRunType;
  errorType?: string;
  delta?: string;
};

export type LiveExecutionProgressHandler = (event: LiveProgressPayload) => void;

type StreamCompletion = { status: number; body: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function asProgress(value: unknown): LiveProgressPayload | null {
  if (!isRecord(value)) return null;
  const role = value.role;
  const stage = value.stage;
  const model = value.model;
  const attempt = value.attempt;
  const runKind = value.runKind;
  const type = value.type;
  if (
    typeof role !== "string" ||
    (stage !== "ADVOCATES" && stage !== "JUDGES") ||
    typeof model !== "string" ||
    (attempt !== 1 && attempt !== 2) ||
    (runKind !== "SAME_MODEL" && runKind !== "MIXED_MODELS") ||
    ![
      "attempt_started",
      "draft_delta",
      "attempt_succeeded",
      "attempt_failed",
    ].includes(String(type))
  ) {
    return null;
  }
  return value as LiveProgressPayload;
}

function asCompletion(value: unknown): StreamCompletion | null {
  if (!isRecord(value) || typeof value.status !== "number" || !("body" in value)) {
    return null;
  }
  return { status: value.status, body: value.body };
}

/**
 * Read the app's SSE execution stream. Model draft text never leaves this
 * function except through `onProgress`, so callers can keep it in React state
 * only and discard it when a final validated response is persisted.
 */
export async function readLiveExecution(
  url: string,
  onProgress: LiveExecutionProgressHandler,
  fetchImpl: typeof fetch = fetch,
): Promise<StreamCompletion | null> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
  });
  if (!response.ok || !response.body) {
    return { status: response.status, body: await response.json() };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completion: StreamCompletion | null = null;

  const consume = (event: string) => {
    const eventName = event
      .split(/\r?\n/)
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!eventName || !data) return;
    try {
      const payload = JSON.parse(data) as unknown;
      if (eventName === "model-progress") {
        const progress = asProgress(payload);
        if (progress) onProgress(progress);
      }
      if (eventName === "execution-complete") {
        completion = asCompletion(payload);
      }
    } catch {
      // A malformed progress event must not replace persisted Case results.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let separator = buffer.search(/\r?\n\r?\n/);
    while (separator >= 0) {
      const event = buffer.slice(0, separator);
      const length = buffer.startsWith("\r\n\r\n", separator) ? 4 : 2;
      buffer = buffer.slice(separator + length);
      consume(event);
      separator = buffer.search(/\r?\n\r?\n/);
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return completion;
}
