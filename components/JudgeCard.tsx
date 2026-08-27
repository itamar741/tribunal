import { JUDGE_DISPLAY } from "@/lib/ui/agents";
import { formatVerdict } from "@/lib/ui/format";
import type { JudgeResponseView, JudgeRoleView } from "@/lib/ui/types";

export function JudgeCard({
  role,
  response,
}: {
  role: JudgeRoleView;
  response: JudgeResponseView | null;
}) {
  const { characterName } = JUDGE_DISPLAY[role];

  return (
    <article className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <header>
        <h4 className="text-base font-semibold">{characterName}</h4>
        <p className="text-sm text-[var(--muted)]">{role}</p>
      </header>
      {response ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            <span className="font-medium">Vote: </span>
            <span>{formatVerdict(response.verdict)}</span>
            <span className="sr-only"> ({response.verdict})</span>
          </p>
          <p>{response.summary}</p>
          <ol className="list-decimal space-y-2 pl-5">
            {response.key_reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Judge output is unavailable.
        </p>
      )}
    </article>
  );
}
