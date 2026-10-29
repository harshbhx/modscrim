# Tech stack

A digest of SRS §2.4, §3.1, §9.1 and §12. Do not add a library that is not listed here (AGENTS.md rule 1).

## 1. Languages, frameworks, tooling

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5, `strict`, `noUncheckedIndexedAccess` | End to end; no `any` |
| Repo | npm workspaces: `packages/*`, `app` | Shared `tsconfig.base.json`; `tsc -b` |
| Core package | `@mfd/core` in `packages/core` | Pure; runs in Node, browsers and `workerd` (NFR-21) |
| Worker router | Hono | `app/worker/index.ts` |
| Validation | zod | Every boundary: HTTP, WebSocket, Twitch responses |
| Runtime | Cloudflare Workers, compatibility date `2026-10-28` (or the build day) | Durable Objects with the SQLite backend |
| Frontend | React 18 or 19 (decide at T-01, record in `docs/LOG.md`) with React Router | Routes in `interfaces.md` §1 |
| Styling | Plain CSS with custom properties (`styles/tokens.css`, `base.css`, `overlay.css`) | No CSS framework |
| State | One `useRoom()` hook with a reducer over `ServerMsg` | No global state library |
| Build | Vite with `@vitejs/plugin-react` and `@cloudflare/vite-plugin` | One dev server runs SPA, Worker, DO and local D1 |
| Tests | Vitest; `@cloudflare/vitest-plugin` (Vitest 4.1+) for Worker tests in `workerd` | `runInDurableObject`, `runDurableObjectAlarm` |
| End to end | Playwright on a demo room | P1 |
| CLI | Wrangler; Twitch CLI (`twitch`) for tokens and mock events | |
| Scripts | `scripts/day0.ts`, `scripts/load.ts`, `scripts/subscribe-revoke.ts` | Run with Node 22 |

## 2. Cloudflare features and bindings (SRS §3.1)

| Feature | Binding / config | Job | Pri |
|---|---|---|---|
| Workers + static assets | `assets` with SPA fallback and `run_worker_first` | Serves SPA free; Worker handles `/api/*`, `/auth/*`, `/ws/*`, `/eventsub` | P0 |
| Durable Objects (SQLite) | `ROOM` → class `ChannelRoom`, migration tag `v1` `new_sqlite_classes` | One room per channel or demo | P0 |
| WebSocket Hibernation | `ctx.acceptWebSocket` | Sockets stay open while the room sleeps | P0 |
| DO alarms | `ctx.storage.setAlarm` | Drill clock, Kai, grading pace, purges, demo GC | P0 |
| DO RPC | `stub.method()` | Typed calls from the Worker into the room | P0 |
| D1 | `DB` → database `mfd`, `migrations_dir: "migrations"` | Global records | P0 |
| Cron Triggers | `"crons": ["7 * * * *"]` | Hourly: validate tokens, purge chat, subscription health | P0 |
| Secrets | `secrets.required` | Deploy fails if one is missing | P0 |
| Web Crypto | `crypto.subtle`, `getRandomValues` | HMAC-SHA256, AES-256-GCM, codes and keys | P0 |
| Rate Limiting | `JOIN_LIMITER` (10/60 s), `DEMO_LIMITER` (5/60 s), `AUTH_LIMITER` (20/60 s) | Outer guards; approximate and per location | P0 |
| Workers Logs | `observability.enabled`, `upload_source_maps` | Structured logs, CPU time | P0 |
| Queues | `REPORT_QUEUE` producer and consumer on `mfd-reports` (batch 10, timeout 5 s, 3 retries) | Report export pipeline | P1 |
| R2 | `REPORTS` → bucket `mfd-reports` | Report exports and share links | P1 |
| Workers AI | `AI` | Coach's note | P2 |
| Custom domain | — | Nicer URL than `workers.dev` | P2 |

Delete the P1 and P2 blocks from `wrangler.jsonc` until those features are built. Declare `REPORT_QUEUE`, `REPORTS` and `AI` optional in `Env` (a small `env.d.ts` next to the generated types) and guard each use with `if (env.X)`.

**Considered and rejected (do not introduce):** Workflows, Workers KV, the Agents SDK, Pages, the EventSub WebSocket transport, Analytics Engine, Containers, Vectorize, Browser Run. Reasons in SRS §3.1.

The full `app/wrangler.jsonc` and `app/vite.config.ts` are in SRS §12.2 and §12.3.

## 3. Variables and secrets (SRS §12.4)

