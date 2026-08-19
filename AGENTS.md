<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Tribunal — agent rules

- Preserve the modular Tribunal architecture (`lib/tribunal`, `lib/ai/*`, `lib/db`, `lib/charge-sheet`, `lib/cases`).
- Use one reusable Tribunal engine; do not duplicate `SAME_MODEL` and `MIXED_MODELS` workflow logic.
- Keep model assignment in configuration, not orchestration branches.
- MVP charge sheets are `.md` only (read as UTF-8 text; do not parse or render Markdown); keep upload transport separate from validation/read and later pipeline stages; do not permanently store original uploads unless explicitly required.
- Persist validated Markdown text on each new unique Case; store the original file name; never store the original file/blob; do not deduplicate uploads.
- Create exactly one `SAME_MODEL` and one `MIXED_MODELS` Tribunal Run atomically with each Case; enforce unique `(case_id, run_type)` in PostgreSQL.
- Enforce a 1 MB server-side size limit and reject malformed UTF-8 rather than replacing it.
- Use version-controlled SQL migrations and server-side PostgreSQL (`pg`); do not introduce an ORM without an explicit requirement.
- Do not expose server secrets, prompts, profiles, or API keys to the client.
- Keep instructor-provided character/profiles version-controlled under `lib/ai/profiles/`; construct runtime prompts in application code.
- Keep advocate and judge response contracts centralized under `lib/ai/contracts/` as Zod schemas; the settled logical shapes are documented in `docs/architecture.md`; validate unknown structured output there before the first AI call; do not parse free-form prose for orchestration. Contract strings must be non-empty after trimming; extra fields are forbidden.
- Models may interpret and argue from supplied charge-sheet facts and prior validated outputs, but must not introduce new case facts.
- Side, profile, role, and model are application configuration; do not trust them as model-returned fields.
- Construct runtime prompts in application code from explicit layers (role, side/profile, charge sheet, prior outputs, contract, constraints); do not maintain seven unrelated prompt files.
- Do not invent the charge-sheet structural contract or missing instructor-provided profiles.
- Do not expand MVP scope without an explicit requirement.
- Prefer failure visibility; AI failures must never silently become valid verdicts.
- There is no human-recorded final verdict; each run’s two-of-three judge majority is that run’s final verdict.
- Verify work against `docs/specification.md` before reporting completion.
