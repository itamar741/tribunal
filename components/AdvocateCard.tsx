import { REPRESENTATIVE_DISPLAY } from "@/lib/ui/agents";
import type { AdvocateResponseView, RepresentativeRoleView } from "@/lib/ui/types";

export type SeatExecutionState = "PENDING" | "LOADING" | "FAILED" | "SUCCEEDED";

function SeatState({ state }: { state: SeatExecutionState }) {
  if (state === "LOADING") {
    return (
      <p className="agent-work-status agent-work-status-loading" role="status">
        <span className="agent-work-spinner" aria-hidden="true" />
        Deliberating
      </p>
    );
  }
  if (state === "FAILED") {
    return (
      <p className="agent-work-status agent-work-status-failed">
        <span className="agent-work-failure-mark" aria-hidden="true">×</span>
        Last attempt failed
      </p>
    );
  }
  if (state === "PENDING") {
    return <p className="agent-work-status">Awaiting deliberation</p>;
  }
  return <p className="agent-work-status agent-work-status-succeeded">Record entered</p>;
}

export function AdvocateCard({
  role,
  response,
  model,
  executionState,
  liveDraft,
  liveAttempt,
  liveSource,
}: {
  role: RepresentativeRoleView;
  response: AdvocateResponseView | null;
  model: string;
  executionState: SeatExecutionState;
  liveDraft?: string;
  liveAttempt?: 1 | 2;
  liveSource?: "PRIMARY" | "FALLBACK";
}) {
  const { characterName, side } = REPRESENTATIVE_DISPLAY[role];
  const sideClass =
    side === "Defense"
      ? ""
      : "advocate-card-prosecution";

  return (
    <article
      className={`advocate-card p-4 ${sideClass}`}
    >
      <header>
        <h4 className="display-face text-lg font-bold">{characterName}</h4>
        <p className="mt-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {side} · {role}
        </p>
        <p className="agent-model-label" title={model}>{model}</p>
      </header>
      {response ? (
        <div className="mt-4 space-y-4 text-sm leading-6">
          <p className="font-medium italic">{response.summary}</p>
          <ol className="space-y-3">
            {response.arguments.map((item, index) => (
              <li key={`${index}-${item.title}`} className="border-t border-[#b69b70] pt-3">
                <p className="font-semibold text-[var(--burgundy)]">
                  <span className="mr-2 text-xs text-[#9a7436]">{index + 1}.</span>
                  {item.title}
                </p>
                <p className="mt-1">{item.argument}</p>
              </li>
            ))}
          </ol>
          <p className="border-t border-[#b69b70] pt-3">
            <span className="font-semibold">Conclusion. </span>
            {response.conclusion}
          </p>
        </div>
      ) : liveDraft != null ? (
        <div className="live-draft mt-4" aria-live="polite">
          <p className="live-draft-label">
            Live draft · unverified · attempt {liveAttempt ?? 1}
            {liveSource === "FALLBACK" ? " · fallback" : ""}
          </p>
          <p className="live-draft-copy">{liveDraft || "Receiving the first words…"}</p>
        </div>
      ) : (
        <div className="mt-3">
          <SeatState state={executionState} />
        </div>
      )}
    </article>
  );
}
