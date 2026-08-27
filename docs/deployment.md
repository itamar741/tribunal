# Deployment

Durable decisions for hosting the current synchronous MVP. This document does not authorize deployment by itself. Do not store credentials here.

## Selected topology

**Vercel Pro (Node.js Functions) + existing Supabase PostgreSQL + OpenRouter.**

No host was configured in the repository (`vercel.json`, Docker, and other platform files are absent). The execute route already declares Vercel Function conventions:

```ts
export const runtime = "nodejs";
export const maxDuration = 800;
```

Those exports are ignored by `next start`. They are the binding that makes one synchronous Case execution legal on Vercel Pro.

Vercel Hobby is **not** sufficient. Official Fluid compute limits ([Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration), last updated 24 Aug 2026):

| Plan | Default | Maximum |
| --- | --- | --- |
| Hobby | 300s | 300s |
| Pro / Enterprise | 300s | 800s (1800s extended is beta) |

Hobby’s 300s ceiling is below the bounded worst-case execute duration. Pro’s 800s maximum, with the existing `maxDuration = 800`, covers it.

Realistic alternatives that also keep the synchronous path (no queues, workers, SSE, or polling):

- **Render Web Service** (`npm run build` + `npm start`): official comparison documents HTTP responses up to 100 minutes ([Render vs Vercel](https://render.com/docs/render-vs-vercel-comparison)). Suitable if Vercel Pro is unavailable.
- **Railway public HTTP**: official limit is 15 minutes only if data keeps transferring; otherwise the edge closes the request after **5 minutes of no data** ([Specs & Limits](https://docs.railway.com/networking/public-networking/specs-and-limits)). A silent execute wait can exceed 5 minutes. Not selected.
- **Fly.io**: no function-duration cap, but the proxy idle timeout is configurable and defaults short. Would require an explicit high `idle_timeout`. Not the smallest Next.js path.

Do not move to queues, workers, SSE, or polling unless a later measured host limit proves the synchronous request cannot finish.

## Required environment

Set these on the host. Never use a `NEXT_PUBLIC_*` prefix. None of these values belong in the browser bundle.

| Variable | Class | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | secret | Server-only PostgreSQL URI. For Vercel, prefer the Supabase **transaction pooler** host (`*.pooler.supabase.com`, port 6543). Do not add `sslmode`, `sslrootcert`, `sslcert`, or `sslkey`. |
| `OPENROUTER_API_KEY` | secret | Server-only OpenRouter key for live model requests. |
| `DATABASE_SSL_CA` | optional non-secret path | Override path to the official Supabase CA. Defaults to `certs/prod-ca-2021.crt` for Supabase hosts. |

TLS remains `rejectUnauthorized: true` with the bundled official CA. Do not disable verification.

Node.js **20.9+** is required by Next.js 16. The `pg` driver requires the Node.js runtime (`runtime = "nodejs"` is already set). Edge/Bun-only runtimes are not acceptable.

Build and start (used by persistent hosts; Vercel runs `next build` and serves Functions):

```bash
npm run build
npm run start
```

Migrations are **not** part of the web process:

```bash
npm run migrate
```

## Database and TLS

- Migrations under `supabase/migrations/` are append-only. Apply them with `npm run migrate` from a trusted checkout that has production `DATABASE_URL`. Do not apply them from a request handler. Do not rewrite applied files.
- The runner reads SQL from `process.cwd()/supabase/migrations` and records filenames in `schema_migrations`.
- The bundled CA is `certs/prod-ca-2021.crt` (version-controlled). `createSslConfig` reads it from `process.cwd()`. That works on Vercel and on `next start` as long as the repo files are present. No writable filesystem is required.
- The `pg` pool is a process-local singleton. Correctness is in PostgreSQL, not in process memory. Default pool size is appropriate for a single concurrent Case (up to eight concurrent model calls, then six). Use the transaction pooler on serverless so isolates do not exhaust direct connections.

Do not weaken TLS. Do not apply production migrations until the deploy phase.

## Synchronous execution duration

`POST /api/cases/{id}/execute` waits for both Tribunal Runs.

Topology:

- two Runs concurrently;
- each Run: four Advocates concurrently, then (only if all four succeed) three Judges concurrently;
- each agent: at most two attempts;
- per-attempt timeout: 90 seconds (`OPENROUTER_ATTEMPT_TIMEOUT_MS`);
- retry delay: 0s (invalid output), 1s (timeout / network / 5xx), or up to 60s (`Retry-After`, clamped).

Per-agent bound: `90s + 60s + 90s = 240s`.

One Run bound (Advocate wave then Judge wave): `240s + 240s = 480s`.

Case HTTP bound (Runs in parallel): **about 480 seconds**, plus a small persistence/prompt overhead (treat **≤ 520 seconds** as the planning ceiling).

This is not `28 × 90s`. Concurrency collapses the 28 attempts into two sequential waves per Run, and the two Runs overlap.

**Normal shape (no measurement claimed):** one successful attempt per agent, typical model latency tens of seconds, both Runs overlapping → often **1–3 minutes**.

**Worst-case bound:** every agent in the critical path uses a full timeout or a 60s `Retry-After` plus a second full timeout → **~8 minutes**, under the 800s Function limit.

If the host kills the request first, persisted `RUNNING` / `FAILED` rows and any completed `model_calls` remain the source of truth. Reload `/cases/{id}` must only `GET` results.

## Process constraints

Supported on the selected topology:

- Node.js runtime for `pg` and `AbortController` (90s attempt timeout);
- long-lived outbound HTTPS to OpenRouter;
- bundled CA file read from the deployment checkout;
- concurrent OpenRouter calls (eight, then six);
- PostgreSQL via the transaction pooler.

There is no writable-disk assumption. There is no process-local state required for correctness. Duplicate execute uses the durable `PENDING → RUNNING` claim.

## Free OpenRouter models

Current IDs are `:free` endpoints. Availability, latency, and rate limits are external and volatile. Retries lengthen the HTTP request. Provider failure is an expected Tribunal outcome (`FAILED` Run, no invented verdict). There is no automatic cross-model fallback. Do not change model selection as a deploy workaround.

## Deploy procedure (not executed in preflight)

1. Confirm Vercel **Pro** (or choose Render Web Service if Pro is unavailable).
2. Set `DATABASE_URL` and `OPENROUTER_API_KEY` on the host. Confirm no `NEXT_PUBLIC_*` copies exist.
3. From a trusted checkout, point `DATABASE_URL` at production and run `npm run migrate`. Record applied filenames. Do not apply migrations twice as a workaround.
4. Deploy the existing Next.js app (`next build`). Do not change engine, models, retry policy, or UI.
5. Confirm `POST /api/cases/[id]/execute` still exports `runtime = "nodejs"` and `maxDuration = 800`.
6. Smoke-check `/` and an invalid Case ID only. Do not Start Tribunal until the single planned live E2E.

## Final live E2E (once)

Perform this sequence **once** after deploy. It may consume 14–28 free-model requests. Do not repeat it for curiosity.

1. Verify production `schema_migrations` contains every file under `supabase/migrations/`.
2. Open deployed `/`.
3. Upload `fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md`.
4. Confirm a new Case ID and two `PENDING` Runs (upload response and/or Case workspace).
5. Click **Start Tribunal** exactly once. Do not refresh during the wait.
6. Allow both `SAME_MODEL` and `MIXED_MODELS` to finish the synchronous POST.
7. Confirm the UI then loads `GET /api/cases/{id}/results` (not the execute JSON) as the display source.
8. Reload `/cases/{id}` and confirm no second execute request.
9. Confirm the two Run panels are independent (one may fail while the other remains fully visible).
10. Confirm four Advocates in order (Jon Snow, Tyrion Lannister, Daenerys Targaryen, Grey Worm) with summary / three arguments / conclusion, or a clear unavailable state.
11. Confirm three Judges (Aaron Barak, Menachem Elon, Meir Shamgar) with verdict / summary / three reasons, or a clear unavailable state.
12. For each `SUCCEEDED` Run, confirm the persisted `finalVerdict` (`JUSTIFIED` / `NOT_JUSTIFIED`) is shown and was not recomputed in the browser.
13. If a provider fails, confirm that Run is explicitly `FAILED` with no invented verdict.
14. Confirm Model Call attempt counts (7 per successful Run; up to 14 with retries; independent per Run).
15. Confirm token/cost accounting and that incomplete totals are labeled incomplete.
16. Attempt execute again for the same Case; confirm `NOT_PENDING` / no additional model requests.
17. Confirm browser/network payloads contain no API key, prompts, profile text, or charge-sheet body.
18. Reload again and confirm the same persisted rows in production PostgreSQL.

If the host returns a duration timeout (504) before the POST completes, treat that as a measured hosting failure: inspect persisted Run state, do not click Start again, and do not introduce queues until that measurement is recorded.
