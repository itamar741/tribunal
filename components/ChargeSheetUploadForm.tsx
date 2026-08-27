"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isMdFileName, MAX_CHARGE_SHEET_BYTES } from "@/lib/charge-sheet";
import { uploadChargeSheet } from "@/lib/ui/tribunal-client";

type SubmitState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "success"; caseId: string }
  | { status: "error"; message: string };

function clientValidate(file: File | undefined): string | null {
  if (!file) {
    return "Select a charge sheet file before submitting.";
  }
  if (!isMdFileName(file.name)) {
    return "Only .md charge sheet files are supported.";
  }
  if (file.size > MAX_CHARGE_SHEET_BYTES) {
    return "Charge sheet files must be 1 MB or smaller.";
  }
  return null;
}

export function ChargeSheetUploadForm() {
  const router = useRouter();
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("chargeSheet");

    if (!(input instanceof HTMLInputElement)) {
      setState({ status: "error", message: "Upload control is unavailable." });
      return;
    }

    const files = input.files;
    if (files && files.length > 1) {
      setState({
        status: "error",
        message: "Only one charge sheet file may be uploaded.",
      });
      return;
    }

    const file = files?.[0];
    const clientError = clientValidate(file);
    if (clientError) {
      setState({ status: "error", message: clientError });
      return;
    }

    setState({ status: "processing" });

    try {
      const result = await uploadChargeSheet(file as File);
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "success", caseId: result.body.caseId });
      router.push(`/cases/${result.body.caseId}`);
    } catch {
      setState({
        status: "error",
        message: "Could not reach the server. Try again.",
      });
    }
  }

  const busy = state.status === "processing";

  return (
    <section
      aria-labelledby="charge-sheet-heading"
      className="w-full max-w-xl border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <h2 id="charge-sheet-heading" className="text-lg font-medium">
        Charge sheet
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Upload one Markdown (.md) charge sheet, 1 MB or smaller. This is the
        only input the Tribunal accepts.
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label className="block text-sm font-medium" htmlFor="charge-sheet">
            Charge sheet file (.md)
          </label>
          <input
            id="charge-sheet"
            name="chargeSheet"
            type="file"
            accept=".md,text/markdown"
            disabled={busy}
            className="mt-2 block w-full text-sm text-[var(--muted)] file:mr-3 file:border file:border-[var(--border)] file:bg-[var(--background)] file:px-3 file:py-1.5"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2 text-sm text-[var(--surface)] disabled:opacity-60"
        >
          {busy ? "Creating Case…" : "Create Case"}
        </button>
      </form>

      <div className="mt-4 min-h-6 text-sm" aria-live="polite">
        {state.status === "processing" ? (
          <p className="text-[var(--muted)]">Validating charge sheet…</p>
        ) : null}
        {state.status === "success" ? (
          <p>Case created: {state.caseId}. Opening the Case…</p>
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
