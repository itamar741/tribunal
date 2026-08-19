-- Case records for accepted Markdown charge sheets.
-- Original uploaded files are never stored; only validated UTF-8 text.

create table cases (
  id uuid primary key default gen_random_uuid(),
  original_file_name text not null,
  charge_sheet_text text not null,
  created_at timestamptz not null default now()
);
