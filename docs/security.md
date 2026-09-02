# Security and threat model

This document records the security reasoning expected for a merge-ready Tribunal change. It focuses on the current public course-demo deployment and does not claim that the application is a multi-tenant production service.

## Assets and trust boundaries

The protected assets are the OpenRouter key and spend, PostgreSQL credentials and persisted Case/audit data, server-owned prompts and profiles, and the integrity of each verdict. The browser, charge-sheet text, advocate output, proxy headers received outside the trusted Render deployment, and model output are untrusted. Next.js server routes, version-controlled configuration, and database constraints form the authority boundary.

## Principal threats and controls

- **Prompt injection or fabricated facts:** trusted instructions are separated from delimited untrusted Case and advocate content. Models have no tools or secrets. Outputs must pass strict centralized Zod contracts before orchestration uses them; invalid or incomplete output fails closed.
- **Secret disclosure:** database and OpenRouter credentials remain server-only and have no `NEXT_PUBLIC_*` equivalents. Prompts, raw responses, hidden reasoning, and provider request bodies are not persisted or returned to the browser.
- **Duplicate execution and cost amplification:** durable state transitions prevent duplicate initial execution, Resume atomically claims a failed Run, retries/fallbacks are bounded and audited, and the optional production cost guard admits five launches or eligible Resume actions per client subject per hour.
- **Rate-limit privacy:** the trusted proxy address is HMAC-SHA256 hashed with a dedicated server secret. Raw client IP addresses are never persisted. The limiter uses one atomic PostgreSQL statement so concurrent requests cannot bypass the count.
- **Data and verdict integrity:** foreign keys, uniqueness/check constraints, runtime contracts, server-owned model assignment, and immutable call records prevent the client or a partial run from manufacturing a verdict.
- **Dependency risk:** CI installs from the lockfile and rejects high-severity production dependency findings with `npm audit --omit=dev --audit-level=high`. GitHub dependency and secret scanning should be enabled in repository settings when available.
- **Operational failure:** TLS certificate verification stays enabled, migrations are append-only, operator-run, and protected by a PostgreSQL advisory lock; failures remain visible, and persisted state is the source of truth after request or host interruption.

## Cost-guard behavior

When `RATE_LIMIT_ENABLED=true`, `POST /api/cases` consumes one action before creating a Case, reserving the subsequent automatic initial execution. An eligible `POST /api/cases/{id}/runs/{runId}/resume` consumes one action after validating that the Run exists and is `FAILED`. Read-only requests and clearly invalid/non-resumable requests do not consume quota. A denied action returns `429`, a `Retry-After` value, and no model call is started.

The fixed-window limiter is deliberately small and explainable. It reduces accidental or casual cost amplification but is not identity, authorization, bot detection, or a guaranteed budget ceiling. NAT users can share a limit, addresses can change, and a determined distributed actor can bypass a per-address control.

## Review checklist

- Confirm browser-controlled values cannot select models, prompts, profiles, retries, verdicts, or Case content.
- Confirm every new model-triggering route is either covered by the shared cost guard or explicitly justified.
- Confirm failure paths create no fabricated verdict and preserve auditable attempts/cost.
- Confirm logs and API responses contain no credentials, raw prompt payloads, raw model output, or raw client addresses.
- Run the verification gate in `docs/merge-readiness.md` and review the diff before merge.

## Accepted residual risks

There is no login, per-user authorization, global spend cap, WAF/bot service, deletion workflow, or formal data-retention policy. Those controls are intentionally deferred for the current demo scope and are tracked in `docs/backlog.md`. If the deployment becomes public beyond supervised course use, revisit them before expanding traffic or sensitive content.
