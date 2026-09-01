"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCanonicalCase } from "@/lib/ui/tribunal-client";

type LaunchState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "error"; message: string };

export function TribunalLaunchPanel() {
  const router = useRouter();
  const [state, setState] = useState<LaunchState>({ status: "idle" });
  const busy = state.status === "processing";

  async function onLaunch() {
    if (busy) return;
    setState({ status: "processing" });

    try {
      const result = await createCanonicalCase();
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      router.push(`/cases/${result.body.caseId}?start=1`);
    } catch {
      setState({
        status: "error",
        message: "Could not reach the Tribunal. Try again.",
      });
    }
  }

  return (
    <section
      aria-labelledby="tribunal-launch-heading"
      className="parchment-panel w-full overflow-hidden p-6 sm:p-8"
    >
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--burgundy)]">
        Primary petition
      </p>
      <h2 id="tribunal-launch-heading" className="display-face mt-1 text-3xl font-bold">
        Hear the canonical Case
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
        The fixed T-001 record, <em>The Realm v. Jon Snow</em>, is already
        entered. Convene both councils and begin their deliberations.
      </p>

      <button
        type="button"
        onClick={onLaunch}
        disabled={busy}
        className="court-button mt-7 w-full px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Opening the chamber…" : "Convene Tribunal"}
      </button>

      <div className="mt-4 min-h-6 text-sm" aria-live="polite">
        {busy ? (
          <p className="text-[var(--muted)]">Preparing the fixed court record…</p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-red-800">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
