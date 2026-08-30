-- Safe, normalized failure classification for product UI and audit records.
alter table model_calls
  add column failure_classification text,
  add constraint model_calls_failure_classification_check check (
    failure_classification is null or failure_classification in (
      'RATE_LIMITED', 'TEMPORARY_PROVIDER_ERROR', 'INVALID_OUTPUT',
      'MODEL_UNAVAILABLE', 'AUTH_OR_CONFIGURATION_ERROR', 'SYSTEM_ERROR'
    )
  );
