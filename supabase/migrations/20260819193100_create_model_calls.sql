-- One row per actual AI API attempt. No prompts or raw model output are stored.

create table model_calls (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  run_id uuid not null references tribunal_runs (id) on delete cascade,
  stage text not null,
  agent_role text not null,
  attempt smallint not null,
  model text not null,
  status text not null,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  input_cost numeric(16, 10),
  output_cost numeric(16, 10),
  total_cost numeric(16, 10),
  duration_ms integer,
  provider_call_id text,
  validated_response jsonb,
  error_type text,
  error_message text,
  created_at timestamptz not null default now(),

  constraint model_calls_stage_check
    check (stage in ('ADVOCATES', 'JUDGES')),
  constraint model_calls_agent_role_check
    check (agent_role in (
      'DEFENSE_1',
      'DEFENSE_2',
      'PROSECUTION_1',
      'PROSECUTION_2',
      'JUDGE_1',
      'JUDGE_2',
      'JUDGE_3'
    )),
  constraint model_calls_stage_agent_role_check
    check (
      (
        stage = 'ADVOCATES'
        and agent_role in (
          'DEFENSE_1',
          'DEFENSE_2',
          'PROSECUTION_1',
          'PROSECUTION_2'
        )
      )
      or (
        stage = 'JUDGES'
        and agent_role in ('JUDGE_1', 'JUDGE_2', 'JUDGE_3')
      )
    ),
  constraint model_calls_attempt_check
    check (attempt in (1, 2)),
  constraint model_calls_status_check
    check (status in ('SUCCEEDED', 'FAILED')),
  constraint model_calls_succeeded_has_response_check
    check (status <> 'SUCCEEDED' or validated_response is not null),
  constraint model_calls_input_tokens_check
    check (input_tokens is null or input_tokens >= 0),
  constraint model_calls_output_tokens_check
    check (output_tokens is null or output_tokens >= 0),
  constraint model_calls_total_tokens_check
    check (total_tokens is null or total_tokens >= 0),
  constraint model_calls_input_cost_check
    check (input_cost is null or input_cost >= 0),
  constraint model_calls_output_cost_check
    check (output_cost is null or output_cost >= 0),
  constraint model_calls_total_cost_check
    check (total_cost is null or total_cost >= 0),
  constraint model_calls_duration_ms_check
    check (duration_ms is null or duration_ms >= 0),
  constraint model_calls_run_id_agent_role_attempt_key
    unique (run_id, agent_role, attempt),
  constraint model_calls_run_id_case_id_fkey
    foreign key (run_id, case_id) references tribunal_runs (id, case_id)
);

create index model_calls_case_id_idx on model_calls (case_id);
