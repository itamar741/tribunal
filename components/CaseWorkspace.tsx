"use client";

import { useCallback, useEffect, useState } from "react";
import {
  executeCase,
  getCaseResults,
  loadPersistedResultsAfterExecution,
} from "@/lib/ui/tribunal-client";
import type { CaseResultsView } from "@/lib/ui/types";
import { CaseResultsView as CaseResults } from "./CaseResultsView";
import { TribunalExecutionState } from "./TribunalExecutionState";

type WorkspaceState =
  | { status: "loading" }
  | { status: "ready"; results: CaseResultsView }
  | { status: "error"; message: string };

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const [state, setState] = useState<WorkspaceState>({ status: "loading" });
  const [executing, setExecuting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    const result = await getCaseResults(caseId);
    if (!result.ok) {
      setState({
        status: "error",
        message: result.error,
      });
      return;
    }
    setState({ status: "ready", results: result.body });
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    getCaseResults(caseId).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "ready", results: result.body });
    });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  async function onStart() {
    if (executing) {
      return;
    }
    setExecuting(true);
    setActionError(null);
    try {
      const executed = await executeCase(caseId);
      if (!executed.ok) {
        setActionError(executed.error);
        await loadResults();
        return;
      }
      const persisted = await loadPersistedResultsAfterExecution(caseId);
      if (!persisted.ok) {
        setState({
          status: "error",
          message: persisted.error,
        });
        return;
      }
      setState({ status: "ready", results: persisted.body });
    } catch {
      setActionError("The Tribunal could not be reached. Try again.");
    } finally {
      setExecuting(false);
    }
  }

  const bothPending =
    state.status === "ready" &&
    state.results.runs.SAME_MODEL.status === "PENDING" &&
    state.results.runs.MIXED_MODELS.status === "PENDING";

  return (
    <div className="flex flex-col gap-6">
      {state.status === "ready" ? (
        <div>
          <p className="text-sm text-[var(--muted)]">
            File {state.results.case.originalFileName}. Created{" "}
            {state.results.case.createdAt}.
          </p>
        </div>
      ) : null}

      {bothPending || executing ? (
        <div className="border border-[var(--border)] bg-[var(--surface)] p-5">
          {executing ? (
            <TribunalExecutionState />
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">
                Both runs are waiting. Starting the Tribunal executes SAME_MODEL
                and MIXED_MODELS from the stored charge sheet.
              </p>
              <button
                type="button"
                onClick={onStart}
                disabled={executing}
                className="mt-4 border border-[var(--foreground)] bg-[var(--foreground)] px-4 py-2 text-sm text-[var(--surface)] disabled:opacity-60"
              >
                Start Tribunal
              </button>
            </>
          )}
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-sm text-red-800">
          {actionError}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p aria-live="polite" className="text-sm text-[var(--muted)]">
          Loading persisted Case results…
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-800">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" && !executing ? (
        <CaseResults results={state.results} />
      ) : null}
    </div>
  );
}
