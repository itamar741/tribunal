/**
 * Server-only PostgreSQL access.
 *
 * Use version-controlled SQL under supabase/migrations/.
 * Never import this module from client components.
 */

export {
  closePool,
  DatabaseConfigError,
  getPool,
  query,
  withClient,
  withTransaction,
} from "./client";
export { inspectClientTls } from "./ssl";
export { applyMigrations } from "./migrate";
