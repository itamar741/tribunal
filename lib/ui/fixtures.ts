import type {
  AdvocateResponseView,
  CaseResultsView,
  JudgeResponseView,
  RunResultsView,
  UsageTotalsView,
} from "./types";

export function usage(
  overrides: Partial<UsageTotalsView> = {},
): UsageTotalsView {
  return {
    inputTokens: { value: 0, complete: true },
    outputTokens: { value: 0, complete: true },
    totalTokens: { value: 0, complete: true },
    inputCost: { value: "0", complete: true },
    outputCost: { value: "0", complete: true },
    totalCost: { value: "0", complete: true },
    durationMs: { value: 0, complete: true },
    attemptCount: 0,
    ...overrides,
  };
}

export function advocate(role: string): AdvocateResponseView {
  return {
    summary: `${role} summary from the charge sheet.`,
    arguments: [
      { title: `${role} one`, argument: "The record notes a surrender." },
      { title: `${role} two`, argument: "The record notes an embrace." },
      { title: `${role} three`, argument: "Unused alternatives remained." },
    ],
    conclusion: `${role} conclusion.`,
  };
}

export function judge(
  role: string,
  verdict: JudgeResponseView["verdict"],
): JudgeResponseView {
  return {
    verdict,
    summary: `${role} summary.`,
    key_reasons: [`${role} reason one.`, `${role} reason two.`, `${role} reason three.`],
  };
}

function emptyOutputs() {
  return {
    advocates: {
      DEFENSE_1: null,
      DEFENSE_2: null,
      PROSECUTION_1: null,
      PROSECUTION_2: null,
    },
    judges: {
      JUDGE_1: null,
      JUDGE_2: null,
      JUDGE_3: null,
    },
  };
}

function emptyAccounting() {
  return {
    agents: {
      DEFENSE_1: usage(),
      DEFENSE_2: usage(),
      PROSECUTION_1: usage(),
      PROSECUTION_2: usage(),
      JUDGE_1: usage(),
      JUDGE_2: usage(),
      JUDGE_3: usage(),
    },
    advocates: usage(),
    judges: usage(),
    run: usage(),
  };
}

export function runView(
  runType: "SAME_MODEL" | "MIXED_MODELS",
  overrides: Partial<RunResultsView> = {},
): RunResultsView {
  return {
    id: `${runType.toLowerCase()}-run`,
    runType,
    status: "PENDING",
    finalVerdict: null,
    failureReason: null,
    startedAt: null,
    completedAt: null,
    ...emptyOutputs(),
    attempts: [],
    accounting: emptyAccounting(),
    ...overrides,
  };
}

export function succeededRun(
  runType: "SAME_MODEL" | "MIXED_MODELS",
  verdict: "JUSTIFIED" | "NOT_JUSTIFIED",
): RunResultsView {
  return runView(runType, {
    status: "SUCCEEDED",
    finalVerdict: verdict,
    advocates: {
      DEFENSE_1: advocate("DEFENSE_1"),
      DEFENSE_2: advocate("DEFENSE_2"),
      PROSECUTION_1: advocate("PROSECUTION_1"),
      PROSECUTION_2: advocate("PROSECUTION_2"),
    },
    judges: {
      JUDGE_1: judge("JUDGE_1", verdict),
      JUDGE_2: judge("JUDGE_2", verdict),
      JUDGE_3: judge("JUDGE_3", verdict),
    },
    accounting: {
      ...emptyAccounting(),
      run: usage({
        attemptCount: 7,
        inputTokens: { value: 100, complete: true },
        outputTokens: { value: 50, complete: true },
        totalTokens: { value: 150, complete: true },
        totalCost: { value: "0.001", complete: true },
        durationMs: { value: 1200, complete: true },
      }),
    },
  });
}

export function failedRun(
  runType: "SAME_MODEL" | "MIXED_MODELS",
): RunResultsView {
  return runView(runType, {
    status: "FAILED",
    finalVerdict: null,
    failureReason: "Advocate stage failed.",
    advocates: {
      DEFENSE_1: advocate("DEFENSE_1"),
      DEFENSE_2: null,
      PROSECUTION_1: null,
      PROSECUTION_2: null,
    },
    accounting: {
      ...emptyAccounting(),
      run: usage({
        attemptCount: 2,
        totalCost: { value: "0", complete: false },
      }),
    },
  });
}

export function caseResults(runs: {
  SAME_MODEL: RunResultsView;
  MIXED_MODELS: RunResultsView;
}, accounting: UsageTotalsView = usage()): CaseResultsView {
  return {
    case: {
      id: "00000000-0000-4000-8000-000000000001",
      originalFileName: "t-001.md",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    runs,
    accounting,
  };
}
