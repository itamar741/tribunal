"use client";

import { useState } from "react";
import { formatRunStatus, formatVerdict } from "@/lib/ui/format";
import type { CaseResultsView } from "@/lib/ui/types";
import { AccountingSummary } from "./AccountingSummary";
import { AttemptDetails } from "./AttemptDetails";
import { CeremonialVerdictTableau } from "./CeremonialVerdictTableau";
import { RunPanel } from "./RunPanel";

type RunType = "SAME_MODEL" | "MIXED_MODELS";

function VerdictAccent({
  verdict,
}: {
  verdict: "JUSTIFIED" | "NOT_JUSTIFIED" | null;
}) {
  if (!verdict) {
    return null;
  }

  return (
    <span
      className={`verdict-accent ${verdict === "JUSTIFIED" ? "petal-accent" : "tomato-accent"}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function RunOutcomeCard({
  run,
  selected,
  onSelect,
}: {
  run: CaseResultsView["runs"][RunType];
  selected: boolean;
  onSelect: () => void;
}) {
  const verdict = run.status === "SUCCEEDED" ? run.finalVerdict : null;
  const sealClass = verdict
    ? verdict === "JUSTIFIED"
      ? "verdict-justified"
      : ""
    : "verdict-pending";

  return (
    <button
      type="button"
      className="run-selector min-h-48 w-full p-5 text-[#ecdfc4] sm:p-6"
      aria-pressed={selected}
      aria-controls="selected-run-evidence"
      onClick={onSelect}
    >
      <VerdictAccent verdict={verdict} />
      <span className="relative flex h-full items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="eyebrow block">Tribunal Run</span>
          <span className="display-face mt-1 block text-xl font-bold tracking-wide text-[#f5dfae] sm:text-2xl">
            {run.runType}
          </span>
          <span
            className={`status-badge status-${run.status.toLowerCase()} mt-3`}
          >
            {formatRunStatus(run.status)}
          </span>
          {run.fallbackUsed ? <span className="ml-2 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-[#e4c878]">Fallback used</span> : null}
          <span className="mt-4 block text-sm leading-5 text-[#bfae8d]">
            {run.status === "SUCCEEDED" && run.finalVerdict ? (
              <>
                <span className="block font-semibold text-[#f0d79b]">
                  Final verdict: {formatVerdict(run.finalVerdict)}
                </span>
                <span className="sr-only"> ({run.finalVerdict})</span>
                Majority ruling entered into the record.
              </>
            ) : null}
            {run.status === "FAILED" ? (
              <>
                This run failed{run.failureReason ? `: ${run.failureReason}` : "."}{" "}
                There is no final verdict.
              </>
            ) : null}
            {run.status === "PENDING" ? "This run has not started." : null}
            {run.status === "RUNNING"
              ? "This run is incomplete. Partial outputs are not a verdict."
              : null}
          </span>
        </span>
        <span className={`verdict-seal ${sealClass}`} aria-hidden="true">
          {verdict ? formatVerdict(verdict) : formatRunStatus(run.status)}
        </span>
      </span>
      <span className="relative mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-[#d2ae60]">
        {selected ? "Evidence shown below" : "View evidence"}
      </span>
    </button>
  );
}

export function CaseResultsView({ results, onResume }: { results: CaseResultsView; onResume?: (runId: string) => void }) {
  const [selectedRunType, setSelectedRunType] = useState<RunType>("SAME_MODEL");
  const selectedRun = results.runs[selectedRunType];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="run-outcomes-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">The rulings</p>
            <h2
              id="run-outcomes-heading"
              className="display-face mt-1 text-2xl font-bold text-[#f0dcad] sm:text-3xl"
            >
              Run outcomes
            </h2>
          </div>
          <p className="text-xs text-[#ad9a78]">
            Select a council to inspect its evidence.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <RunOutcomeCard
            run={results.runs.SAME_MODEL}
            selected={selectedRunType === "SAME_MODEL"}
            onSelect={() => setSelectedRunType("SAME_MODEL")}
          />
          <RunOutcomeCard
            run={results.runs.MIXED_MODELS}
            selected={selectedRunType === "MIXED_MODELS"}
            onSelect={() => setSelectedRunType("MIXED_MODELS")}
          />
        </div>
      </section>

      {selectedRun.status === "SUCCEEDED" && selectedRun.finalVerdict ? (
        <CeremonialVerdictTableau run={selectedRun} />
      ) : null}

      {selectedRun.status === "FAILED" && onResume ? (
        <div className="parchment-panel flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-[var(--muted)]">This record remains intact. Resume retries only unresolved seats and preserves all prior evidence.</p>
          <button type="button" className="court-button px-4 py-2 text-xs font-bold uppercase tracking-[0.1em]" onClick={() => onResume(selectedRun.id)}>
            Resume failed run
          </button>
        </div>
      ) : null}

      <RunPanel run={selectedRun} />

      <details className="technical-record stone-panel text-[#e8dcc2]">
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#d5b66d] sm:px-6">
          Technical Record
        </summary>
        <div className="grid gap-4 border-t border-[#695538] p-4 sm:p-6 lg:grid-cols-2">
          <AccountingSummary
            title={`${selectedRunType} accounting`}
            totals={selectedRun.accounting.run}
          />
          <AccountingSummary title="Case totals" totals={results.accounting} />
          <div className="lg:col-span-2">
            <AttemptDetails attempts={selectedRun.attempts} />
          </div>
        </div>
      </details>
    </div>
  );
}
