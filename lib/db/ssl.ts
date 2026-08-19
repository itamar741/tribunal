import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TLSSocket } from "node:tls";
import type { ConnectionOptions } from "node:tls";
import type { PoolClient } from "pg";
import { DatabaseConfigError } from "./errors";

export const DEFAULT_SUPABASE_CA_PATH = path.join(
  process.cwd(),
  "certs",
  "prod-ca-2021.crt",
);

export type ClientTlsState = {
  encrypted: boolean;
  authorized: boolean | null;
  protocol: string | null;
};

function hostnameFrom(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

export function isSupabaseConnection(connectionString: string): boolean {
  const hostname = hostnameFrom(connectionString);
  if (!hostname) {
    return /supabase\.(?:co|com)/i.test(connectionString);
  }
  return (
    /(^|\.)pooler\.supabase\.com$/i.test(hostname) ||
    /(^|\.)supabase\.co$/i.test(hostname)
  );
}

function readPemCertificate(caPath: string, ignoreTrace: boolean): string {
  const missing = ignoreTrace
    ? !existsSync(/* turbopackIgnore: true */ caPath)
    : !existsSync(caPath);
  if (missing) {
    throw new DatabaseConfigError(
      `DATABASE SSL CA file was not found at ${caPath}. Download prod-ca-2021.crt from Supabase Database Settings → SSL Configuration.`,
    );
  }

  const ca = ignoreTrace
    ? readFileSync(/* turbopackIgnore: true */ caPath, "utf8")
    : readFileSync(caPath, "utf8");
  if (!ca.includes("BEGIN CERTIFICATE")) {
    throw new DatabaseConfigError(
      `DATABASE SSL CA file at ${caPath} is not a PEM certificate.`,
    );
  }
  return ca;
}

/**
 * Official verified TLS for Postgres.
 * Supabase: use the dashboard CA (`prod-ca-2021.crt`) with certificate
 * and hostname verification enabled. Do not put sslmode on DATABASE_URL;
 * node-postgres would replace this ssl object.
 * @see https://supabase.com/docs/guides/platform/ssl-enforcement
 * @see https://node-postgres.com/features/ssl
 */
export function createSslConfig(
  connectionString: string,
): ConnectionOptions | undefined {
  const configured = process.env.DATABASE_SSL_CA?.trim();
  if (configured) {
    const caPath = path.isAbsolute(configured)
      ? configured
      : path.resolve(/* turbopackIgnore: true */ process.cwd(), configured);
    return {
      ca: readPemCertificate(caPath, true),
      rejectUnauthorized: true,
    };
  }

  if (!isSupabaseConnection(connectionString)) {
    return undefined;
  }

  const bundledCaPath = path.join(process.cwd(), "certs", "prod-ca-2021.crt");
  return {
    ca: readPemCertificate(bundledCaPath, false),
    rejectUnauthorized: true,
  };
}

export function inspectClientTls(client: PoolClient): ClientTlsState {
  const stream = (
    client as unknown as { connection?: { stream?: unknown } }
  ).connection?.stream;

  if (stream instanceof TLSSocket) {
    return {
      encrypted: stream.encrypted,
      authorized: stream.authorized,
      protocol: stream.getProtocol(),
    };
  }

  return {
    encrypted: false,
    authorized: null,
    protocol: null,
  };
}
