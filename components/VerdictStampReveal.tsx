"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { RunResultsView } from "@/lib/ui/types";

type FinalVerdict = NonNullable<RunResultsView["finalVerdict"]>;

const revealedVerdicts = new Set<string>();

function hasAlreadyRevealed(key: string): boolean {
  if (revealedVerdicts.has(key)) {
    return true;
  }

  try {
    return window.sessionStorage.getItem(key) === "revealed";
  } catch {
    return false;
  }
}

function rememberReveal(key: string) {
  revealedVerdicts.add(key);
  try {
    window.sessionStorage.setItem(key, "revealed");
  } catch {
    // The in-memory guard still prevents routine rerenders from replaying it.
  }
}

export function VerdictStampReveal({
  runId,
  verdict,
}: {
  runId: string;
  verdict: FinalVerdict;
}) {
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const revealKey = `tribunal:verdict-reveal:${runId}:${verdict}`;
    if (hasAlreadyRevealed(revealKey)) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      rememberReveal(revealKey);
      setRevealing(true);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [runId, verdict]);

  const impression =
    verdict === "JUSTIFIED"
      ? "/assets/verdicts/rubber-justified.png"
      : "/assets/verdicts/rubber-not-justified.png";

  return (
    <span
      className={`verdict-stamp-reveal ${revealing ? "is-revealing" : ""}`}
      aria-hidden="true"
    >
      <Image
        src={impression}
        alt=""
        width={verdict === "JUSTIFIED" ? 1686 : 1962}
        height={verdict === "JUSTIFIED" ? 643 : 737}
        sizes="(max-width: 420px) 104px, 144px"
        loading="eager"
        className="verdict-rubber-impression"
      />
      <span className="verdict-impact-ring" />
      <Image
        src="/assets/verdicts/ceremonial-stamp-overhead.png"
        alt=""
        width={1080}
        height={1170}
        sizes="(max-width: 420px) 88px, 112px"
        loading="eager"
        className="verdict-stamp-tool"
      />
    </span>
  );
}
