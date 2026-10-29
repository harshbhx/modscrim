# Build plan and tracker

A digest of PRD §8.2, §8.3, §12, §13, §14.2 and SRS §13.3, §15. **This file is a tracker:** tick a ticket when its definition of done is met, and add the PR link.

## 1. Milestones (PRD §12.1, all IST)

| ID | Milestone | Due | Exit criteria | Status |
|---|---|---|---|---|
| M0 | Day-0 kill test | Thu 29 Oct 23:59 | Decision recorded in `docs/LOG.md` | ☐ |
| M1 | Walking skeleton deployed | Fri 30 Oct 14:00 | Worker on `workers.dev`, DO with a hibernating WebSocket echo, D1 migrated, SPA served | ☐ |
| M2 | Loop on fixtures | Sat 31 Oct 13:00 | Full loop in a demo room: drill, score, local grade, rules, fresh wave, simulated push | ☐ |
| M3 | Loop on Twitch | Sat 31 Oct 23:00 | Real sign-in, chat webhook, Twitch grading, real push and undo on the test channel | ☐ |
| M4 | Feature freeze | Sun 1 Nov 22:00 | Only fixes and copy after this | ☐ |
| M5 | Video recorded | Mon 2 Nov 13:00 | Uncut live loop captured with real numbers | ☐ |
| M6 | Submitted | Mon 2 Nov 20:00 | Checklist in §7 done | ☐ |

Early warning signs (PRD §14.1): day-0 agreement under 90% or improvement under +10 points; more than 2 hours on any one ticket; the live loop not working on Twitch by Sat 23:00.

## 2. Owners (PRD §2.2)

- **Builder A, platform:** Worker, Durable Object, D1, OAuth, EventSub, Helix, grading queue, push and undo, deploy.
- **Builder B, engine and experience:** `packages/core`, the web app (console, mod console, overlay, demo), copy, the video.
- **Codex** writes most code from these tickets; humans review, test and decide.

## 3. Scope

**P0 (must ship):** F-01 to F-06, F-08 to F-14, F-16 to F-19. Together: read filters, drill, score, grade, find rules, prove on a fresh wave, push and undo, plus the public demo.

**Cut order if the schedule slips (cut from the top):** F-26, F-24, F-25, F-23, F-27, F-28, F-20, F-22, F-21, F-15, F-07. Never cut a P0; if a P0 is at risk at the freeze, use the fallback ladder (§6).

## 4. Tickets (SRS §15.3)

Each ticket is sized for under 2 hours of Codex plus review. Open each Codex session with `AGENTS.md`, the ticket text and the cited SRS sections. Tests first.

