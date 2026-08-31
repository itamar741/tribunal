import { JUDGE_ROLES, RUN_STRATEGY_LABEL } from "@/lib/ui/agents";
import { formatDuration, formatRunStatus, formatVerdict } from "@/lib/ui/format";
import type { RunResultsView } from "@/lib/ui/types";
import { JudgeCard } from "./JudgeCard";
import { VerdictStampReveal } from "./VerdictStampReveal";

export function CeremonialVerdictTableau({ run }: { run: RunResultsView }) {
  if (run.status !== "SUCCEEDED" || !run.finalVerdict) {
    return null;
  }

  const { finalVerdict } = run;
  const accounting = run.accounting.run;

  return (
    <section
      className={`verdict-tableau verdict-tableau-${finalVerdict.toLowerCase()}`}
      aria-labelledby={`${run.runType}-heading`}
    >
      <header className="tableau-top-strip">
        <div>
          <p className="tableau-kicker">Tribunal Run · Final record</p>
          <h2 id={`${run.runType}-heading`} className="display-face tableau-run-name">
            {run.runType}
          </h2>
          <p className="tableau-subtitle">{RUN_STRATEGY_LABEL[run.runType]}</p>
        </div>
        <span className="tableau-status status-badge status-succeeded">
          {formatRunStatus(run.status)}
        </span>
      </header>

      <div className="tableau-verdict">
        <div>
          <p className="tableau-kicker">Final verdict</p>
          <p className="display-face tableau-verdict-name">
            {formatVerdict(finalVerdict)}
            <span className="sr-only"> ({finalVerdict})</span>
          </p>
          <p className="tableau-verdict-note">Majority ruling entered into the record.</p>
        </div>
        <VerdictStampReveal runId={run.id} verdict={finalVerdict} />
      </div>

      <section className="ceremonial-judge-bench" aria-labelledby={`${run.runType}-judges-heading`}>
        <div className="text-center">
          <p className="tableau-kicker">The high bench</p>
          <h3 id={`${run.runType}-judges-heading`} className="display-face text-2xl font-bold">
            Three Judges · One ruling
          </h3>
        </div>
        <div className="ceremonial-throne-row">
          {JUDGE_ROLES.map((role) => (
            <JudgeCard
              key={role}
              role={role}
              response={run.judges[role]}
              model={run.modelAssignments?.[role] ?? "Recorded model"}
              executionState="SUCCEEDED"
              presentation="seat"
            />
          ))}
        </div>
      </section>

      <dl className="tableau-metrics">
        <div>
          <dt>Attempts</dt>
          <dd>{accounting.attemptCount}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>{accounting.totalCost.complete ? "Complete" : "Known / incomplete"}</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{formatDuration(accounting.durationMs)}</dd>
        </div>
      </dl>
    </section>
  );
}
