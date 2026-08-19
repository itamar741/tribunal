# AI Tribunal

Next.js modular monolith for dual AI Tribunal analysis of an uploaded charge sheet.

## Docs

- [Project framing](docs/project-framing.md)
- [Architecture](docs/architecture.md)
- [Specification](docs/specification.md)
- [Implementation plan](docs/implementation-plan.md)
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

## Scope note

Charge-sheet upload validation, Case persistence, and Tribunal Run persistence (`.md` only, unique Case per upload, exactly two `PENDING` runs) are implemented. OpenRouter, Tribunal orchestration, and response schemas are intentionally not implemented yet.