| Name | Kind | Value | Purpose |
|---|---|---|---|
| `PUBLIC_BASE_URL` | secret (not sensitive) | `https://mod-fire-drill.<subdomain>.workers.dev`; `http://localhost:5173` locally | Redirect URI, webhook callback, links, `Origin` check |
| `TWITCH_CLIENT_ID` | var | From the Twitch console | OAuth and Helix |
| `TWITCH_CLIENT_SECRET` | secret | From the Twitch console | Token exchange |
| `EVENTSUB_SECRET` | secret | `openssl rand -hex 24` (10 to 100 ASCII characters) | Webhook signatures |
| `SESSION_HMAC_KEY` | secret | `openssl rand -hex 32` | Cookies, tickets, participant tokens |
| `TOKEN_ENC_KEY` | secret | `openssl rand -base64 32` | AES-256-GCM sealing |
| `CHAT_LOG_RETENTION_DAYS` | var | `7` | FR-43 |
| `CLEAN_SET_MAX_LINES` | var | `20000` | Clean-set cap |
| `GRADING_ENGINE` | var | `twitch` or `local` | Force local grading |
| `GRADING_BATCH_SIZE` | var | `100` until day 0 says otherwise | Lines per Check AutoMod Status call |
| `GRADING_QUOTA_UNIT` | var | `request` or `line` (day 0) | How the pace counts quota |
| `DEMO_ENABLED` | var | `true` | FR-38 |
| `ANNOUNCE_ENABLED` | var | `false` | FR-41 |
| `COACH_AI_ENABLED` | var | `false` | FR-42 |

**Why `PUBLIC_BASE_URL` is a secret:** with `secrets.required` set, only the listed keys load from `app/.dev.vars`, so it must be listed there to be overridable locally. `app/.dev.vars` is git-ignored.

**Local limitation:** Twitch only calls HTTPS callbacks on port 443, so local dev skips chat subscriptions. Test the webhook with the Twitch CLI (`twitch.md` §7).

## 4. Scripts (SRS §12.5)

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server with the Cloudflare plugin on `http://localhost:5173` |
| `npm test` | Core tests in Node plus Worker tests in the `workerd` pool |
| `npm run typecheck` | `tsc -b` across workspaces |
| `npm run types` | `wrangler types` to regenerate `Env` |
| `npm run db:migrate:local` / `db:migrate:remote` | `wrangler d1 migrations apply mfd --local` / `--remote` |
| `npm run build` | `vite build` |
| `npm run deploy` | `vite build && wrangler deploy` |
| `npm run day0` | The day-0 kill test |
| `npm run load` | Fan-out latency test against a demo room |
| `npm run subscribe-revoke` | One-off: create the app-level revoke subscription (P1) |

## 5. First deployment (SRS §12.6)

1. `npx wrangler login`
2. `npx wrangler d1 create mfd`; copy the ID into `wrangler.jsonc`
3. `npm run db:migrate:remote`
4. Find the account's `workers.dev` subdomain; `PUBLIC_BASE_URL = https://mod-fire-drill.<subdomain>.workers.dev`
5. `npx wrangler secret put` for `PUBLIC_BASE_URL`, `TWITCH_CLIENT_SECRET`, `EVENTSUB_SECRET`, `SESSION_HMAC_KEY`, `TOKEN_ENC_KEY`; set `TWITCH_CLIENT_ID` in `vars`
6. `npm run deploy`
7. Add `<URL>/auth/callback` to the Twitch app's redirect URLs
8. Open `<URL>/demo` and run a demo drill
9. Sign in with the test channel; the console shows "Connected" and the chat subscription becomes `enabled`
10. P1: `npx wrangler r2 bucket create mfd-reports`, `npx wrangler queues create mfd-reports`, restore the P1 block, deploy, `npm run subscribe-revoke`

OBS: Browser Source with the overlay URL, 1920 × 1080, "Shutdown source when not visible" off, no custom CSS. Rotate the key if it was ever shown on screen.

## 6. Plan limits that shape the design (SRS §2.4)

| Limit | Value (Free plan) | Design response |
|---|---|---|
| Worker requests | 100,000 a day; 10 ms CPU per HTTP request; 50 subrequests per invocation | Heavy work in the DO, not the stateless Worker; assets are free |
| Durable Objects | SQLite only; 100,000 requests and 13,000 GB-s a day; 5 M rows read, 100,000 rows written a day; 5 GB | Pre-tokenised chat, no per-token rows, hibernate between drills |
| Alarms | One per object; can fire more than once | `schedule` table; idempotent jobs |
| WebSocket attachment | 16,384 bytes; 10 tags per socket | Attachments hold only role, pid, name |
| D1 | 5 M rows read, 100,000 written a day; 500 MB; 50 queries per invocation | Only small global records |
| EventSub webhooks | HTTPS on 443; reply within a few seconds | Verify, hand to the room, reply 204 |
| Token validation | Twitch requires hourly validation for apps with sessions | Hourly cron |
| Workers AI | 10,000 Neurons a day | P2 only, template fallback |

The $5 Workers Paid plan is optional headroom for the live recording (C-05).
