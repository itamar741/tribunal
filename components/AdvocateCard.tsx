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
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Advocate output is unavailable.
        </p>
      )}
    </article>
  );
}
