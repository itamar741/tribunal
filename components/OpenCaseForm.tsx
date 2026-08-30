"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { isCaseId } from "@/lib/cases/id";
import { formatLocalDateTime, formatUsd, shortenCaseId } from "@/lib/ui/format";
import { getRecentCases } from "@/lib/ui/tribunal-client";
import type { RecentCaseView } from "@/lib/ui/types";

export type RecentCasesState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; cases: RecentCaseView[] }
  | { status: "error" };

export function RecentCases({ state }: { state: RecentCasesState }) {
  return (
    <div className="mt-7 border-t border-[#9b7c4d] pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--burgundy)]">
            Court ledger
          </p>
          <h3 className="display-face mt-1 text-xl font-bold">Recent Cases</h3>
        </div>
        <span className="text-2xl text-[#9b7131]" aria-hidden="true">§</span>
      </div>
      {state.status === "loading" ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Loading recent Cases…</p>
      ) : null}
      {state.status === "empty" ? (
        <p className="mt-3 text-sm text-[var(--muted)]">No executed Cases yet.</p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          Recent Cases could not be loaded.
        </p>
      ) : null}
      {state.status === "ready" ? (
        <ul className="mt-3 divide-y divide-[#aa8c60]">
          {state.cases.map((item) => (
            <li key={item.caseId}>
              <Link
                href={`/cases/${item.caseId}`}
                className="docket-row block py-3 pl-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold">{item.originalFileName}</p>
                  <p className="shrink-0 text-xs font-semibold text-[var(--burgundy)]">
                    {formatUsd(item.totalCost)}
                  </p>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {formatLocalDateTime(item.executedAt)} · Case {shortenCaseId(item.caseId)}…
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OpenCasePanel({
  formError,
  recent,
  onSubmit,
}: {
  formError: string | null;
  recent: RecentCasesState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section
      aria-labelledby="open-case-heading"
      className="parchment-panel w-full overflow-hidden p-6"
    >
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--burgundy)]">
        Archive access
      </p>
      <h2 id="open-case-heading" className="display-face mt-1 text-2xl font-bold">
        Open an existing Case
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Reload persisted results by Case ID. This does not start a new Tribunal.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="block text-sm font-medium" htmlFor="case-id">
            Case ID
          </label>
          <input
            id="case-id"
            name="caseId"
            type="text"
            autoComplete="off"
            spellCheck={false}
            className="court-input mt-2 w-full px-3 py-2.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="court-button-secondary w-full px-4 py-2 text-sm font-semibold"
        >
          Open Case
        </button>
      </form>
      {formError ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {formError}
        </p>
      ) : null}
      <RecentCases state={recent} />
    </section>
  );
}

export function OpenCaseForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCasesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getRecentCases()
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setRecent({ status: "error" });
          return;
        }
        if (result.body.cases.length === 0) {
          setRecent({ status: "empty" });
          return;
        }
        setRecent({ status: "ready", cases: result.body.cases });
      })
      .catch(() => {
        if (!cancelled) {
          setRecent({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("caseId");
    if (!(input instanceof HTMLInputElement)) {
      setError("Case ID control is unavailable.");
      return;
    }
    const caseId = input.value.trim();
    if (!isCaseId(caseId)) {
      setError("Enter a valid Case ID.");
      return;
    }
    setError(null);
    router.push(`/cases/${caseId}`);
  }

  return (
    <OpenCasePanel formError={error} recent={recent} onSubmit={onSubmit} />
  );
}
