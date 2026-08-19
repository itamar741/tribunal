import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyMigrations, closePool, DatabaseConfigError } from "../lib/db";

function loadLocalEnv() {
  if (process.env.DATABASE_URL) {
    return;
  }
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadLocalEnv();
  const applied = await applyMigrations();
  if (applied.length === 0) {
    console.log("No pending migrations.");
  } else {
    for (const migration of applied) {
      console.log(`Applied ${migration.filename}`);
    }
  }
}

main()
  .catch((error) => {
    if (error instanceof DatabaseConfigError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
