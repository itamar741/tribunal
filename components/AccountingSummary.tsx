import { formatCount, formatDuration, formatUsd } from "@/lib/ui/format";
import type { UsageTotalsView } from "@/lib/ui/types";

export function AccountingSummary({
  title,
  totals,
}: {
  title: string;
  totals: UsageTotalsView;
}) {
  return (
    <section className="technical-card p-4">
      <h3 className="display-face text-lg font-bold">{title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[var(--muted)]">Attempts</dt>
          <dd>{totals.attemptCount}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Input tokens</dt>
          <dd>{formatCount(totals.inputTokens)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Output tokens</dt>
          <dd>{formatCount(totals.outputTokens)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Total tokens</dt>
          <dd>{formatCount(totals.totalTokens)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Total cost</dt>
          <dd>{formatUsd(totals.totalCost)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Duration</dt>
          <dd>{formatDuration(totals.durationMs)}</dd>
        </div>
      </dl>
    </section>
  );
}
