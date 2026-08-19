# Database

PostgreSQL is the system of record. Supabase is the preferred managed provider. Schema changes are version-controlled SQL files; no ORM is used.

## Connection

Set a server-only `DATABASE_URL`. Copy `.env.example` to `.env.local` and fill in the Supabase Database URI (Project Settings → Database). Do not prefix the variable with `NEXT_PUBLIC_`.

The application uses the `pg` driver from `lib/db`. Client components must not import that module.

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

## Current schema (Phase 2)

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
    check (status = 'PENDING')
  created_at timestamptz not null default now()
  unique (case_id, run_type)
```

Validated Markdown text is stored on the Case. The original uploaded file/blob is not.

Every Case has exactly two Tribunal Runs. They are inserted in the same transaction as the Case. Existing Cases are backfilled by the `tribunal_runs` migration.

`PENDING` means the run record exists and AI execution has not started. Later phases will add further statuses with a new migration rather than rewriting this one.

