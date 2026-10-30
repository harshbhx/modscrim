# Build log

The running record the PRD (§12.4) and SRS (§13.3, §15.1) ask for: decisions, day-0 results, Codex sessions and a short note per working session. Newest entries go at the top of each section.

## Decisions

| Date | Decision | Why | Source |
|---|---|---|---|
| 2026-10-30 | React 19.3.1 | It is the current supported React release at T-01 and meets SRS §9.1. | T-01 |
| | Day-0 outcome (PRD §12.1 decision table) | | Day-0 results below |
| | React version (18 or 19) | | SRS §9.1 leaves it open |
| | `GRADING_QUOTA_UNIT` and `GRADING_BATCH_SIZE` | | Day-0 step 5 |

## Day-0 kill test (SRS §13.3)

| Step | Measure | Result | Notes |
|---|---|---|---|
| 1-4 | Fresh-wave blocked before and after (local), points of improvement | | Gate: at least +20 points |
| 4 | Real-chat matches of proposed terms | | Must be 0 |
| 5 | Quota unit: request or line | | Sets `GRADING_QUOTA_UNIT` |
| 5 | Max lines per Check AutoMod Status request | | Sets `GRADING_BATCH_SIZE` |
| 5 | 429 headers and body; response shape; time per request | | |
| 5 | Twitch vs local agreement on 20 lines | | Gate: at least 90% |
| 6 | Two-word term `nitrodrop invalid` vs `nitrodrop.invalid`, `nitrodrop[.]invalid`, `nitrodrop dot invalid`, `invalid nitrodrop` | | Confirms or breaks A-01 |
| 7 | Alarm emit jitter p95 at 1.5 s | | Gate: under 250 ms |
| 8 | Rule finder CPU time, 20,000-line log | | NFR-04 |
| 9 | Webhook: chat typed to console count | | Target: within 5 s |

**Decision:** _(fill in from the PRD §12.1 table)_

## Codex sessions

Required for the Devpost submission. Get each ID with `/status` in Codex.

