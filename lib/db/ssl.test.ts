import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createSslConfig,
  DEFAULT_SUPABASE_CA_PATH,
  isSupabaseConnection,
} from "./ssl";

describe("Supabase TLS configuration", () => {
  it("treats pooler and project hosts as Supabase connections", () => {
    assert.equal(
      isSupabaseConnection(
        "postgresql://postgres:x@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
      ),
      true,
    );
    assert.equal(
      isSupabaseConnection(
        "postgresql://postgres:x@db.abcdefghijklmnop.supabase.co:5432/postgres",
      ),
      true,
    );
    assert.equal(
      isSupabaseConnection("postgresql://postgres:x@localhost:5432/postgres"),
      false,
    );
  });

  it("does not enable SSL for a local Postgres URL", () => {
    assert.equal(
      createSslConfig("postgresql://postgres:x@127.0.0.1:5432/postgres"),
      undefined,
    );
  });

  it("uses the official CA with verification enabled for Supabase", () => {
    const ssl = createSslConfig(
      "postgresql://postgres:x@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
    );
    const bundled = readFileSync(DEFAULT_SUPABASE_CA_PATH, "utf8");

    assert.ok(ssl);
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.ca, bundled);
    assert.match(bundled, /BEGIN CERTIFICATE/);
    assert.match(bundled, /END CERTIFICATE/);
  });
});
