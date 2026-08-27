import { JUDGE_ROLES, JUDGE_SIMULATION_NOTE, REPRESENTATIVE_ROLES, RUN_STRATEGY_LABEL } from "@/lib/ui/agents";
import { formatRunStatus, formatVerdict } from "@/lib/ui/format";
import type { RunResultsView } from "@/lib/ui/types";
import { AccountingSummary } from "./AccountingSummary";
import { AdvocateCard } from "./AdvocateCard";
import { AttemptDetails } from "./AttemptDetails";
import { JudgeCard } from "./JudgeCard";

export function RunPanel({ run }: { run: RunResultsView }) {
  const title = run.runType === "SAME_MODEL" ? "SAME_MODEL" : "MIXED_MODELS";

  return (
    <section
      aria-labelledby={`${run.runType}-heading`}
      className="flex flex-col gap-4 border border-[var(--border)] bg-[var(--surface)] p-5"
    >
      <header className="space-y-2">
        <h2 id={`${run.runType}-heading`} className="text-xl font-semibold">
          {title}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {RUN_STRATEGY_LABEL[run.runType]}
        </p>
        <p>
          <span className="font-medium">Status: </span>
          {formatRunStatus(run.status)}
        </p>
        {run.status === "SUCCEEDED" && run.finalVerdict ? (
          <p className="text-lg font-semibold">
            Final verdict: {formatVerdict(run.finalVerdict)}
            <span className="sr-only"> ({run.finalVerdict})</span>
          </p>
        ) : null}
        {run.status === "FAILED" ? (
          <p role="status">
            This run failed
            {run.failureReason ? `: ${run.failureReason}` : "."} There is no
            final verdict.
          </p>
        ) : null}
        {run.status === "PENDING" ? (
          <p>This run has not started.</p>
        ) : null}
        {run.status === "RUNNING" ? (
          <p>This run is incomplete. Partial outputs below are not a verdict.</p>
        ) : null}
      </header>

      <div>
        <h3 className="text-sm font-semibold">Advocates</h3>
        <div className="mt-3 grid gap-3">
          {REPRESENTATIVE_ROLES.map((role) => (
            <AdvocateCard key={role} role={role} response={run.advocates[role]} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Judges</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{JUDGE_SIMULATION_NOTE}</p>
        <div className="mt-3 grid gap-3">
          {JUDGE_ROLES.map((role) => (
            <JudgeCard key={role} role={role} response={run.judges[role]} />
          ))}
        </div>
      </div>

      <AccountingSummary title="Run accounting" totals={run.accounting.run} />
      <AttemptDetails attempts={run.attempts} />
    </section>
  );
}
