# AI Tribunal

Next.js modular monolith for dual AI Tribunal analysis of an uploaded charge sheet.

## Docs

- [Project framing](docs/project-framing.md)
- [Architecture](docs/architecture.md)
- [Specification](docs/specification.md)
- [Implementation plan](docs/implementation-plan.md)
- [Model selection](docs/model-selection.md)
- [Database](docs/database.md)

## Getting started

```bash
cp .env.example .env.local
# Set DATABASE_URL to a Supabase or local PostgreSQL connection string.
npm install
npm run migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

Charge-sheet upload validation, Case persistence, Tribunal Run lifecycle persistence, Model Call audit persistence, runtime response-contract validators, the canonical T-001 charge-sheet fixture, instructor agent profiles, provider-agnostic runtime prompt builders, version-controlled OpenRouter model assignment, a one-agent audited OpenRouter slice, bounded two-attempt representative retry, the four-advocate parallel stage, the three-judge parallel stage with two-of-three majority, and single-run orchestration (`executeTribunalRun`) are implemented. Dual-run orchestration and results UI are intentionally not implemented yet. Canonical model-selection rationale: [docs/model-selection.md](docs/model-selection.md).
