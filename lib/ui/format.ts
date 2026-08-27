import type { AggregatedCost, AggregatedInt } from "./types";

export function formatVerdict(
  verdict: "JUSTIFIED" | "NOT_JUSTIFIED",
): "Justified" | "Not Justified" {
  return verdict === "JUSTIFIED" ? "Justified" : "Not Justified";
}

export function formatRunStatus(
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED",
): string {
  switch (status) {
    case "PENDING":
      return "Not started";
    case "RUNNING":
      return "In progress";
    case "SUCCEEDED":
      return "Succeeded";
    case "FAILED":
      return "Failed";
  }
}

export function formatUsd(metric: AggregatedCost): string {
  const amount = `$${metric.value}`;
  return metric.complete ? amount : `${amount} known (incomplete)`;
}

export function formatCount(metric: AggregatedInt): string {
  const amount = String(metric.value);
  return metric.complete ? amount : `${amount} known (incomplete)`;
}

export function formatDuration(metric: AggregatedInt): string {
  const amount = `${metric.value} ms`;
  return metric.complete ? amount : `${amount} known (incomplete)`;
}
