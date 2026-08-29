import {
  EXPLICITLY_PAID_MODEL_IDS,
  ModelOutputMode,
  getOutputModeForModel,
  isExplicitlyPaidModelId,
  listConfiguredModelIds,
} from "../lib/ai/configurations";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";

type CatalogModel = {
  id: string;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  context_length?: number;
};

function isZeroPrice(value: string | undefined): boolean {
  return value === "0" || value === "0.0";
}

function expectedCapabilities(mode: ModelOutputMode): {
  responseFormat: boolean;
  structuredOutputs: boolean;
} {
  switch (mode) {
    case ModelOutputMode.JSON_SCHEMA:
      return { responseFormat: true, structuredOutputs: true };
    case ModelOutputMode.JSON_OBJECT:
      return { responseFormat: true, structuredOutputs: false };
    case ModelOutputMode.PROMPT_ONLY:
      return { responseFormat: false, structuredOutputs: false };
  }
}

async function main() {
  const response = await fetch(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`OpenRouter catalog HTTP ${response.status}`);
  }

  const body = (await response.json()) as { data?: CatalogModel[] };
  const byId = new Map((body.data ?? []).map((model) => [model.id, model]));
  const unique = [...new Set(listConfiguredModelIds())];
  const report = unique.map((id) => {
    const model = byId.get(id);
    const expectedPaid = isExplicitlyPaidModelId(id);
    if (!model) {
      return { id, present: false, expectedPaid };
    }
    const params = model.supported_parameters ?? [];
    const mode = getOutputModeForModel(id);
    const expected = expectedCapabilities(mode);
    const free =
      isZeroPrice(model.pricing?.prompt) &&
      isZeroPrice(model.pricing?.completion);
    const responseFormat = params.includes("response_format");
    const structuredOutputs = params.includes("structured_outputs");
    return {
      id,
      present: true,
      expectedPaid,
      promptPrice: model.pricing?.prompt ?? null,
      completionPrice: model.pricing?.completion ?? null,
      free,
      contextLength: model.context_length ?? null,
      outputMode: mode,
      responseFormat,
      structuredOutputs,
      capabilitiesMatch:
        responseFormat === expected.responseFormat &&
        structuredOutputs === expected.structuredOutputs,
    };
  });

  const missing = report.filter((item) => !item.present).map((item) => item.id);
  const unexpectedPaid = report
    .filter((item) => item.present && !item.expectedPaid && item.free === false)
    .map((item) => item.id);
  const unexpectedFree = report
    .filter((item) => item.present && item.expectedPaid && item.free === true)
    .map((item) => item.id);
  const capabilityMismatches = report
    .filter((item) => item.present && item.capabilitiesMatch === false)
    .map((item) => item.id);
  const unknownPaid = EXPLICITLY_PAID_MODEL_IDS.filter(
    (id) => !unique.includes(id),
  );

  console.log(JSON.stringify({ catalog: CATALOG_URL, models: report }, null, 2));

  if (
    missing.length > 0 ||
    unexpectedPaid.length > 0 ||
    unexpectedFree.length > 0 ||
    capabilityMismatches.length > 0 ||
    unknownPaid.length > 0
  ) {
    throw new Error(
      [
        missing.length > 0 ? `Missing catalog IDs: ${missing.join(", ")}` : "",
        unexpectedPaid.length > 0
          ? `Free-configured IDs now have non-zero price: ${unexpectedPaid.join(", ")}`
          : "",
        unexpectedFree.length > 0
          ? `Paid-configured IDs have zero listed price: ${unexpectedFree.join(", ")}`
          : "",
        capabilityMismatches.length > 0
          ? `Output-capability mismatch: ${capabilityMismatches.join(", ")}`
          : "",
        unknownPaid.length > 0
          ? `Paid IDs not in current configuration: ${unknownPaid.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
