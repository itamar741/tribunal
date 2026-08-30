import Image from "next/image";
import { JUDGE_DISPLAY } from "@/lib/ui/agents";
import { formatVerdict } from "@/lib/ui/format";
import type { JudgeResponseView, JudgeRoleView } from "@/lib/ui/types";

export function JudgeCard({
  role,
  response,
  presentation = "record",
}: {
  role: JudgeRoleView;
  response: JudgeResponseView | null;
  presentation?: "seat" | "record";
}) {
  const { characterName, throneAsset } = JUDGE_DISPLAY[role];

  if (presentation === "seat") {
    return (
      <article className="judge-bench-seat">
        <header className="judge-throne-stage">
          <Image
            src={throneAsset}
            alt=""
            fill
            sizes="(max-width: 639px) min(100vw - 8rem, 17rem), 27vw"
            loading="eager"
            className="judge-throne-image"
          />
          <div className="judge-throne-plaque">
            <h4 className="display-face font-bold">{characterName}</h4>
            <p>{role.replace("_", " ")}</p>
          </div>
        </header>
        {response ? (
          <p className={`judge-seat-vote ${response.verdict === "JUSTIFIED" ? "judge-seat-vote-justified" : "judge-seat-vote-not-justified"}`}>
            <span>Vote: {formatVerdict(response.verdict)}</span>
            <span className="sr-only"> ({response.verdict})</span>
          </p>
        ) : (
          <p className="judge-seat-vote judge-seat-vote-unavailable">
            Judge output is unavailable.
          </p>
        )}
      </article>
    );
  }

  return (
    <article className="judge-record-card p-4 sm:p-5">
      <header>
        <h4 className="display-face text-lg font-bold">{characterName}</h4>
        <p className="mt-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {role.replace("_", " ")}
        </p>
      </header>
      {response ? (
        <div className="judge-card-record mt-3 space-y-3 pt-3 text-sm leading-6">
          <p className={`inline-flex border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em] ${response.verdict === "JUSTIFIED" ? "border-[#6a8b70] bg-[#d9e4cd] text-[#28523a]" : "border-[#aa6767] bg-[#ead2c7] text-[#79242a]"}`}>
            <span>Vote: {formatVerdict(response.verdict)}</span>
            <span className="sr-only"> ({response.verdict})</span>
          </p>
          <p>{response.summary}</p>
          <ol className="list-[upper-roman] space-y-2 pl-5 marker:font-semibold marker:text-[#8a6228]">
            {response.key_reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="judge-card-record mt-3 pt-3 text-sm text-[var(--muted)]">
          Judge output is unavailable.
        </p>
      )}
    </article>
  );
}
