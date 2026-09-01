import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenCasePanel } from "../../components/OpenCaseForm";
import { CaseResultsView } from "../../components/CaseResultsView";
import { TribunalExecutionState } from "../../components/TribunalExecutionState";
import {
  formatCount,
  formatLocalDateTime,
  formatUsd,
  formatVerdict,
  shortenCaseId,
} from "./format";
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
  executeCaseWithLiveProgress,
  getCaseResults,
  getRecentCases,
  loadPersistedResultsAfterExecution,
  createCanonicalCase,
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

  it("formats a persisted UTC timestamp in local date and time", () => {
    const rendered = formatLocalDateTime("2026-08-29T10:42:00.000Z");
    const expected = formatLocalDateTime(new Date("2026-08-29T10:42:00.000Z"));
    assert.equal(rendered, expected);
    assert.match(rendered, /Aug 2026 · \d{2}:\d{2}/);
  });

  it("shortens a Case ID for secondary display", () => {
    assert.equal(
      shortenCaseId("7f3a2cde-0000-4000-8000-000000000001"),
      "7f3a2c",
    );
  });
});

describe("tribunal client", () => {
  it("creates the canonical Case without client-supplied input", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = mockFetch((url, init) => {
      calls.push({ url, init });
      return Response.json({
        ok: true,
        caseId: "00000000-0000-4000-8000-000000000001",
        fileName: "t-001-the-realm-v-jon-snow.md",
        characterCount: 12,
        createdAt: "2026-01-01T00:00:00.000Z",
        runs: [],
      });
    });
    const result = await createCanonicalCase(fetchImpl);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.caseId, "00000000-0000-4000-8000-000000000001");
    }
    assert.equal(calls[0]?.url, "/api/cases");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(calls[0]?.init?.body, undefined);
    assert.equal(JSON.stringify(calls[0]?.init ?? {}).includes("chargeSheet"), false);
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

  it("keeps streamed model drafts separate from the final execution response", async () => {
    const encoder = new TextEncoder();
    const progress: string[] = [];
    const fetchImpl = mockFetch((_url, init) => {
      assert.equal((init?.headers as Record<string, string>).Accept, "text/event-stream");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('event: model-progress\ndata: {"type":"attempt_started","runId":"run-1","runKind":"SAME_MODEL","role":"DEFENSE_1","stage":"ADVOCATES","model":"model-a","attempt":1,"modelSource":"PRIMARY","recoveryCycle":1}\n\n'));
          controller.enqueue(encoder.encode('event: model-progress\ndata: {"type":"draft_delta","runId":"run-1","runKind":"SAME_MODEL","role":"DEFENSE_1","stage":"ADVOCATES","model":"model-a","attempt":1,"modelSource":"PRIMARY","recoveryCycle":1,"delta":"unverified words"}\n\n'));
          controller.enqueue(encoder.encode('event: execution-complete\ndata: {"status":200,"body":{"ok":true,"caseId":"00000000-0000-4000-8000-000000000001","runs":{"SAME_MODEL":{"ok":true},"MIXED_MODELS":{"ok":true}}}}\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    });
    const result = await executeCaseWithLiveProgress(
      "00000000-0000-4000-8000-000000000001",
      (event) => progress.push(`${event.type}:${event.model}:${event.delta ?? ""}`),
      fetchImpl,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(progress, [
      "attempt_started:model-a:",
      "draft_delta:model-a:unverified words",
    ]);
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

  it("loads recent Cases with GET only and never posts execute", async () => {
    const methods: string[] = [];
    const fetchImpl = mockFetch((url, init) => {
      methods.push(`${init?.method ?? "GET"} ${url}`);
      return Response.json({
        ok: true,
        cases: [
          {
            caseId: "00000000-0000-4000-8000-000000000001",
            originalFileName: "01-t-001-charge-sheet.md",
            executedAt: "2026-08-29T10:42:00.000Z",
            totalCost: { value: "0.0124", complete: true },
          },
        ],
      });
    });
    const result = await getRecentCases(fetchImpl);
    assert.equal(result.ok, true);
    assert.deepEqual(methods, ["GET /api/cases/recent"]);
    assert.equal(methods.some((entry) => entry.includes("/execute")), false);
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
    assert.match(html, /verdict-stamp-reveal is-waiting/);
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

function recentCaseView(
  index: number,
  overrides: {
    caseId?: string;
    originalFileName?: string;
    executedAt?: string;
    totalCost?: { value: string; complete: boolean };
  } = {},
) {
  return {
    caseId: overrides.caseId ?? `00000000-0000-4000-8000-00000000000${index}`,
    originalFileName: overrides.originalFileName ?? `case-${index}.md`,
    executedAt: overrides.executedAt ?? `2026-08-2${index}T10:42:00.000Z`,
    totalCost: overrides.totalCost ?? { value: "0.0124", complete: true },
  };
}

describe("OpenCasePanel", () => {
  it("keeps the manual Case ID input while rendering five recent Cases", () => {
    const cases = [5, 4, 3, 2, 1].map((index) => recentCaseView(index));
    const html = renderToStaticMarkup(
      createElement(OpenCasePanel, {
        formError: null,
        recent: { status: "ready", cases },
        onSubmit() {},
      }),
    );
    assert.match(html, /Open an existing Case/);
    assert.match(html, /name="caseId"/);
    assert.match(html, /Recent Cases/);
    assert.ok(html.indexOf("case-5.md") < html.indexOf("case-4.md"));
    assert.ok(html.indexOf("case-4.md") < html.indexOf("case-1.md"));
    assert.match(html, /href="\/cases\/00000000-0000-4000-8000-000000000005"/);
    assert.equal(html.includes("/execute"), false);
    assert.equal(html.includes("method=\"post\""), false);
  });

  it("renders filename, local date-time, shortened Case ID, and cost", () => {
    const executedAt = "2026-08-29T10:42:00.000Z";
    const html = renderToStaticMarkup(
      createElement(OpenCasePanel, {
        formError: null,
        recent: {
          status: "ready",
          cases: [
            recentCaseView(1, {
              caseId: "7f3a2cde-0000-4000-8000-000000000001",
              originalFileName: "01-t-001-charge-sheet.md",
              executedAt,
              totalCost: { value: "0.0124", complete: true },
            }),
          ],
        },
        onSubmit() {},
      }),
    );
    assert.match(html, /01-t-001-charge-sheet\.md/);
    assert.equal(html.includes(formatLocalDateTime(executedAt)), true);
    assert.match(html, /Case 7f3a2c…/);
    assert.match(html, /\$0\.0124/);
    assert.equal(html.includes("known (incomplete)"), false);
  });

  it("marks incomplete cost as known but not guaranteed", () => {
    const html = renderToStaticMarkup(
      createElement(OpenCasePanel, {
        formError: null,
        recent: {
          status: "ready",
          cases: [
            recentCaseView(1, {
              totalCost: { value: "0.0124", complete: false },
            }),
          ],
        },
        onSubmit() {},
      }),
    );
    assert.match(html, /\$0\.0124 known \(incomplete\)/);
  });

  it("shows a loading state only in the Recent Cases area", () => {
    const html = renderToStaticMarkup(
      createElement(OpenCasePanel, {
        formError: null,
        recent: { status: "loading" },
        onSubmit() {},
      }),
    );
    assert.match(html, /Loading recent Cases/);
    assert.match(html, /name="caseId"/);
    assert.match(html, /Open Case/);
  });

  it("shows the empty recent-list state without removing Case ID entry", () => {
    const html = renderToStaticMarkup(
      createElement(OpenCasePanel, {
        formError: null,
        recent: { status: "empty" },
        onSubmit() {},
      }),
    );
    assert.match(html, /No executed Cases yet/);
    assert.match(html, /name="caseId"/);
    assert.match(html, /Open Case/);
  });

  it("keeps manual Case opening available when recent-history loading fails", () => {
    const html = renderToStaticMarkup(
      createElement(OpenCasePanel, {
        formError: null,
        recent: { status: "error" },
        onSubmit() {},
      }),
    );
    assert.match(html, /Recent Cases could not be loaded/);
    assert.match(html, /name="caseId"/);
    assert.match(html, /Open Case/);
    assert.match(html, /id="case-id"/);
  });
});
