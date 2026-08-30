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
      className="parchment-panel w-full overflow-hidden p-6 sm:p-8"
    >
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--burgundy)]">
        Primary petition
      </p>
      <h2 id="charge-sheet-heading" className="display-face mt-1 text-3xl font-bold">
        Submit a charge sheet
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
        Upload one Markdown (.md) charge sheet, 1 MB or smaller. It is the only
        evidence accepted into the Tribunal record.
      </p>

      <form className="mt-7 space-y-5" onSubmit={onSubmit} noValidate>
        <div className="border border-dashed border-[#8c6938] bg-[#fff8df]/45 p-5 sm:p-6">
          <label className="block text-sm font-medium" htmlFor="charge-sheet">
            Select the written charge (.md)
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Valid UTF-8 text · maximum 1 MB
          </p>
          <input
            id="charge-sheet"
            name="chargeSheet"
            type="file"
            accept=".md,text/markdown"
            disabled={busy}
            className="mt-4 block w-full text-sm text-[var(--muted)] file:mr-3 file:cursor-pointer file:border file:border-[#8c6938] file:bg-[#ead6a9] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#43291b]"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="court-button w-full px-5 py-2.5 text-sm font-bold uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Entering the record…" : "Create Case"}
        </button>
      </form>

      <div className="mt-4 min-h-6 text-sm" aria-live="polite">
        {state.status === "processing" ? (
          <p className="text-[var(--muted)]">Validating the charge sheet…</p>
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
