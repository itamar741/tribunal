import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { withClient } from "./client";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export type AppliedMigration = {
  filename: string;
};

export async function applyMigrations(
  migrationsDir = MIGRATIONS_DIR,
): Promise<AppliedMigration[]> {
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return withClient(async (client) => {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied: AppliedMigration[] = [];

    for (const filename of files) {
      const existing = await client.query<{ filename: string }>(
        "select filename from schema_migrations where filename = $1",
        [filename],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, filename), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename) values ($1)",
          [filename],
        );
        await client.query("commit");
        applied.push({ filename });
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }

    return applied;
  });
}
