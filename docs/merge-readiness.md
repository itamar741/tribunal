# Merge readiness

This checklist translates the course's Lesson 9 guidance into the repository's review gate. A change is ready to merge only when its behavior, evidence, hygiene, rationale, and audit trail are all reviewable.

## Required before opening or merging a PR

- **Functional completeness:** the requested behavior and failure/partial-success states are implemented without unrelated scope expansion.
- **Verification:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm audit --omit=dev --audit-level=high` pass. Database-backed tests may skip only when `DATABASE_URL` is absent; migration behavior must still be checked before deployment.
- **Engineering hygiene:** no secrets, generated artifacts, debug output, unrelated formatting, stale comments, or rewritten applied migrations are included.
- **Rationale:** the PR explains why the change exists, important tradeoffs, database/environment changes, and user-visible effects.
- **Auditability:** retries, fallbacks, recovery cycles, failures, usage/cost, and security-relevant decisions remain inspectable without exposing sensitive prompt content.
- **Security review:** inspect inputs, trust boundaries, prompt-injection exposure, authorization/cost effects, secret handling, dependency findings, and failure behavior using `docs/security.md`.
- **Operational readiness:** document required migration and environment sequencing, rollback limits, and a focused smoke test. Never let an auto-deploy reach code that depends on an unapplied migration.
- **Human review:** inspect the final diff and CI result before merge. AI-generated code is evidence to review, not authority to bypass review.

For this project, prefer a small focused PR. When a change legitimately spans code, migration, tests, and documentation, explain that coupling rather than hiding it in an underspecified summary.
