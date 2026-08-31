import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { DatabaseConfigError, isDatabaseUnavailableError } from "./errors";
import { createSslConfig } from "./ssl";

let pool: Pool | undefined;

export { DatabaseConfigError, isDatabaseUnavailableError };

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new DatabaseConfigError(
      "DATABASE_URL is not configured. Set a server-only PostgreSQL connection string.",
    );
  }
  return url;
}

export function getPool(): Pool {
  if (!pool) {
    const connectionString = requireDatabaseUrl();
    pool = new Pool({
      connectionString,
      ssl: createSslConfig(connectionString),
      // Keep read-only pages from hanging indefinitely when the hosted
      // database is paused or temporarily unreachable.
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withClient(async (client) => {
    await client.query("begin");
    try {
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
