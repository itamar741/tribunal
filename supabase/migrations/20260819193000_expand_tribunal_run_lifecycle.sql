-- Expand Tribunal Run lifecycle beyond PENDING.
-- Existing PENDING rows remain valid: new columns are nullable.

alter table tribunal_runs
  drop constraint tribunal_runs_status_check;

alter table tribunal_runs
  add column final_verdict text,
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column failure_reason text;

alter table tribunal_runs
  add constraint tribunal_runs_status_check
    check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  add constraint tribunal_runs_final_verdict_check
    check (final_verdict is null or final_verdict in ('GUILTY', 'NOT_GUILTY')),
  add constraint tribunal_runs_lifecycle_check
    check (
      (
        status = 'PENDING'
        and final_verdict is null
        and started_at is null
        and completed_at is null
        and failure_reason is null
      )
      or (
        status = 'RUNNING'
        and final_verdict is null
        and started_at is not null
        and completed_at is null
        and failure_reason is null
      )
      or (
        status = 'SUCCEEDED'
        and final_verdict in ('GUILTY', 'NOT_GUILTY')
        and started_at is not null
        and completed_at is not null
        and failure_reason is null
      )
      or (
        status = 'FAILED'
        and final_verdict is null
        and started_at is not null
        and completed_at is not null
        and failure_reason is not null
      )
    );

-- Supports a composite foreign key from model_calls (run_id, case_id).
alter table tribunal_runs
  add constraint tribunal_runs_id_case_id_key unique (id, case_id);