| ☐ | ID | Ticket | FR / NFR | After | Owner | Issue · PR |
|---|---|---|---|---|---|---|
| ☑ | T-01 | Monorepo, TS config, Vitest in core, Vite + Cloudflare plugin app, hello-world deploy | — | — | A | [#3](https://github.com/harshbhx/modscrim/pull/3) |
| ☑ | T-02 | `prng.ts`, `matcher.ts` with the SRS §5.3 test table | FR-31 | T-01 | B | [#4](https://github.com/harshbhx/modscrim/issues/4) · [#39](https://github.com/harshbhx/modscrim/pull/39) |
| ☐ | T-03 | `tricks.ts`, `templates.ts`, `waves.ts`, `safety.test.ts` | FR-13 to FR-15 | T-02 | B | [#5](https://github.com/harshbhx/modscrim/issues/5) |
| ☐ | T-04 | `cleanIndex.ts` with the property test; `ruleFinder.ts`; `proof.ts` | FR-31, FR-33 | T-03 | B | [#6](https://github.com/harshbhx/modscrim/issues/6) |
| ☐ | T-05 | `scoring.ts`, `sim.ts`, `pace.ts`, `schema.ts` | FR-16, FR-25, FR-28, FR-39 | T-02 | B | [#7](https://github.com/harshbhx/modscrim/issues/7) |
| ☐ | T-06 | `scripts/day0.ts` | — | T-04 | B | [#8](https://github.com/harshbhx/modscrim/issues/8) |
| ☐ | T-07 | D1 migration; `crypto.ts`, `session.ts`, cookies, Origin check | FR-02, FR-05 | T-01 | A | [#9](https://github.com/harshbhx/modscrim/issues/9) |
| ☐ | T-08 | OAuth login and callback; Helix `users`; token refresh in the room | FR-01, FR-02 | T-07 | A | [#10](https://github.com/harshbhx/modscrim/issues/10) |
| ☐ | T-09 | `ChannelRoom` skeleton: schema, scheduler, hub, tickets, overlay key | FR-21, FR-37 | T-07 | A | [#11](https://github.com/harshbhx/modscrim/issues/11) |
| ☐ | T-10 | Webhook verify and route; subscription create and reconcile; chat ingest | FR-08 to FR-10 | T-08, T-09 | A | [#12](https://github.com/harshbhx/modscrim/issues/12) |
| ☐ | T-11 | Filters read and cache; broadcaster type | FR-06, FR-07 | T-08 | A | [#13](https://github.com/harshbhx/modscrim/issues/13) |
| ☐ | T-12 | Drill create, start, emit, act, slip, stop, end; snapshot | FR-16 to FR-21 | T-05, T-09 | A | [#14](https://github.com/harshbhx/modscrim/issues/14) |
| ☐ | T-13 | Mod join (code), participant tokens, rate limits | FR-22 | T-12 | A | [#15](https://github.com/harshbhx/modscrim/issues/15) |
| ☐ | T-14 | Kai (sim) jobs | FR-39 | T-12 | A | [#16](https://github.com/harshbhx/modscrim/issues/16) |
| ☐ | T-15 | Grading queue with pacing and local fallback | FR-28, FR-29 | T-11, T-12 | A | [#17](https://github.com/harshbhx/modscrim/issues/17) |
| ☐ | T-16 | Rules, proof, push and undo in the room; audit log | FR-31 to FR-35, FR-45 | T-04, T-15 | A | [#18](https://github.com/harshbhx/modscrim/issues/18) |
| ☐ | T-17 | Report build and console view | FR-27 | T-16 | A | [#19](https://github.com/harshbhx/modscrim/issues/19) |
| ☐ | T-18 | Demo rooms with fixtures and GC | FR-38 | T-12, T-14 | A | [#20](https://github.com/harshbhx/modscrim/issues/20) |
| ☐ | T-19 | Web: tokens, layout, landing, privacy page | — | T-01 | B | [#21](https://github.com/harshbhx/modscrim/issues/21) |
| ☐ | T-20 | Web: `useRoom` and the WebSocket client | FR-21 | T-09 | B | [#22](https://github.com/harshbhx/modscrim/issues/22) |
| ☐ | T-21 | Web: mod console with keyboard | FR-22, FR-24 | T-20 | B | [#23](https://github.com/harshbhx/modscrim/issues/23) |
| ☐ | T-22 | Web: console steps 1 to 3 | F-02 to F-06 | T-20 | B | [#24](https://github.com/harshbhx/modscrim/issues/24) |
| ☐ | T-23 | Web: console steps 4 to 6 | F-10 to F-14 | T-22 | B | [#25](https://github.com/harshbhx/modscrim/issues/25) |
| ☐ | T-24 | Web: overlay | FR-37 | T-20 | B | [#26](https://github.com/harshbhx/modscrim/issues/26) |
| ☐ | T-25 | Web: demo page and QR code | FR-38 | T-18, T-22 | B | [#27](https://github.com/harshbhx/modscrim/issues/27) |
| ☐ | T-26 | Hourly cron: validate, purge, subscription health | FR-03, FR-11, FR-43 | T-10 | A | [#28](https://github.com/harshbhx/modscrim/issues/28) |
| ☐ | T-27 | Sign-out deletion flow and test | FR-04 | T-10 | A | [#29](https://github.com/harshbhx/modscrim/issues/29) |
| ☐ | T-28 | Load script and NFR measurements | NFR-01 to NFR-03 | T-12 | A | [#30](https://github.com/harshbhx/modscrim/issues/30) |
| ☐ | T-29 | P1: Twitch re-grade after push; agreement rate | FR-30, FR-36 | T-16 | A | [#31](https://github.com/harshbhx/modscrim/issues/31) |
| ☐ | T-30 | P1: status panel | FR-44 | T-26 | B | [#32](https://github.com/harshbhx/modscrim/issues/32) |
| ☐ | T-31 | P1: Queue and R2 export, share link | FR-27 | T-17 | A | [#33](https://github.com/harshbhx/modscrim/issues/33) |
| ☐ | T-32 | P1: revoke subscription and handler | FR-12 | T-27 | A | [#34](https://github.com/harshbhx/modscrim/issues/34) |
| ☐ | T-33 | P1: mod Twitch sign-in and moderator check | FR-23 | T-13 | A | [#35](https://github.com/harshbhx/modscrim/issues/35) |
| ☐ | T-34 | P2: chat votes | FR-40 | T-10, T-12 | A | [#36](https://github.com/harshbhx/modscrim/issues/36) |
| ☐ | T-35 | P2: announcement | FR-41 | T-12 | A | [#37](https://github.com/harshbhx/modscrim/issues/37) |
| ☐ | T-36 | P2: coach's note | FR-42 | T-17 | B | [#38](https://github.com/harshbhx/modscrim/issues/38) |

Not covered by any ticket: FR-46 hide names (F-28, P1) and F-27 mod history (P2). See `open-questions.md` §3.

**Critical path to M2:** T-01 → T-02 → T-03 → T-04 and T-05 → T-07 → T-09 → T-12 → T-14 → T-18, with T-19, T-20, T-21, T-22, T-23, T-24 in parallel on the web side.

## 5. Day-0 kill test (SRS §13.3, about 3 hours)

**Product checks** (Node, `packages/core`, broadcaster token from the Twitch CLI):
1. Build wave A with 50 attack lines (training pools) and wave B with 50 (held-out pools).
2. Use the test channel's real public blocked terms and at least 300 chat lines (pad with fixture chat if short).
3. Run the rule finder on wave A lines that pass the current terms locally.
4. Measure locally: wave B blocked before and after; real-chat matches of the proposed terms.
5. Measure the quota unit: 1-line requests within 60 s until a 429 (a 429 on request `perMinute + 1` means requests count); wait 61 s, send one request with `perMinute + 1` lines (a 429 means lines count). Record 429 headers and body, response shape, time per request, agreement with the local matcher on 20 lines. Set `GRADING_QUOTA_UNIT` and `GRADING_BATCH_SIZE`.
6. Add one proposed term, grade again, remove it (checks A-01). Include `nitrodrop invalid` and grade `nitrodrop.invalid`, `nitrodrop[.]invalid`, `nitrodrop dot invalid`, `invalid nitrodrop`.

**Platform checks** (deployed Worker):
7. Alarm jitter: 40-line demo drill at 1.5 s; p95 of planned vs actual emit times.
8. CPU: rule finder in a room with a 20,000-line synthetic log; CPU time from Workers Logs.
9. Webhook: type in the test channel; time until `chat.stats` updates.

**Decision table (PRD §12.1):**

| Result | Decision |
|---|---|
| Improvement ≥ +20 points and 0 real-chat matches | Keep the full pitch |
| +10 to +20 points | Keep it; present the numbers plainly |
| Under +10 points | Lead with mod training; rules become secondary |
| Check AutoMod Status too limited for 14 lines a drill | Grade a 5-line sample with Twitch, the rest locally, label both |
| Twitch vs local agreement under 90% | Fix the matcher from observed behaviour before building on it |
| Alarm jitter p95 above 250 ms | Drive the running drill with in-object timers; keep alarms as the recovery backstop |

Record results and the decision in `docs/LOG.md`.

## 6. Fallback ladder for the live demo (PRD §14.2)

1. Full live loop with Twitch grading and a real push.
2. Live loop with sample Twitch grading (5 lines) and local for the rest, labelled.
3. Live drill on Twitch, with grading and rules shown in a demo room, labelled.
4. Entire loop in a demo room, labelled, plus a separate clip proving the Twitch connection (sign-in, chat log, a real push in the Twitch dashboard).

**Never fake a Twitch number.** If Twitch grading fails during recording, show the local estimate with its label and say so.

## 7. Submission checklist (PRD §13.6)

- [ ] Public GitHub repository with all source, `README.md`, `AGENTS.md`, the PRD and SRS (here in `docs/for-agents/`), a licence and no secrets
- [ ] README: what it is, demo URL, local quick start, Twitch app setup, Cloudflare deploy, privacy, how Codex was used, known limits, day-0 decision
- [ ] Deployed Worker URL works; `/demo` works in a private window
- [ ] Video under 3:00, public on YouTube, shows it working on Twitch and how Codex was used (script in PRD §13.2)
- [ ] Devpost text complete (outline in PRD §13.5), with screenshots of the console, mod console and the overlay in OBS
- [ ] Codex session IDs from `/status` (collected in `docs/LOG.md`)
- [ ] "Built with" tags: OpenAI Codex, Twitch API, EventSub, Cloudflare Workers, Durable Objects, D1, TypeScript, React
- [ ] Submitted by Mon 2 Nov 20:00 IST

## 8. Working rhythm (PRD §12.4, SRS §15.1)

- Start each day with a 10-minute plan; end it with a deploy, the end-of-day check and a note in `docs/LOG.md`.
- One Codex thread per area (core, worker, web), each opened from the matching tickets; record session IDs.
- Every commit message names the FR or T it serves.
- Humans review every diff against the safety rules before merging.
