# AI Tribunal

Next.js modular monolith for dual AI Tribunal analysis of a fixed canonical charge sheet.

The MVP is complete. Production is live on Render (GitHub `main` auto-deploy, Supabase PostgreSQL, OpenRouter). The accepted production dual-run E2E succeeded: both `SAME_MODEL` and `MIXED_MODELS` persisted `NOT_JUSTIFIED`, results survived reload without rerunning models, and duplicate execution is prevented.

## Submission

- Student: Itamar Shapira
- Student ID: 208575076

## Docs

- [Course dossier alignment](docs/course-alignment.md)
- [Project framing](docs/project-framing.md)
- [Architecture](docs/architecture.md)
- [Specification](docs/specification.md)
- [Implementation plan](docs/implementation-plan.md)
- [Model selection](docs/model-selection.md)
- [Database](docs/database.md)
- [Deployment](docs/deployment.md)
- [Security and threat model](docs/security.md)
- [Merge readiness](docs/merge-readiness.md)
- [Product backlog](docs/backlog.md)

## Getting started

```bash
cp .env.example .env.local
# Set DATABASE_URL and OPENROUTER_API_KEY in .env.local.
# Leave RATE_LIMIT_ENABLED unset locally unless you are testing the cost guard.
npm install
npm run migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The homepage starts a fresh hearing of the server-owned T-001 record with one action; it does not accept file uploads. Past Cases keeps manual retrieval by known Case ID and lists the five most recently executed Cases as a convenience. That list is not a Case-management system: there is no pagination, search, deletion, renaming, or rerun control.

Before opening a pull request, run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=high
```

The same verification gate runs in GitHub Actions. PostgreSQL integration tests run when `DATABASE_URL` is available and otherwise skip cleanly; production migrations remain an explicit operator action. Before enabling the production cost guard, apply migrations and set its two server-only variables as described in [Deployment](docs/deployment.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Lint |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Focused unit tests |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run verify:openrouter-slice` | One live OpenRouter DEFENSE_1 attempt (requires `OPENROUTER_API_KEY`) |
| `npm run verify:openrouter-retry` | Live bounded-retry DEFENSE_1 execution, at most two attempts (requires `OPENROUTER_API_KEY`) |
| `npm run verify:openrouter-advocate-stage` | Live four-Advocate SAME_MODEL stage, at most eight attempts (requires `OPENROUTER_API_KEY`) |
| `npm run verify:openrouter-judge-stage` | Live three-Judge SAME_MODEL stage with fixture advocates, at most six attempts (requires `OPENROUTER_API_KEY`) |
| `npm run verify:openrouter-tribunal-run` | Live one SAME_MODEL Tribunal Run (advocates then judges), at most fourteen attempts (requires `OPENROUTER_API_KEY`) |
| `npm run verify:openrouter-catalog` | Check configured model IDs against the live OpenRouter `/api/v1/models` catalog |

## Scope note

MVP implementation is complete: canonical Case creation, Case and Tribunal Run persistence, Model Call audit, Zod contracts, instructor profiles, runtime prompts, version-controlled OpenRouter assignment, bounded retry, the reusable Tribunal engine, persisted results/accounting, HTTP execute/results routes, and the reviewer UI. The homepage creates and immediately starts a fresh hearing of T-001; it also lists recent Cases and keeps manual known-Case retrieval. Production is a Render Free Web Service with auto-deploy from `main`. See [docs/deployment.md](docs/deployment.md) and [docs/implementation-plan.md](docs/implementation-plan.md). Canonical model-selection rationale: [docs/model-selection.md](docs/model-selection.md).
