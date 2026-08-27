import type { CaseResultsView } from "@/lib/ui/types";
import { AccountingSummary } from "./AccountingSummary";
import { RunPanel } from "./RunPanel";

export function CaseResultsView({ results }: { results: CaseResultsView }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <RunPanel run={results.runs.SAME_MODEL} />
        <RunPanel run={results.runs.MIXED_MODELS} />
      </div>
      <AccountingSummary title="Case totals" totals={results.accounting} />
    </div>
  );
}
