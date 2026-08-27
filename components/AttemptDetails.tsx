import { formatUsd } from "@/lib/ui/format";
import type { ModelCallAttemptView } from "@/lib/ui/types";

export function AttemptDetails({ attempts }: { attempts: ModelCallAttemptView[] }) {
  if (attempts.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">No model attempts recorded.</p>
    );
  }

  return (
    <details className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Model call details ({attempts.length})
      </summary>
      <ul className="mt-3 space-y-3 text-sm">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="border-t border-[var(--border)] pt-3">
            <p>
              {attempt.agentRole} · attempt {attempt.attempt} · {attempt.status}
            </p>
            <p className="text-[var(--muted)]">{attempt.model}</p>
            <p>
              tokens {attempt.inputTokens ?? "unknown"} /{" "}
              {attempt.outputTokens ?? "unknown"} /{" "}
              {attempt.totalTokens ?? "unknown"}
              {" · "}
              {attempt.totalCost
                ? formatUsd({ value: attempt.totalCost, complete: true })
                : "$unknown"}
              {attempt.durationMs != null ? ` · ${attempt.durationMs} ms` : ""}
            </p>
            {attempt.errorMessage ? (
              <p className="text-[var(--muted)]">{attempt.errorMessage}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
