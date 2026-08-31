"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
  const [phase, setPhase] = useState<"waiting" | "revealing" | "revealed">(
    "waiting",
  );
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const revealKey = `tribunal:verdict-reveal:${runId}:${verdict}`;
    if (hasAlreadyRevealed(revealKey)) {
      const restoreTimer = window.setTimeout(() => setPhase("revealed"), 0);
      return () => window.clearTimeout(restoreTimer);
    }

    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      return;
    }

    let inView = false;
    let focused = document.visibilityState === "visible" && document.hasFocus();
    let attentionTimer: number | null = null;

    const stopAttentionTimer = () => {
      if (attentionTimer != null) {
        window.clearTimeout(attentionTimer);
        attentionTimer = null;
      }
    };

    const beginWhenAttentive = () => {
      stopAttentionTimer();
      if (!inView || !focused || hasAlreadyRevealed(revealKey)) {
        return;
      }
      attentionTimer = window.setTimeout(() => {
        attentionTimer = null;
        if (!inView || !focused || hasAlreadyRevealed(revealKey)) {
          return;
        }
        rememberReveal(revealKey);
        setPhase("revealing");
      }, 700);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting === true && entry.intersectionRatio >= 0.6;
        beginWhenAttentive();
      },
      { threshold: [0, 0.6] },
    );
    const onVisibilityChange = () => {
      focused = document.visibilityState === "visible" && document.hasFocus();
      beginWhenAttentive();
    };
    const onFocusChange = () => {
      focused = document.visibilityState === "visible" && document.hasFocus();
      beginWhenAttentive();
    };

    observer.observe(root);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocusChange);
    window.addEventListener("blur", onFocusChange);

    return () => {
      stopAttentionTimer();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocusChange);
      window.removeEventListener("blur", onFocusChange);
    };
  }, [runId, verdict]);

  const impression =
    verdict === "JUSTIFIED"
      ? "/assets/verdicts/rubber-justified.png"
      : "/assets/verdicts/rubber-not-justified.png";

  return (
    <span
      ref={rootRef}
      className={`verdict-stamp-reveal is-${phase}`}
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
        onAnimationEnd={() => {
          if (phase === "revealing") setPhase("revealed");
        }}
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
