import { JUDGE_ROLES, JUDGE_SIMULATION_NOTE, RUN_STRATEGY_LABEL } from "@/lib/ui/agents";
import type { AgentRoleView, RunResultsView } from "@/lib/ui/types";
import type { LiveExecutionUpdates, LiveSeatUpdate } from "@/lib/ui/live-execution";
import { AdvocateCard, type SeatExecutionState } from "./AdvocateCard";
import { JudgeCard } from "./JudgeCard";

const DEFENSE_ROLES = ["DEFENSE_1", "DEFENSE_2"] as const;
const PROSECUTION_ROLES = ["PROSECUTION_1", "PROSECUTION_2"] as const;

function attemptsForRole(run: RunResultsView, role: AgentRoleView) {
  return run.attempts
    .filter((attempt) => attempt.agentRole === role)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function modelForRole(run: RunResultsView, role: AgentRoleView, live?: LiveSeatUpdate): string {
  if (live) return live.model;
  const latest = attemptsForRole(run, role).at(-1);
  return latest?.model ?? run.modelAssignments?.[role] ?? "Model assignment pending";
}

function stateForRole(run: RunResultsView, role: AgentRoleView, live?: LiveSeatUpdate): SeatExecutionState {
  const latest = attemptsForRole(run, role).at(-1);
  const response = role.startsWith("JUDGE")
    ? run.judges[role as keyof typeof run.judges]
    : run.advocates[role as keyof typeof run.advocates];
  if (response) return "SUCCEEDED";
  if (live) return live.status;
  if (latest?.status === "FAILED") return "FAILED";
  if (run.status !== "RUNNING") return "PENDING";
  if (!role.startsWith("JUDGE")) return "LOADING";
  const advocatesReady = Object.values(run.advocates).every(Boolean);
  return advocatesReady ? "LOADING" : "PENDING";
}

function mixedModelProblems(run: RunResultsView) {
  const problems = new Map<string, { roles: Set<string>; classifications: Set<string>; count: number }>();
  for (const attempt of run.attempts.filter((item) => item.status === "FAILED")) {
    const existing = problems.get(attempt.model) ?? {
      roles: new Set<string>(),
      classifications: new Set<string>(),
      count: 0,
    };
    existing.roles.add(attempt.agentRole);
    if (attempt.failureClassification) existing.classifications.add(attempt.failureClassification);
    existing.count += 1;
    problems.set(attempt.model, existing);
  }
  return [...problems.entries()];
}

export function RunPanel({ run, liveUpdates }: { run: RunResultsView; liveUpdates?: LiveExecutionUpdates }) {
  const title = run.runType === "SAME_MODEL" ? "SAME_MODEL" : "MIXED_MODELS";
  const hasFinalVerdict = run.status === "SUCCEEDED" && run.finalVerdict;
  const panelHeadingId = hasFinalVerdict
    ? `${run.runType}-evidence-heading`
    : `${run.runType}-heading`;
  const judgeHeadingId = hasFinalVerdict
    ? `${run.runType}-judge-records-heading`
    : `${run.runType}-judges-heading`;
  const sameModel = run.modelAssignments?.DEFENSE_1;
  const modelProblems = run.runType === "MIXED_MODELS" ? mixedModelProblems(run) : [];
  const liveForRole = (role: AgentRoleView) => liveUpdates?.[run.runType]?.[role];

  return (
    <section
      aria-labelledby={panelHeadingId}
      id="selected-run-evidence"
      className="parchment-panel flex scroll-mt-6 flex-col gap-7 overflow-hidden p-5 sm:p-7"
    >
      {hasFinalVerdict ? (
        <header className="evidence-ledger-heading">
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.17em] text-[var(--burgundy)]">
            Selected council · Evidence ledger
          </p>
          <h2 id={panelHeadingId} className="display-face mt-1 text-2xl font-bold">
            Evidence following the ruling
          </h2>
        </header>
      ) : (
        <header className="border-b border-[#a68651] pb-5">
          <p className="text-[0.64rem] font-bold uppercase tracking-[0.17em] text-[var(--burgundy)]">
            Selected council · Evidence ledger
          </p>
          <h2 id={`${run.runType}-heading`} className="display-face mt-1 text-3xl font-bold">
            {title} Record
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {RUN_STRATEGY_LABEL[run.runType]}
          </p>
        </header>
      )}

      {modelProblems.length > 0 ? (
        <aside className="mixed-model-watch" aria-label="Mixed-model reliability record">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--burgundy)]">Mixed-model reliability record</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-5">
            {modelProblems.map(([model, problem]) => (
              <li key={model}>
                <span className="font-semibold">{model}</span>
                {" · "}{[...problem.roles].join(", ")}
                {" · "}{problem.count} failed {problem.count === 1 ? "attempt" : "attempts"}
                {problem.classifications.size > 0 ? ` · ${[...problem.classifications].join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <section aria-labelledby={`${run.runType}-advocates-heading`}>
        <div className="text-center">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--burgundy)]">Arguments entered</p>
          <h3 id={`${run.runType}-advocates-heading`} className="display-face mt-1 text-2xl font-bold">Advocates</h3>
          {run.runType === "SAME_MODEL" && sameModel ? (
            <p className="agent-section-model">{sameModel}</p>
          ) : null}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <div className="side-banner px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.18em]">
              Defense
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {DEFENSE_ROLES.map((role) => (
                <AdvocateCard key={role} role={role} response={run.advocates[role]} model={modelForRole(run, role, liveForRole(role))} executionState={stateForRole(run, role, liveForRole(role))} liveDraft={liveForRole(role)?.status === "LOADING" ? liveForRole(role)?.draft : undefined} liveAttempt={liveForRole(role)?.attempt} liveSource={liveForRole(role)?.modelSource} />
              ))}
            </div>
          </div>
          <div>
            <div className="side-banner side-banner-prosecution px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.18em]">
              Prosecution
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {PROSECUTION_ROLES.map((role) => (
                <AdvocateCard key={role} role={role} response={run.advocates[role]} model={modelForRole(run, role, liveForRole(role))} executionState={stateForRole(run, role, liveForRole(role))} liveDraft={liveForRole(role)?.status === "LOADING" ? liveForRole(role)?.draft : undefined} liveAttempt={liveForRole(role)?.attempt} liveSource={liveForRole(role)?.modelSource} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby={judgeHeadingId} className="judge-bench-surface">
        <div className="judge-bench-content text-center">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--burgundy)]">
            {hasFinalVerdict ? "Reasons entered after judgment" : "The high bench"}
          </p>
          <h3 id={judgeHeadingId} className="display-face mt-1 text-2xl font-bold">
            {hasFinalVerdict ? "Judge records" : "Judges"}
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">{JUDGE_SIMULATION_NOTE}</p>
          <div className="mt-5 grid gap-3 text-left lg:grid-cols-3">
            {JUDGE_ROLES.map((role) => (
              <JudgeCard key={role} role={role} response={run.judges[role]} model={modelForRole(run, role, liveForRole(role))} executionState={stateForRole(run, role, liveForRole(role))} liveDraft={liveForRole(role)?.status === "LOADING" ? liveForRole(role)?.draft : undefined} liveAttempt={liveForRole(role)?.attempt} liveSource={liveForRole(role)?.modelSource} />
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
