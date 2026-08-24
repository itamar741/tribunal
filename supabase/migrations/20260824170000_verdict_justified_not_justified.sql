-- Replace obsolete GUILTY/NOT_GUILTY verdict values with JUSTIFIED/NOT_JUSTIFIED.
-- Existing PENDING rows with final_verdict = NULL remain valid.

alter table tribunal_runs
  drop constraint tribunal_runs_final_verdict_check;

alter table tribunal_runs
  drop constraint tribunal_runs_lifecycle_check;

alter table tribunal_runs
  add constraint tribunal_runs_final_verdict_check
    check (final_verdict is null or final_verdict in ('JUSTIFIED', 'NOT_JUSTIFIED')),
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
        and final_verdict in ('JUSTIFIED', 'NOT_JUSTIFIED')
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
