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
    <div className="mt-8 border-t border-[var(--border)] pt-6">
      <h3 className="text-base font-medium">Recent Cases</h3>
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
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {state.cases.map((item) => (
            <li key={item.caseId}>
              <Link
                href={`/cases/${item.caseId}`}
                className="block py-3 hover:bg-[var(--background)]"
              >
                <p className="text-sm font-medium">{item.originalFileName}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatLocalDateTime(item.executedAt)}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Case {shortenCaseId(item.caseId)}…
                </p>
                <p className="mt-1 text-sm">{formatUsd(item.totalCost)}</p>
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
      className="w-full max-w-xl border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <h2 id="open-case-heading" className="text-lg font-medium">
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
            className="mt-2 w-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm"
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
