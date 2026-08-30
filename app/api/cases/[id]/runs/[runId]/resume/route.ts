import { NextResponse } from "next/server";
import { getOpenRouterApiKey } from "@/lib/ai/openrouter";
import { isCaseId, PostgresCaseRepository, PostgresTribunalRunRepository } from "@/lib/cases";
import { PostgresModelCallRepository } from "@/lib/model-calls";
import { getCaseResults } from "@/lib/results";
import { executeTribunalRun } from "@/lib/tribunal";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Resume exactly one FAILED durable Run. claimResume is conditional, so a
 * concurrent request cannot start a duplicate recovery cycle. */
export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  if (!isCaseId(id) || !isCaseId(runId)) return NextResponse.json({ ok: false, code: "INVALID_ID", error: "The Case or Run ID is not valid." }, { status: 400 });
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) return NextResponse.json({ ok: false, code: "OPENROUTER_UNAVAILABLE", error: "Model execution is not configured." }, { status: 503 });
  const cases = new PostgresCaseRepository();
  const runs = new PostgresTribunalRunRepository();
  const modelCalls = new PostgresModelCallRepository();
  const record = await cases.getById(id);
  const run = record?.runs.find((item) => item.id === runId);
  if (!record || !run) return NextResponse.json({ ok: false, code: "RUN_NOT_FOUND", error: "No matching Tribunal Run exists." }, { status: 404 });
  let claimed;
  try { claimed = await runs.claimResume(runId); } catch { return NextResponse.json({ ok: false, code: "RUN_NOT_RESUMABLE", error: "This Run is no longer available for recovery." }, { status: 409 }); }
  const persisted = await getCaseResults({ caseId: id }, { cases, modelCalls });
  if (!persisted.ok) return NextResponse.json({ ok: false, code: "RESULTS_UNAVAILABLE", error: "The persisted Run record could not be recovered." }, { status: 409 });
  const prior = persisted.results.runs[run.runType];
  const existingAdvocates = Object.fromEntries(Object.entries(prior.advocates).filter(([, value]) => value != null));
  const existingJudges = Object.fromEntries(Object.entries(prior.judges).filter(([, value]) => value != null));
  const outcome = await executeTribunalRun({
    caseId: id, runId, runKind: run.runType, chargeSheetMarkdown: record.chargeSheetText,
    apiKey, recoveryCycle: claimed.recoveryCycle, skipMarkRunning: true,
    existingAdvocates,
    existingJudges,
  }, { runs, modelCalls });
  return NextResponse.json({ ok: outcome.ok, runId, status: outcome.ok ? "SUCCEEDED" : "FAILED" });
}
