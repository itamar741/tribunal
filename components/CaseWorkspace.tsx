"use client";

import { useCallback, useEffect, useState } from "react";
import {
  executeCase,
  getCaseResults,
  loadPersistedResultsAfterExecution,
} from "@/lib/ui/tribunal-client";
import type { CaseResultsView } from "@/lib/ui/types";
import { CaseResultsView as CaseResults } from "./CaseResultsView";
import { CaseWorkspaceHeader } from "./CaseWorkspaceHeader";
import { TribunalExecutionState } from "./TribunalExecutionState";

type WorkspaceState =
  | { status: "loading" }
  | { status: "ready"; results: CaseResultsView }
  | { status: "error"; message: string };

const RESULTS_POLL_INTERVAL_MS = 3_000;

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

  useEffect(() => {
    if (!executing) {
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;
    const refreshPersistedResults = async () => {
      if (cancelled || refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      try {
        const result = await getCaseResults(caseId);
        if (!cancelled && result.ok) {
          setState({ status: "ready", results: result.body });
        }
      } finally {
        refreshInFlight = false;
      }
    };

    void refreshPersistedResults();
    const interval = window.setInterval(
      () => void refreshPersistedResults(),
      RESULTS_POLL_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [caseId, executing]);

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

  async function onResume(runId: string) {
    if (executing) return;
    setExecuting(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/runs/${encodeURIComponent(runId)}/resume`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok) setActionError(body.error ?? "This Run could not be resumed.");
      await loadResults();
    } catch {
      setActionError("The recovery request could not be reached. Try again.");
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
        <CaseWorkspaceHeader results={state.results} />
      ) : null}

      {bothPending || executing ? (
        <div className="parchment-panel p-5 sm:p-6">
          {executing ? (
            <TribunalExecutionState />
          ) : (
            <>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Both runs are waiting. Starting the Tribunal executes SAME_MODEL
                and MIXED_MODELS from the stored charge sheet.
              </p>
              <button
                type="button"
                onClick={onStart}
                disabled={executing}
                className="court-button mt-4 px-5 py-2.5 text-sm font-bold uppercase tracking-[0.1em] disabled:opacity-60"
              >
                Start Tribunal
              </button>
            </>
          )}
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="border border-[#9f5056] bg-[#3b171c] px-4 py-3 text-sm text-[#f3c0bd]">
          {actionError}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p aria-live="polite" className="text-sm text-[#c8b897]">
          Loading persisted Case results…
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="border border-[#9f5056] bg-[#3b171c] px-4 py-3 text-sm text-[#f3c0bd]">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <CaseResults
          results={state.results}
          onResume={executing ? undefined : onResume}
        />
      ) : null}
    </div>
  );
}
