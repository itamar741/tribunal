# Database

PostgreSQL is the system of record. Supabase is the preferred managed provider. Schema changes are version-controlled SQL files; no ORM is used.

## Connection

Set a server-only `DATABASE_URL`. Copy `.env.example` to `.env.local` and fill in the Supabase Database URI (Project Settings → Database). Do not prefix the variable with `NEXT_PUBLIC_`.

The application uses the `pg` driver from `lib/db`. Client components must not import that module.

### TLS

Supabase connections use encrypted transport with certificate verification (`verify-full` equivalent):

- TLS is enabled in the `pg` pool `ssl` object, not via `sslmode` on `DATABASE_URL`.
- The official CA is `certs/prod-ca-2021.crt` (`prod-ca-2021.crt` from Database Settings → SSL Configuration).
- `rejectUnauthorized` remains `true`. Hostname verification uses the Node TLS default.
- Override the CA path with `DATABASE_SSL_CA` if you download a newer certificate from the dashboard.

Do not add `sslmode`, `sslrootcert`, `sslcert`, or `sslkey` to `DATABASE_URL`. node-postgres replaces the `ssl` object when those URI parameters are present.

Local non-Supabase Postgres URLs do not force TLS unless `DATABASE_SSL_CA` is set.

`pg_stat_ssl` reports the pooler’s backend session to Postgres, not the client-to-pooler socket. For the shared transaction pooler that view can show `ssl = false` even when the client connection is TLS. Confirm client TLS from the Node `TLSSocket` (`encrypted` and `authorized`).

## Migrations

SQL files live in `supabase/migrations/` and are named:

```text
YYYYMMDDHHMMSS_description.sql
```

They are append-only. Later schema changes add new files; do not rewrite applied migrations.

Apply pending files:

```bash
npm run migrate
```

The runner:

1. Connects with `DATABASE_URL`.
2. Creates `schema_migrations` if needed.
3. Applies unrecorded `*.sql` files in filename order, one transaction each.
4. Records each filename after a successful apply.

This works against a fresh Supabase/PostgreSQL database and against later local/dev databases. Do not make dashboard-only schema edits.

## Current schema (Phase 4A)

```text
cases
  id uuid primary key default gen_random_uuid()
  original_file_name text not null
  charge_sheet_text text not null
  created_at timestamptz not null default now()

tribunal_runs
  id uuid primary key default gen_random_uuid()
  case_id uuid not null references cases(id) on delete cascade
  run_type text not null
    check (run_type in ('SAME_MODEL', 'MIXED_MODELS'))
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'))
  final_verdict text
    check (final_verdict is null or final_verdict in ('GUILTY', 'NOT_GUILTY'))
  started_at timestamptz
  completed_at timestamptz
  failure_reason text
  created_at timestamptz not null default now()
  unique (case_id, run_type)
  unique (id, case_id)

model_calls
  id uuid primary key default gen_random_uuid()
  case_id uuid not null references cases(id) on delete cascade
  run_id uuid not null references tribunal_runs(id) on delete cascade
  stage text not null
    check (stage in ('ADVOCATES', 'JUDGES'))
  agent_role text not null
    check (agent_role in (
      'DEFENSE_1', 'DEFENSE_2',
      'PROSECUTION_1', 'PROSECUTION_2',
      'JUDGE_1', 'JUDGE_2', 'JUDGE_3'
    ))
  attempt smallint not null
    check (attempt in (1, 2))
  model text not null
  status text not null
    check (status in ('SUCCEEDED', 'FAILED'))
  input_tokens integer
  output_tokens integer
  total_tokens integer
  input_cost numeric(16, 10)
  output_cost numeric(16, 10)
  total_cost numeric(16, 10)
  duration_ms integer
  provider_call_id text
  validated_response jsonb
  error_type text
  error_message text
  created_at timestamptz not null default now()
  unique (run_id, agent_role, attempt)
  foreign key (run_id, case_id) references tribunal_runs(id, case_id)
```

Validated Markdown text is stored on the Case. The original uploaded file/blob is not.

Every Case has exactly two Tribunal Runs. They are inserted in the same transaction as the Case. Existing Cases were backfilled by the `tribunal_runs` migration.

Run lifecycle:

- `PENDING`: the run exists; AI execution has not started. Companion result fields are null.
- `RUNNING`: AI execution has started (`started_at` set).
- `SUCCEEDED`: required agents completed and a valid `final_verdict` (`GUILTY` or `NOT_GUILTY`) exists.
- `FAILED`: execution terminated according to the documented failure policy. `failure_reason` is stored; `final_verdict` must be null.

Each `model_calls` row is one actual AI API attempt. `SUCCEEDED` means the output passed the applicable runtime response contract; that structured output is stored in `validated_response`. Failed attempts normally store `NULL` there. Unknown usage/cost is `NULL`, never zero. Prompts, raw model output, hidden reasoning, and provider request payloads are not stored.

Useful indexes: `tribunal_runs(case_id)`, `model_calls(case_id)`. Lookups by Tribunal Run use the unique `(run_id, agent_role, attempt)` index.

