import type { ModelCallRecord } from "../model-calls";

/**
 * Known subtotal for one aggregatable metric, plus whether every
 * contributing attempt reported that metric.
 *
 * Empty attempt sets are a known zero and complete: there are no
 * unknown contributing attempts. A provider-reported 0 is a known
 * zero. NULL stays unknown and is not estimated; the known subtotal
 * still includes every non-null value. Completeness is per metric.
 */
export type AggregatedMetric<T> = {
  value: T;
  complete: boolean;
};

export type AggregatedInt = AggregatedMetric<number>;
export type AggregatedCost = AggregatedMetric<string>;

export type UsageTotals = {
  inputTokens: AggregatedInt;
  outputTokens: AggregatedInt;
  totalTokens: AggregatedInt;
  inputCost: AggregatedCost;
  outputCost: AggregatedCost;
  totalCost: AggregatedCost;
  durationMs: AggregatedInt;
  attemptCount: number;
};

const COST_SCALE = 10;

function sumInts(values: readonly (number | null)[]): AggregatedInt {
  if (values.length === 0) {
    return { value: 0, complete: true };
  }
  let value = 0;
  let complete = true;
  for (const item of values) {
    if (item == null) {
      complete = false;
      continue;
    }
    value += item;
  }
  return { value, complete };
}

function normalizeCost(value: string): string {
  if (!value.includes(".")) {
    return value;
  }
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function toScaledInteger(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  if (!/^\d+$/.test(whole) || (fraction.length > 0 && !/^\d+$/.test(fraction))) {
    throw new Error(`Invalid cost value: ${value}`);
  }
  const padded = `${fraction}${"0".repeat(COST_SCALE)}`.slice(0, COST_SCALE);
  const scaled = BigInt(`${whole}${padded}`);
  return negative ? -scaled : scaled;
}

function fromScaledInteger(value: bigint): string {
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(COST_SCALE + 1, "0");
  const whole = digits.slice(0, -COST_SCALE);
  const fraction = digits.slice(-COST_SCALE);
  const rendered = `${negative ? "-" : ""}${whole}.${fraction}`;
  return normalizeCost(rendered);
}

export function sumCosts(values: readonly (string | null)[]): AggregatedCost {
  if (values.length === 0) {
    return { value: "0", complete: true };
  }
  let total = BigInt(0);
  let complete = true;
  for (const item of values) {
    if (item == null) {
      complete = false;
      continue;
    }
    total += toScaledInteger(item);
  }
  return { value: fromScaledInteger(total), complete };
}

export function sumUsage(
  rows: readonly Pick<
    ModelCallRecord,
    | "inputTokens"
    | "outputTokens"
    | "totalTokens"
    | "inputCost"
    | "outputCost"
    | "totalCost"
    | "durationMs"
  >[],
): UsageTotals {
  return {
    inputTokens: sumInts(rows.map((row) => row.inputTokens)),
    outputTokens: sumInts(rows.map((row) => row.outputTokens)),
    totalTokens: sumInts(rows.map((row) => row.totalTokens)),
    inputCost: sumCosts(rows.map((row) => row.inputCost)),
    outputCost: sumCosts(rows.map((row) => row.outputCost)),
    totalCost: sumCosts(rows.map((row) => row.totalCost)),
    durationMs: sumInts(rows.map((row) => row.durationMs)),
    attemptCount: rows.length,
  };
}
