"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isCaseId } from "@/lib/cases/id";

export function OpenCaseForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
