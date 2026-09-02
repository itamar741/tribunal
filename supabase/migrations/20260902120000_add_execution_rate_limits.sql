create table execution_rate_limits (
  subject_hash text primary key,
  window_started_at timestamptz not null,
  action_count integer not null check (action_count >= 1 and action_count <= 5),
  updated_at timestamptz not null default now()
);

comment on table execution_rate_limits is
  'Fixed-window cost guard for model-triggering public actions. subject_hash is an HMAC; raw client IPs are never stored.';
