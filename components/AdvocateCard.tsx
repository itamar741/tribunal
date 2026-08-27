import { REPRESENTATIVE_DISPLAY } from "@/lib/ui/agents";
import type { AdvocateResponseView, RepresentativeRoleView } from "@/lib/ui/types";

export function AdvocateCard({
  role,
  response,
}: {
  role: RepresentativeRoleView;
  response: AdvocateResponseView | null;
}) {
  const { characterName, side } = REPRESENTATIVE_DISPLAY[role];
  const sideClass =
    side === "Defense"
      ? "border-l-[var(--defense)]"
      : "border-l-[var(--prosecution)]";

  return (
    <article
      className={`border border-[var(--border)] border-l-4 bg-[var(--surface)] p-4 ${sideClass}`}
    >
      <header>
        <h4 className="text-base font-semibold">{characterName}</h4>
        <p className="text-sm text-[var(--muted)]">
          {side} · {role}
        </p>
      </header>
      {response ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>{response.summary}</p>
          <ol className="list-decimal space-y-3 pl-5">
            {response.arguments.map((item, index) => (
              <li key={`${index}-${item.title}`}>
                <p className="font-medium">{item.title}</p>
                <p className="mt-1">{item.argument}</p>
              </li>
            ))}
          </ol>
          <p>
            <span className="font-medium">Conclusion. </span>
            {response.conclusion}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Advocate output is unavailable.
        </p>
      )}
    </article>
  );
}
