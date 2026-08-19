"use client";

import { useState, type FormEvent } from "react";
import { isMdFileName, MAX_CHARGE_SHEET_BYTES } from "@/lib/charge-sheet";

type SubmitState =
  | { status: "idle" }
  | { status: "processing" }
  | {
      status: "success";
      caseId: string;
      fileName: string;
      characterCount: number;
      runs: Array<{ id: string; runType: string; status: string }>;
    }
  | { status: "error"; message: string };

type ApiSuccess = {
  ok: true;
  caseId: string;
  fileName: string;
  characterCount: number;
  runs: Array<{ id: string; runType: string; status: string }>;
};

type ApiError = {
  ok: false;
  error: string;
};

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

    const body = new FormData();
    body.append("chargeSheet", file as File);

    setState({ status: "processing" });

    try {
      const response = await fetch("/api/charge-sheet", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok || !payload.ok) {
        const message =
          !payload.ok && "error" in payload
            ? payload.error
            : "Charge sheet upload failed.";
        setState({ status: "error", message });
        return;
      }

      setState({
        status: "success",
        caseId: payload.caseId,
        fileName: payload.fileName,
        characterCount: payload.characterCount,
        runs: payload.runs,
      });
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
          {busy ? "Processing…" : "Submit charge sheet"}
        </button>
      </form>

      <div className="mt-4 min-h-6 text-sm" aria-live="polite">
        {state.status === "processing" ? (
          <p className="text-[var(--muted)]">Validating charge sheet…</p>
        ) : null}
        {state.status === "success" ? (
          <p>
            Case created: {state.caseId}. File {state.fileName} (
            {state.characterCount.toLocaleString()} characters). Runs:{" "}
            {state.runs
              .map((run) => `${run.runType} (${run.status})`)
              .join(", ")}
            .
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-red-700">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
