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

2026-10-30 · T-07 · Added the D1 migration (SRS §7.3), AES-256-GCM `seal`/`unseal`, HMAC `signToken`/`readToken`, the three `__Host-` cookie helpers, the streamer session check against `users.session_epoch`, and the JSON plus `Origin` write guard (`requireJsonSameOrigin`). SRS code blocks ported unchanged. · `npm run typecheck` passed; the migration applied to an in-memory SQLite. A focused acceptance test file (`app/test/t07-auth.test.ts`) was added; the fuller suite stays with Dhairya's T-50 (#56). · Next: T-09 ChannelRoom, T-08 OAuth.

2026-10-30 · T-38 · Added the mounted Hono route layout, typed API-error middleware, sensitive-field-safe structured logging, cryptographic random ID helpers, and optional P1/P2 Env bindings. · Wrote and ran the foundation test red before implementation; then `npm test`, `npm run typecheck`, and `npm run build` passed. · Next: T-07 D1, token sealing, sessions and Origin checks.

2026-10-30 · T-37 · Added the shared pure core types, WebSocket protocol, view and report contracts; the Worker and browser each type-import the shared contract. Added compile-checked type assertions for the exact redacted overlay-line shape and report-card text/term exclusion. · Wrote the contract test first; `npm run typecheck` initially failed because the exports were absent. After implementation, `npm test`, `npm run typecheck`, and `npm run build` passed. · Next: T-03 waves and safety scan, or T-09 Worker room skeleton.

2026-10-30 · T-02 · Added the pure seeded `Rng`/FNV-1a helpers and the SRS §5.3 tokenizer, matcher, wildcard validation, and blocked-term lookup. Added the normative matcher table plus a workerd compatibility test. Matching follows unverified assumption A-01 until day-0 measurement. · Wrote and ran `npm test -w packages/core -- matcher` red before implementation; then `npm test`, `npm run typecheck`, and `npm run build` passed. · Next: T-03 waves and safety scan.

2026-10-30 · T-01 correction · Split the app TypeScript project into browser and Worker configurations; the Worker now uses the generated `Env` and `ExecutionContext` globals from `worker-configuration.d.ts`; ignored TypeScript build-info files. · `npm run typecheck`, `npm test`, and `npm run build` passed. · Next: T-02 matcher and seeded PRNG.

2026-10-30 · T-01 · Added the npm-workspace monorepo, strict TypeScript project references, Node and workerd Vitest scaffolds, Vite/Cloudflare Worker configuration, a minimal Hono health endpoint, React entry page, and generated Worker types. Selected React 19.3.1. · `npm test`, `npm run typecheck`, and `npm run build` passed; local `GET /api/health` returned `200 {"ok":true}`. · Next: T-02 matcher and seeded PRNG.
