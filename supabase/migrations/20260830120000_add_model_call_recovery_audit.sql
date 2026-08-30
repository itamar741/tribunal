-- Preserve every primary, fallback, and resumed attempt without changing
-- the one SAME_MODEL + one MIXED_MODELS Tribunal Run topology.

alter table tribunal_runs
  add column recovery_cycle integer not null default 0,
  add constraint tribunal_runs_recovery_cycle_check check (recovery_cycle >= 0);

alter table model_calls
  add column model_source text not null default 'PRIMARY',
  add column recovery_cycle integer not null default 1,
  add constraint model_calls_model_source_check check (model_source in ('PRIMARY', 'FALLBACK')),
  add constraint model_calls_recovery_cycle_check check (recovery_cycle >= 1);

alter table model_calls
  drop constraint model_calls_run_id_agent_role_attempt_key;

alter table model_calls
  add constraint model_calls_run_id_agent_role_cycle_source_attempt_key
    unique (run_id, agent_role, recovery_cycle, model_source, attempt);

create index model_calls_run_role_recovery_idx
  on model_calls (run_id, agent_role, recovery_cycle, model_source, attempt);
