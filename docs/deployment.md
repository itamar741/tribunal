# Deployment

Durable decisions for hosting the current synchronous MVP. This document does not authorize deployment by itself. Do not store credentials here.

## Selected topology

**Next.js Web Service on Render Free + existing Supabase transaction-pooler PostgreSQL + OpenRouter.**

This is the actual production topology. GitHub `main` is connected with auto-deploy. Do not create another Render service. The accepted production dual-run E2E ran on this topology and succeeded.

Render Free constraints that matter for this MVP:

- The process is `npm run start` (`next start`). The execute route’s `runtime = "nodejs"` and `maxDuration = 800` exports are ignored on Render.
- Official Render documentation states web-service HTTP responses may take up to 100 minutes ([Render vs Vercel](https://render.com/docs/render-vs-vercel-comparison)). That is sufficient for the bounded synchronous execute ceiling (≤ ~520s).
- A Free web service spins down after 15 minutes without inbound traffic and may cold-start on the next request. Persistent Case/Run/`model_calls` data remains in Supabase, not on Render’s ephemeral filesystem.
- Pushes to `main` trigger a new Render deploy.

Do not add Render-specific application architecture (no queues, workers, SSE, or polling).

**Vercel Pro** remains a documented alternative if the host is later changed: official Fluid compute maximum is 800s ([Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration)), and the execute route already exports `maxDuration = 800`. Vercel Hobby (300s maximum) is not sufficient for the bounded worst-case execute duration.

Do not move to queues, workers, SSE, or polling unless a later measured host limit proves the synchronous request cannot finish.

## Required environment

Set these on the host. Never use a `NEXT_PUBLIC_*` prefix. None of these values belong in the browser bundle.

| Variable | Class | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | secret | Server-only PostgreSQL URI. Use the Supabase **transaction pooler** host (`*.pooler.supabase.com`, port 6543). Do not add `sslmode`, `sslrootcert`, `sslcert`, or `sslkey`. |
| `OPENROUTER_API_KEY` | secret | Server-only OpenRouter key for live model requests. |
| `DATABASE_SSL_CA` | optional non-secret path | Override path to the official Supabase CA. Defaults to `certs/prod-ca-2021.crt` for Supabase hosts. |

TLS remains `rejectUnauthorized: true` with the bundled official CA. Do not disable verification.

Node.js **20.9+** is required by Next.js 16. The `pg` driver requires the Node.js runtime (`runtime = "nodejs"` is already set). Edge/Bun-only runtimes are not acceptable.

Build and start (Render Web Service):

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
- The bundled CA is `certs/prod-ca-2021.crt` (version-controlled). `createSslConfig` reads it from `process.cwd()`. That works on `next start` as long as the repo files are present. No writable filesystem is required.
- The `pg` pool is a process-local singleton. Correctness is in PostgreSQL, not in process memory. Default pool size is appropriate for a single concurrent Case (up to eight concurrent model calls, then six). Use the transaction pooler.

Do not weaken TLS. Production migrations are applied explicitly from a trusted checkout, not from a request handler.

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

**Worst-case bound:** every agent in the critical path uses a full timeout or a 60s `Retry-After` plus a second full timeout → **~8 minutes**. Render’s documented HTTP allowance covers that. On a Vercel Pro alternative the existing `maxDuration = 800` would also cover it.

If the host kills the request first, persisted `RUNNING` / `FAILED` rows and any completed `model_calls` remain the source of truth. Reload `/cases/{id}` must only `GET` results.

## Process constraints

Supported on the selected topology:

- Node.js runtime for `pg` and `AbortController` (90s attempt timeout);
- long-lived outbound HTTPS to OpenRouter;
- bundled CA file read from the deployment checkout;
- concurrent OpenRouter calls (eight, then six);
- PostgreSQL via the transaction pooler.

There is no writable-disk assumption. There is no process-local state required for correctness. Duplicate execute uses the durable `PENDING → RUNNING` claim.

## OpenRouter models

SAME_MODEL and four MIXED seats remain `:free` endpoints. MIXED `DEFENSE_1`, `JUDGE_1`, and `JUDGE_3` are the paid IDs `openai/gpt-4.1-mini`, `openai/gpt-4.1`, and `meta-llama/llama-4-maverick`. Availability, latency, rate limits, and listed prices are external and volatile. Retries lengthen the HTTP request. Provider failure is an expected Tribunal outcome (`FAILED` Run, no invented verdict). Provider-reported cost is audited. There is no automatic cross-model fallback. Do not change model selection as a deploy workaround.

## Deploy procedure

The application is already deployed on Render Free with auto-deploy from `main`. Further production deploys happen by pushing `main`. Do not create another service.

1. Keep `DATABASE_URL` (transaction pooler) and `OPENROUTER_API_KEY` on the Render service. Confirm no `NEXT_PUBLIC_*` copies exist.
2. Apply new SQL only with `npm run migrate` from a trusted checkout against production. Do not migrate from a request handler.
3. Push `main`. Wait for the Render deploy to finish before starting a new Case.
4. Smoke-check `/` if needed. A new dual-run Case is a separate, once-only live E2E.

## Production E2E (completed)

The Tribunal MVP completed a successful deployed dual-run E2E on this topology: GitHub `main`, Render Free Web Service, Supabase PostgreSQL transaction pooler, and OpenRouter.

A fresh Case was created from `fixtures/charge-sheets/t-001-the-realm-v-jon-snow.md` and executed once through the deployed application.

| Run | Status | Final verdict |
| --- | --- | --- |
| `SAME_MODEL` | `SUCCEEDED` | `NOT_JUSTIFIED` |
| `MIXED_MODELS` | `SUCCEEDED` | `NOT_JUSTIFIED` |

`SAME_MODEL` used `minimax/minimax-m3:free` for all seven roles. All four Advocates and all three Judges completed. One Judge required a retry after an upstream 429. The majority persisted as `NOT_JUSTIFIED`.

`MIXED_MODELS` used the current paid/free assignment (`openai/gpt-4.1-mini`, `minimax/minimax-m2.7:free`, `poolside/laguna-s-2.1:free`, `minimax/minimax-m3:free`, `openai/gpt-4.1`, `nvidia/nemotron-3-super-120b-a12b:free`, `meta-llama/llama-4-maverick`). All four Advocates eventually succeeded (`PROSECUTION_1` retried after malformed JSON). All three Judges succeeded. The majority persisted as `NOT_JUSTIFIED`.

Persisted MIXED accounting: 8 attempts; 19,426 input / 9,088 output / 28,514 total tokens; provider-reported cost `$0.012415312`; duration 162,798 ms. Paid Model Call costs were GPT-4.1 Mini `$0.0007884`, GPT-4.1 `$0.010658`, and Llama 4 Maverick `$0.000968912`. Free endpoints reported `$0`.

Persisted Case totals: 16 attempts; known 39,600 input / 13,365 output / 52,965 total tokens; known cost `$0.012415312`; known duration 234,936 ms. Case-level accounting remained marked incomplete because at least one failed SAME_MODEL attempt returned no usage/cost. Unknown accounting is not converted to zero.

Reload of deployed `/cases/{id}` reconstructed both `SUCCEEDED` / `NOT_JUSTIFIED` Runs from persistence. No model execution and no additional Model Call rows.

The UI does not expose **Start Tribunal** once the Case is no longer `PENDING`. Server-side duplicate protection is verified in automated tests: atomic `PENDING → RUNNING` claim, no re-claim of `RUNNING` / `SUCCEEDED` / `FAILED`, concurrent callers execute each durable Run at most once, and rejected duplicates create zero new Model Call rows. A second live execute was not repeated for this evidence.

Do not repeat this live E2E for curiosity. If a later host returns a duration timeout (504) before POST completes, inspect persisted Run state, do not click Start again, and do not introduce queues until that measurement is recorded.
