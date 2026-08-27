import {
  MIXED_MODELS_BY_ROLE,
  SAME_MODEL_ID,
  STANDBY_MODEL_IDS,
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

async function main() {
  const response = await fetch(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`OpenRouter catalog HTTP ${response.status}`);
  }

  const body = (await response.json()) as { data?: CatalogModel[] };
  const byId = new Map((body.data ?? []).map((model) => [model.id, model]));
  const required = [
    SAME_MODEL_ID,
    ...Object.values(MIXED_MODELS_BY_ROLE),
    ...STANDBY_MODEL_IDS,
  ];
  const unique = [...new Set(required)];
  const report = unique.map((id) => {
    const model = byId.get(id);
    if (!model) {
      return { id, present: false };
    }
    const params = model.supported_parameters ?? [];
    return {
      id,
      present: true,
      promptPrice: model.pricing?.prompt ?? null,
      completionPrice: model.pricing?.completion ?? null,
      free:
        isZeroPrice(model.pricing?.prompt) &&
        isZeroPrice(model.pricing?.completion),
      contextLength: model.context_length ?? null,
      responseFormat: params.includes("response_format"),
      structuredOutputs: params.includes("structured_outputs"),
    };
  });

  const missing = report.filter((item) => !item.present).map((item) => item.id);
  const paid = report
    .filter((item) => item.present && item.free === false)
    .map((item) => item.id);

  console.log(JSON.stringify({ catalog: CATALOG_URL, models: report }, null, 2));

  if (missing.length > 0 || paid.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `Missing catalog IDs: ${missing.join(", ")}` : "",
        paid.length > 0 ? `Non-zero listed price: ${paid.join(", ")}` : "",
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
