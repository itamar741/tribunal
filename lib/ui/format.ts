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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatLocalDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = MONTHS[date.getMonth()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${month} ${date.getFullYear()} · ${hours}:${minutes}`;
}

export function shortenCaseId(caseId: string): string {
  return caseId.replace(/-/g, "").slice(0, 6);
}
