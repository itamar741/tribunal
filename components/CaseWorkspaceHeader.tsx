"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatLocalDateTime, formatRunStatus } from "@/lib/ui/format";
import type { CaseResultsView } from "@/lib/ui/types";

type CopyState = "idle" | "copied" | "unavailable";

export function CaseWorkspaceHeader({ results }: { results: CaseResultsView }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const { case: caseRecord, runs } = results;

  async function copyCaseId() {
    try {
      await navigator.clipboard.writeText(caseRecord.id);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  }

  return (
    <header className="case-workspace-header">
      <Image
        src="/assets/courtroom/case-workspace-banner.png"
        alt=""
        fill
        preload
        sizes="100vw"
        className="case-workspace-banner-art"
      />
      <div className="case-workspace-banner-scrim" aria-hidden="true" />
      <div className="case-workspace-pennant" aria-hidden="true" />
      <div className="case-workspace-shield" aria-hidden="true" />

      <div className="case-workspace-header-content">
        <Link href="/" className="case-workspace-back">
          ← Back to Cases
        </Link>
        <p className="eyebrow mt-4">Tribunal chamber · Case record</p>
        <h1 className="display-face case-workspace-title">
          {caseRecord.originalFileName}
        </h1>
        <p className="case-workspace-created">
          Created {formatLocalDateTime(caseRecord.createdAt)}
        </p>

        <div className="case-workspace-statuses" aria-label="Run status">
          {(["SAME_MODEL", "MIXED_MODELS"] as const).map((runType) => {
            const run = runs[runType];
            return (
              <span
                key={runType}
                className={`case-workspace-status status-${run.status.toLowerCase()}`}
              >
                <span>{runType}</span>
                <span>{formatRunStatus(run.status)}</span>
              </span>
            );
          })}
        </div>

        <div className="case-workspace-id-row">
          <code>{caseRecord.id}</code>
          <button type="button" className="case-workspace-copy" onClick={copyCaseId}>
            {copyState === "copied" ? "Copied" : "Copy ID"}
          </button>
          <span className="sr-only" aria-live="polite">
            {copyState === "copied" ? "Case ID copied." : ""}
            {copyState === "unavailable" ? "Case ID could not be copied." : ""}
          </span>
        </div>
      </div>
    </header>
  );
}