| Date | Area (core, worker, web) | Session ID | Tickets |
|---|---|---|---|
| 2026-10-30 | core, worker (Harsh's account) | `01a1892d-f9b6-7203-bfdb-f73490bfd6c0` | T-01, T-02, T-37, T-38 |
| | | | |

## Session notes

Template: date and time · tickets touched · what changed · test evidence (command and result) · next step.

2026-10-30 · T-14 · Added Kai (sim) (`app/worker/room/sim.ts`): one room participant `sim-kai` named "Kai (sim)" with `is_sim = 1`, added to a draft when `simMod` is on (and taken out when an edit turns it off). `line.emit` schedules `sim.act` at `shownAt + delayMs` from `simDecision`, keyed by the line's place in the wave (`A-<idx>`) so the same seed gives the same Kai actions in every drill; `sim.act` goes through `applyAction`, so Kai never acts on a line already taken or slipped and loses without any broadcast; `actedAt` is the alarm time (SRS §5.9). Kai is scored as its own `isSim` row and listed in `participants` only while it is in the drill on screen. · 7 verification tests in the workerd pool (participant and labels; simMod on, off and toggled; two runs with the same seed give identical Kai actions equal to `simDecision`; Kai loses cleanly after a human; never acts on a slipped line; one Kai across drills; a repeated `sim.act` is a no-op) passed three runs together with the T-12 and T-13 files; handed to T-52 (#58), not committed. `npm test` (core 3 files, 19 tests; app 6 files, 46 tests), `npm run typecheck` and `npm run build` pass. Not yet run on a deployed Worker. · Next: T-18 demo rooms, T-17 reports.

2026-10-30 · T-13 · Added mod join: `ChannelRoom.joinAsMod` (`app/worker/room/mods.ts`) checks the code of the current draft or running drill in constant time (`crypto.subtle.timingSafeEqual`) inside one `transactionSync`, counts failed attempts per IP per minute in `join_attempts`, and refuses every attempt with 429 after 5 failures in the minute (open-questions G-3); names are trimmed, 1 to 24 characters, made unique case-insensitively with a number suffix. A new draft adds every mod with an open socket, so only new mods need the code. Routes `GET /api/public/channel/:login` (`drillOpen` from a new `isDrillOpen` room call), `POST /api/mod/:login/join` (participant token `{ room, pid, exp }` for 12 hours, ticket, socket URL) and `POST /api/mod/ticket` (reconnect); `JOIN_LIMITER` is the outer guard on all three. A mod socket coming online now broadcasts `participants`. · 16 verification tests in the workerd pool (wrong code 403; the 6th failure 429 even with the right code, other IPs unaffected; earlier-minute counters ignored; dead codes after cancel or end; body validation; name suffixes; carry-over into the next draft and acting there; reconnect tickets and rejected tokens; single-use tickets; public channel; participants broadcast) passed three runs, together with the T-12 file; handed to T-52 (#58), not committed. `npm test` (core 3 files, 19 tests; app 6 files, 46 tests), `npm run typecheck` and `npm run build` pass. Not yet run on a deployed Worker. · Next: T-14 Kai (sim).

2026-10-30 · T-12 · Added the drill engine in `app/worker/room/drill.ts` and wired it into `ChannelRoom`: `createDrill` (one draft or running drill per room; a second create returns the same draft), `updateDraft` (rebuilds wave A, keeps the join code, keeps the seed when omitted), `cancelDraft`, `startDrill`, `stopDrill` (shown open attacks slip, unshown lines are dropped), `getDrill` (`DrillView`) and the per-role `drill.state` snapshot. Jobs `line.emit` (line `idx` due at `startedAt + idx × intervalMs`), `line.slip` (attacks only, at `shownAt + slipWindowMs`) and `drill.end`; each state change and its follow-up jobs commit in one `transactionSync` (new synchronous `Scheduler.enqueue`), and every job is a no-op when repeated. `applyAction` is the SRS §8.5 code; `mod.action` from mod sockets only; `drill.line`, `drill.action`, `drill.slipped`, `drill.score`, `drill.ended` are built per role, with `RedactedLine` and no reveal for overlays. Routes `POST /api/drills`, `PATCH /api/drills/:id`, `POST /api/drills/:id/cancel|start|stop`, `GET /api/drills/:id`; invalid config is a 400 naming the field. `ClientMsgZ` now comes from `@mfd/core` (the duplicate `room/messages.ts` is gone). · 29 verification tests in the workerd pool (`room.drill.test.ts`: emit order and the drift-free clock, first action wins over sockets and in the same millisecond, slips, banter never slips, stop, one draft at a time, editing keeps the code, non-members and console or overlay sockets rejected, per-role snapshots and overlay redaction, a repeated alarm and a real object restart mid-drill emit nothing twice, the HTTP routes and the log fields) passed three runs in a row; they are handed to T-52 (#58) and not committed. `npm test` (core 3 files, 19 tests; app 6 files, 46 tests), `npm run typecheck` and `npm run build` pass. Not yet run on a deployed Worker. · Next: T-13 mod join, T-14 Kai (sim).

2026-10-30 · T-56 to T-77 · Added the brand kit in `brand/` (logos, fonts with OFL licences, social and stream images, `DESIGN.md`) and the static website in `site/`: 13 pages, shared CSS and tokens, self-hosted fonts in place of Google Fonts, icons and manifest, absolute canonical and OG URLs, and `_headers` adapted from SRS §9.6. Domain, GitHub owner, team name, contact email and governing law are filled; no postal address is published. Issues #76 to #100, nested under T-56. · A link check over `site/` found every local `href`, `src` and `url()`; `wrangler pages dev site` served all 13 pages and their extensionless routes with the headers; headless Chrome loaded every page with no console errors, CSP violations or third-party requests, and the home drill, console steps and mod view ran. `npm run build` and `npm run typecheck` pass. · Next: push and PR, then T-78 (Pages project) and T-79 (custom domain) after approval, then T-80.

2026-10-30 · T-09 · Added the `ChannelRoom` Durable Object: room schema (SRS §7.2, only for bootstrapped rooms), `bootstrap`, the single-alarm scheduler (drill jobs first, self-reschedule safe, 5 attempts with backoff), a hibernating socket hub with role tags and per-role broadcast, single-use 60 s tickets with stored nonces, constant-time overlay key check, `rotateOverlayKey`, `destroy`. Worker side: `GET /ws/:kind/:id` (404 for unknown channels without waking a room), `POST /api/ws-ticket`, `POST /api/overlay/rotate`, session middleware, and the JSON plus Origin guard on all `/api` writes. · `npm run typecheck` and `npm test` pass locally (5 files, 38 tests) under the workerd pool; `app/test/room.test.ts` is a focused acceptance file, the fuller suite is T-51 (#57). Not yet run on a deployed Worker. · Next: T-10 (Dhairya), T-12 drill engine.

2026-10-30 · T-07 · Added the D1 migration (SRS §7.3), AES-256-GCM `seal`/`unseal`, HMAC `signToken`/`readToken`, the three `__Host-` cookie helpers, the streamer session check against `users.session_epoch`, and the JSON plus `Origin` write guard (`requireJsonSameOrigin`). SRS code blocks ported unchanged. · `npm run typecheck` passed; the migration applied to an in-memory SQLite. A focused acceptance test file (`app/test/t07-auth.test.ts`) was added; the fuller suite stays with Dhairya's T-50 (#56). · Next: T-09 ChannelRoom, T-08 OAuth.

2026-10-30 · T-38 · Added the mounted Hono route layout, typed API-error middleware, sensitive-field-safe structured logging, cryptographic random ID helpers, and optional P1/P2 Env bindings. · Wrote and ran the foundation test red before implementation; then `npm test`, `npm run typecheck`, and `npm run build` passed. · Next: T-07 D1, token sealing, sessions and Origin checks.

2026-10-30 · T-37 · Added the shared pure core types, WebSocket protocol, view and report contracts; the Worker and browser each type-import the shared contract. Added compile-checked type assertions for the exact redacted overlay-line shape and report-card text/term exclusion. · Wrote the contract test first; `npm run typecheck` initially failed because the exports were absent. After implementation, `npm test`, `npm run typecheck`, and `npm run build` passed. · Next: T-03 waves and safety scan, or T-09 Worker room skeleton.

2026-10-30 · T-02 · Added the pure seeded `Rng`/FNV-1a helpers and the SRS §5.3 tokenizer, matcher, wildcard validation, and blocked-term lookup. Added the normative matcher table plus a workerd compatibility test. Matching follows unverified assumption A-01 until day-0 measurement. · Wrote and ran `npm test -w packages/core -- matcher` red before implementation; then `npm test`, `npm run typecheck`, and `npm run build` passed. · Next: T-03 waves and safety scan.

2026-10-30 · T-01 correction · Split the app TypeScript project into browser and Worker configurations; the Worker now uses the generated `Env` and `ExecutionContext` globals from `worker-configuration.d.ts`; ignored TypeScript build-info files. · `npm run typecheck`, `npm test`, and `npm run build` passed. · Next: T-02 matcher and seeded PRNG.

2026-10-30 · T-01 · Added the npm-workspace monorepo, strict TypeScript project references, Node and workerd Vitest scaffolds, Vite/Cloudflare Worker configuration, a minimal Hono health endpoint, React entry page, and generated Worker types. Selected React 19.3.1. · `npm test`, `npm run typecheck`, and `npm run build` passed; local `GET /api/health` returned `200 {"ok":true}`. · Next: T-02 matcher and seeded PRNG.
