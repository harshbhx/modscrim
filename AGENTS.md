# AGENTS.md: Mod Fire Drill

Instructions for every AI coding agent working in this repository: Codex, Claude Code, Cursor, Copilot or any other. Read this file at the start of every session, then open the docs your ticket needs.

## What this is

**Mod Fire Drill** (repository `modscrim`) runs fire drills for a Twitch channel's moderators. A sandboxed practice chat floods with generated scam, spam and bot lines written to slip past **this channel's own blocked terms**, mixed with harmless banter. Mods race to remove the attacks. Then **Twitch grades the filters** through Check AutoMod Status, a rule finder proposes up to six new blocked terms, the terms are **proven on a held-out wave** with **zero matches against the channel's real chat**, and the streamer pushes them to Twitch with one click and can undo with another.

- **Event:** Codex x TwitchCon hackathon on Devpost. Must be built with OpenAI Codex; record every Codex session ID (`/status`) in `docs/LOG.md`.
- **Deadlines (IST):** feature freeze Sun 1 Nov 2026 22:00 · target submit Mon 2 Nov 20:00 · hard deadline Tue 3 Nov 03:30.
- **Team:** Harsh owns all Cloudflare work (Worker, Durable Objects, D1, cron, Queues, R2, Workers AI, deploy) and the landing page. Dhairya owns the core engine, all Twitch integration, the web app, **all testing (automated and manual)**, CI and the launch. GitHub labels `owner: harsh` and `owner: dhairya`.
- **Stack:** one Cloudflare Worker (Hono router plus a React SPA served as static assets), one `ChannelRoom` Durable Object with SQLite per channel, one D1 database, Twitch OAuth, Helix and EventSub webhooks. TypeScript 5 strict end to end. No paid AI calls at runtime.
- **Status:** tracked live in `docs/for-agents/build-plan.md` and on the [project board](https://github.com/users/harshbhx/projects/3). Done so far: T-01, T-02, T-07, T-37, T-38.

## Sources of truth

| Question | Source | Wins when they disagree about |
|---|---|---|
| What to build, priority, exact copy, safety | `docs/for-agents/PRD.md` | Scope and safety |
| How to build: architecture, data, interfaces, algorithms, tests | `docs/for-agents/SRS.md` | Implementation |

- Code blocks in SRS §5 are **normative**: port them as written. Where SRS code and prose disagree, keep the code and its tests.
- **Never add a feature, endpoint, dependency or table that the PRD or SRS does not list.** If something is unclear, write a `TODO(question)` and stop instead of guessing.
- The SRS was written for a repo where the specs live at `docs/PRD.md` and `docs/SRS.md`. In this repo they live in `docs/for-agents/`. The repo root is the SRS's `mod-fire-drill/`.
- PDF copies in `docs/for-humans/` are for people. Never edit them; the Markdown is the source.

## Context docs (`docs/for-agents/`)

Start with **`INDEX.md`**: a map of every doc, a section index of the PRD and SRS, and the feature → requirement → ticket → test traceability table.

| File | Read it when you need |
|---|---|
| `INDEX.md` | Where anything is; ID traceability |
| `architecture.md` | System shape, the `ChannelRoom` Durable Object, scheduler, flows, where data lives |
| `tech-stack.md` | Libraries, Cloudflare bindings, config vars and secrets, scripts, plan limits |
| `interfaces.md` | REST routes, WebSocket protocol and role routing, room RPC surface, error codes |
| `twitch.md` | Scopes, Helix endpoints, EventSub webhooks, rate limits, local testing with the Twitch CLI |
| `safety-security-privacy.md` | S-01 to S-12, overlay redaction, threats and controls, retention and deletion |
| `build-plan.md` | Milestones, tickets T-01 to T-55 with owner, status and issue, cut order, day-0 test, submission checklist |
| `testing.md` | Test layers, required test files, how to run one test, live checklist |
| `glossary.md` | Domain terms and ID prefixes |
| `open-questions.md` | Every `[verify]` assumption, open questions, known gaps and contradictions in the specs |

## Rules

1. **Scope.** Build only what your ticket's IDs (`T-xx`, `FR-xx`, `F-xx`) say. Read those IDs in both the PRD and the SRS before writing code.
   - **Save tokens: never open `PRD.md` or `SRS.md` whole** (the SRS alone is about 40,000 tokens). Find the sections the issue cites with `rg -n "^#+ 5\.3" docs/for-agents/SRS.md` (or the FR ID) and read only those line ranges. The issue body plus its cited sections are enough for any ticket. Use the short digests in `docs/for-agents/` for orientation.
2. **Safety, never break:**
   - No code sends text to Twitch chat except FR-41's fixed announcement constant, behind `ANNOUNCE_ENABLED`.
   - Every generated link ends in `.invalid`. Slurs are only the placeholders `slurx` and `slury`, rendered as `▇` blocks. No real slur list exists anywhere.
   - Banter comes only from the curated 40-line `BANTER` pool, never from real chat.
   - Overlay sockets receive only redacted payloads (SRS §8.3). No readable attack text, no reveal, no terms.
   - Tokens never leave the Worker and never appear in logs or responses. Logs never contain tokens, chat text or attack text.
   - Never call Twitch's AutoMod settings **update** endpoint. AutoMod is read-only.
   - No blocked term reaches Twitch without the streamer's explicit approval, and every push can be undone.
3. **`packages/core` is pure:** no I/O, no `Date.now()`, no `Math.random()`. Use the seeded `Rng` from `prng.ts`. It must run unchanged in Node, browsers and `workerd`.
4. **Tests first.** Write or update the tests SRS §13.2 names for your FRs, run them failing, then implement. `npm test` and `npm run typecheck` must pass before you finish.
   - **Exception:** Harsh's Cloudflare tickets list *acceptance checks* instead of tests. Their automated tests live in a paired test ticket owned by Dhairya (T-50 to T-55, named in each issue). Build so those checks pass; do not skip a check because its tests come later.
5. **TypeScript strict** with `noUncheckedIndexedAccess`. No `any`. Validate every boundary with zod: HTTP bodies, WebSocket messages, Twitch responses.
6. **Durable Object rules:**
   - Atomic state changes run synchronously inside `ctx.storage.transactionSync()` with no `await` between read and write.
   - Consume SQL cursors with `.toArray()` or `.one()` before any `await`.
   - One alarm per object. Multiplex jobs through the `schedule` table; never set a second alarm. Every job is idempotent because alarms can fire more than once.
   - Use the Hibernation API: `ctx.acceptWebSocket()` and `webSocketMessage()`. Never `ws.accept()` or `addEventListener` inside the room.
   - A room that was never bootstrapped answers `ignored` or 404 and stores nothing.
   - Take timestamps at event boundaries only. In Workers, `Date.now()` advances only between I/O events.
7. **Twitch:** verify webhook signatures on the raw body before `JSON.parse`; read `Ratelimit-*` headers; label every grade with its engine (`twitch` or `local`). Anything marked `[verify]` lives behind a named constant or var, and its observed behaviour is logged. See `open-questions.md`.
8. **Demo rooms** (`demo:<uuid>`) never call Twitch, D1, R2 or the Queue.
9. **P1 and P2 bindings** (`REPORTS`, `REPORT_QUEUE`, `AI`) are optional in `Env`. Guard every use with `if (env.X)`, so the P0 product deploys without them.
10. **Secrets** come only from `wrangler secret put` and `app/.dev.vars`. Never commit `.dev.vars` or any secret.
11. **Copy** shown to users matches the PRD §9.6 copy deck exactly.

## Commands

These scripts are defined in SRS §12.5 and created by ticket T-01. Until T-01 lands, none of them exist.

```bash
npm install                     # npm workspaces: packages/*, app
npm run dev                     # Vite + Cloudflare plugin: SPA, Worker, Durable Object, local D1 on http://localhost:5173
npm test                        # core tests (Node) + Worker tests (Vitest pool in workerd)
npm run typecheck               # tsc -b across workspaces
npm run types                   # wrangler types: regenerate Env
npm run db:migrate:local        # wrangler d1 migrations apply mfd --local   (:remote for production)
npm run build                   # vite build
npm run deploy                  # vite build && wrangler deploy
npm run day0                    # day-0 kill test (SRS §13.3)
npm run load                    # fan-out latency test against a demo room

# One test file or one test
npm test -w packages/core -- matcher               # core file by name
npm test -w app -- room.drill                      # Worker file by name
npx vitest run packages/core/test/matcher.test.ts -t "spaced"
```

## Repository map (target, SRS §12.1)

```
AGENTS.md  CLAUDE.md  README.md  LICENSE  package.json  tsconfig.base.json
docs/            for-agents/ (PRD.md, SRS.md, context docs) · for-humans/ (PDFs) · LOG.md
packages/core/   @mfd/core: pure engine (prng, matcher, tricks, templates, waves, schema,
                 ruleFinder, cleanIndex, proof, scoring, sim, pace, coach, fixtures, views, protocol)
app/worker/      Worker: index.ts, routes/, auth/, twitch/, room/ (ChannelRoom split into modules), jobs/, lib/
app/src/         React SPA: routes/, components/, lib/ (api, ws, useRoom, keyboard), styles/
app/migrations/  D1 schema (0001_init.sql)
app/test/        Worker integration tests
scripts/         day0.ts, load.ts, subscribe-revoke.ts
```

## Working from GitHub issues

Every ticket is a GitHub issue in `harshbhx/modscrim` (numbers are in `docs/for-agents/build-plan.md`). When asked to do or fix an issue:

1. Read it with `gh issue view <number>`. Its Scope, Requirements, Tests and Done-when sections are the brief; its References point to the spec sections to read.
2. Check that the issues it depends on are closed. If not, stop and say so.
3. Work on a branch named `t-xx-short-name`, tests first.
4. The PR is titled `T-xx: …` and its description says `Closes #<number>`.

## Commits, PRs and the log

- Commit messages name the requirement: `FR-17: emit lines on the drift-free clock` or `T-03: wave builder and safety scan`.
- Keep diffs small: one ticket per branch and PR.
- After each ticket, append what changed and the test evidence to `docs/LOG.md`, and tick the ticket in `docs/for-agents/build-plan.md`.
- Record each Codex session ID (`/status`) in `docs/LOG.md`; the submission requires them.
- Commits are authored by the human builders. No AI co-author trailers.

## Definition of done

- The acceptance criteria of the ticket's FRs pass.
- The tests SRS §13.2 names for those FRs exist and pass; `npm test` and `npm run typecheck` are green.
- It works on the deployed Worker, not only locally.
- Copy matches PRD §9.6; keyboard and screen-reader basics are checked for UI work.
- No safety rule is weakened and no secret is in the repository.
