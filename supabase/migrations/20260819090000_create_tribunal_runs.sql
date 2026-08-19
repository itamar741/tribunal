-- Tribunal Runs: exactly one SAME_MODEL and one MIXED_MODELS row per Case.
-- Status is PENDING until a later phase starts AI execution.

create table tribunal_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  run_type text not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  constraint tribunal_runs_run_type_check
    check (run_type in ('SAME_MODEL', 'MIXED_MODELS')),
  constraint tribunal_runs_status_check
    check (status = 'PENDING'),
  constraint tribunal_runs_case_id_run_type_key
    unique (case_id, run_type)
);

create index tribunal_runs_case_id_idx on tribunal_runs (case_id);

insert into tribunal_runs (case_id, run_type, status)
select
  cases.id,
  kind.run_type,
  'PENDING'
from cases
cross join (
  values
    ('SAME_MODEL'),
    ('MIXED_MODELS')
) as kind(run_type)
where not exists (
  select 1
  from tribunal_runs
  where tribunal_runs.case_id = cases.id
    and tribunal_runs.run_type = kind.run_type
);
