export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "57P01",
  "53300",
]);

export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof DatabaseConfigError) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && DATABASE_UNAVAILABLE_CODES.has(code)) {
    return true;
  }

  const message = "message" in error ? error.message : undefined;
  return (
    typeof message === "string" &&
    /connection (?:terminated due to connection )?timeout|connect etimedout/i.test(
      message,
    )
  );
}
