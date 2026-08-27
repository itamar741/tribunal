import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CaseResultsView } from "../../components/CaseResultsView";
import { TribunalExecutionState } from "../../components/TribunalExecutionState";
import { formatCount, formatUsd, formatVerdict } from "./format";
import {
  advocate,
  caseResults,
  failedRun,
  runView,
  succeededRun,
  usage,
} from "./fixtures";
import {
  executeCase,
  getCaseResults,
  loadPersistedResultsAfterExecution,
  uploadChargeSheet,
} from "./tribunal-client";

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

describe("format", () => {
  it("keeps JUSTIFIED and NOT_JUSTIFIED as readable labels", () => {
    assert.equal(formatVerdict("JUSTIFIED"), "Justified");
    assert.equal(formatVerdict("NOT_JUSTIFIED"), "Not Justified");
  });

  it("distinguishes complete and incomplete accounting without converting costs", () => {
    assert.equal(formatUsd({ value: "0", complete: true }), "$0");
    assert.equal(
      formatUsd({ value: "0", complete: false }),
      "$0 known (incomplete)",
    );
    assert.equal(formatCount({ value: 12, complete: false }), "12 known (incomplete)");
  });
});

describe("tribunal client", () => {
  it("returns the created Case ID after a successful upload", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = mockFetch((url, init) => {
      calls.push({ url, init });
      return Response.json({
        ok: true,
        caseId: "00000000-0000-4000-8000-000000000001",
        fileName: "case.md",
        characterCount: 12,
        createdAt: "2026-01-01T00:00:00.000Z",
        runs: [],
      });
    });
    const result = await uploadChargeSheet(
      new File(["# Case"], "case.md", { type: "text/markdown" }),
      fetchImpl,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.caseId, "00000000-0000-4000-8000-000000000001");
    }
    assert.equal(calls[0]?.url, "/api/charge-sheet");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.ok(calls[0]?.init?.body instanceof FormData);
    assert.equal(
      (calls[0]?.init?.body as FormData).has("chargeSheet"),
      true,
    );
  });

  it("executes the created Case ID with no client configuration", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = mockFetch((url, init) => {
      calls.push({ url, init });
      return Response.json({
        ok: true,
        caseId: "00000000-0000-4000-8000-000000000001",
        runs: { SAME_MODEL: { ok: true }, MIXED_MODELS: { ok: true } },
      });
    });
    await executeCase("00000000-0000-4000-8000-000000000001", fetchImpl);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "/api/cases/00000000-0000-4000-8000-000000000001/execute");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, undefined);
    const serialized = JSON.stringify(calls[0]?.init ?? {});
    assert.equal(serialized.includes("model"), false);
    assert.equal(serialized.includes("profile"), false);
    assert.equal(serialized.includes("runId"), false);
  });

  it("loads persisted results after a POST RUN_FAILURE", async () => {
    const calls: string[] = [];
    const fetchImpl = mockFetch((url) => {
      calls.push(url);
      if (url.endsWith("/execute")) {
        return Response.json({
          ok: false,
          reason: "RUN_FAILURE",
          caseId: "00000000-0000-4000-8000-000000000001",
          runs: {
            SAME_MODEL: { ok: true },
            MIXED_MODELS: { ok: false },
          },
        });
      }
      return Response.json({
        ok: true,
        ...caseResults({
          SAME_MODEL: succeededRun("SAME_MODEL", "JUSTIFIED"),
          MIXED_MODELS: failedRun("MIXED_MODELS"),
        }),
      });
    });
    const executed = await executeCase(
      "00000000-0000-4000-8000-000000000001",
      fetchImpl,
    );
    assert.equal(executed.ok, true);
    if (executed.ok) {
      assert.equal(executed.body.ok, false);
    }
    const persisted = await loadPersistedResultsAfterExecution(
      "00000000-0000-4000-8000-000000000001",
      fetchImpl,
    );
    assert.equal(persisted.ok, true);
    assert.deepEqual(calls, [
      "/api/cases/00000000-0000-4000-8000-000000000001/execute",
      "/api/cases/00000000-0000-4000-8000-000000000001/results",
    ]);
  });

  it("retrieves persisted results without posting execute", async () => {
    const methods: string[] = [];
    const fetchImpl = mockFetch((url, init) => {
      methods.push(`${init?.method ?? "GET"} ${url}`);
      return Response.json({
        ok: true,
        ...caseResults({
          SAME_MODEL: succeededRun("SAME_MODEL", "NOT_JUSTIFIED"),
          MIXED_MODELS: succeededRun("MIXED_MODELS", "JUSTIFIED"),
        }),
      });
    });
    await getCaseResults("00000000-0000-4000-8000-000000000001", fetchImpl);
    assert.deepEqual(methods, [
      "GET /api/cases/00000000-0000-4000-8000-000000000001/results",
    ]);
  });
});

describe("CaseResultsView", () => {
  it("renders independent runs and keeps a successful sibling visible", () => {
    const html = renderToStaticMarkup(
      createElement(CaseResultsView, {
        results: caseResults({
          SAME_MODEL: succeededRun("SAME_MODEL", "JUSTIFIED"),
          MIXED_MODELS: failedRun("MIXED_MODELS"),
        }),
      }),
    );
    assert.match(html, /SAME_MODEL/);
    assert.match(html, /MIXED_MODELS/);
    assert.match(html, /Final verdict: Justified/);
    assert.match(html, /This run failed/);
    assert.match(html, /Jon Snow/);
    assert.match(html, /Daenerys Targaryen/);
    assert.match(html, /Aaron Barak/);
    assert.equal(html.includes("Guilty"), false);
    assert.equal(html.includes("# Secret charge"), false);
    assert.equal(html.includes("OPENROUTER"), false);
    assert.equal(html.includes("<<<CHARGE_SHEET>>>"), false);
  });

  it("displays persisted NOT_JUSTIFIED and does not invent a majority", () => {
    const mixed = succeededRun("MIXED_MODELS", "NOT_JUSTIFIED");
    mixed.judges = {
      JUDGE_1: { verdict: "JUSTIFIED", summary: "j1", key_reasons: ["a", "b", "c"] },
      JUDGE_2: { verdict: "JUSTIFIED", summary: "j2", key_reasons: ["a", "b", "c"] },
      JUDGE_3: { verdict: "NOT_JUSTIFIED", summary: "j3", key_reasons: ["a", "b", "c"] },
    };
    const html = renderToStaticMarkup(
      createElement(CaseResultsView, {
        results: caseResults({
          SAME_MODEL: runView("SAME_MODEL"),
          MIXED_MODELS: mixed,
        }),
      }),
    );
    assert.match(html, /Final verdict: Not Justified/);
    assert.equal(html.includes("Final verdict: Justified"), false);
  });

  it("marks incomplete accounting as known but not guaranteed", () => {
    const html = renderToStaticMarkup(
      createElement(CaseResultsView, {
        results: caseResults(
          {
            SAME_MODEL: failedRun("SAME_MODEL"),
            MIXED_MODELS: runView("MIXED_MODELS"),
          },
          usage({ totalCost: { value: "0", complete: false } }),
        ),
      }),
    );
    assert.match(html, /\$0 known \(incomplete\)/);
  });

  it("renders an explicit deliberating state without fake progress", () => {
    const html = renderToStaticMarkup(createElement(TribunalExecutionState));
    assert.match(html, /The Tribunal is deliberating/);
    assert.equal(html.includes("%"), false);
  });

  it("shows an in-progress Run without inventing a verdict", () => {
    const html = renderToStaticMarkup(
      createElement(CaseResultsView, {
        results: caseResults({
          SAME_MODEL: runView("SAME_MODEL", {
            status: "RUNNING",
            advocates: {
              DEFENSE_1: advocate("DEFENSE_1"),
              DEFENSE_2: null,
              PROSECUTION_1: null,
              PROSECUTION_2: null,
            },
          }),
          MIXED_MODELS: runView("MIXED_MODELS"),
        }),
      }),
    );
    assert.match(html, /This run is incomplete/);
    assert.equal(html.includes("Final verdict"), false);
  });
});

