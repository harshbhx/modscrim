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

- **Harsh: Cloudflare.** Worker foundations, D1 and sealing, the `ChannelRoom` Durable Object (scheduler, sockets, drill engine, mod join, Kai jobs, reports, demo rooms), cron and deletion, Queues and R2 export, Workers AI coach note, hide-names payloads, the deploy, and the landing page. GitHub label `owner: harsh`.
- **Dhairya: engine, Twitch, web, testing and launch.** `packages/core`, all Twitch integration (OAuth, EventSub, filters, grading, push and undo, revoke, mod sign-in, votes, announcement), the web app, **all testing** (the paired test tickets T-50 to T-55 for Harsh's Cloudflare tickets, the load test, the end-to-end test, the accessibility pass, the day-0 run and the live rehearsal), CI, README, the video and the Devpost submission. GitHub label `owner: dhairya`.
- This replaces the PRD §2.2 Builder A / Builder B split.
- **Codex** writes most code from these tickets; humans review, test and decide.

## 3. Scope

**P0 (must ship):** F-01 to F-06, F-08 to F-14, F-16 to F-19. Together: read filters, drill, score, grade, find rules, prove on a fresh wave, push and undo, plus the public demo.

**Cut order if the schedule slips (cut from the top):** F-26, F-24, F-25, F-23, F-27, F-28, F-20, F-22, F-21, F-15, F-07. Never cut a P0; if a P0 is at risk at the freeze, use the fallback ladder (§6).

## 4. Tickets (SRS §15.3)

Each ticket is sized for under 2 hours of Codex plus review. Open each Codex session with `AGENTS.md`, the ticket text and the cited SRS sections. Tests first.

| ☐ | ID | Ticket | FR / NFR | Pri | Owner | Milestone | After | Issue · PR |
|---|---|---|---|---|---|---|---|---|
| ☑ | T-01 | Monorepo, TS config, Vitest in core, Vite + Cloudflare plugin app, hello-world deploy | — | P0 | Harsh | M1 | — | [#3](https://github.com/harshbhx/modscrim/pull/3) |
| ☑ | T-02 | `prng.ts`, `matcher.ts` with the SRS §5.3 test table | FR-31 | P0 | Harsh | M2 | T-01 | [#4](https://github.com/harshbhx/modscrim/issues/4) · [#39](https://github.com/harshbhx/modscrim/pull/39) |
| ☐ | T-03 | `tricks.ts`, `templates.ts`, `waves.ts`, `safety.test.ts` | FR-13 to FR-15 | P0 | Dhairya | M2 | T-02, T-37 | [#5](https://github.com/harshbhx/modscrim/issues/5) |
| ☐ | T-04 | `cleanIndex.ts` with the property test; `ruleFinder.ts`; `proof.ts` | FR-31, FR-33 | P0 | Dhairya | M2 | T-03 | [#6](https://github.com/harshbhx/modscrim/issues/6) |
| ☐ | T-05 | `scoring.ts`, `sim.ts`, `pace.ts`, `schema.ts` | FR-16, FR-25, FR-28, FR-39 | P0 | Dhairya | M2 | T-02 | [#7](https://github.com/harshbhx/modscrim/issues/7) |
| ☐ | T-06 | `scripts/day0.ts` | — | P0 | Dhairya | M2 | T-04 | [#8](https://github.com/harshbhx/modscrim/issues/8) |
| ☑ | T-07 | D1 migration; `crypto.ts`, `session.ts`, cookies, Origin check | FR-02, FR-05 | P0 | Harsh | M1 | T-38 | [#9](https://github.com/harshbhx/modscrim/issues/9) |
| ☐ | T-08 | OAuth login and callback; Helix `users`; token refresh in the room | FR-01, FR-02 | P0 | Dhairya | M3 | T-07 | [#10](https://github.com/harshbhx/modscrim/issues/10) |
| ☑ | T-09 | `ChannelRoom` skeleton: schema, scheduler, hub, tickets, overlay key | FR-21, FR-37 | P0 | Harsh | M1 | T-07, T-37 | [#11](https://github.com/harshbhx/modscrim/issues/11) |
| ☐ | T-10 | Webhook verify and route; subscription create and reconcile; chat ingest | FR-08 to FR-10 | P0 | Dhairya | M3 | T-08, T-09 | [#12](https://github.com/harshbhx/modscrim/issues/12) |
| ☐ | T-11 | Filters read and cache; broadcaster type | FR-06, FR-07 | P0 | Dhairya | M3 | T-08 | [#13](https://github.com/harshbhx/modscrim/issues/13) |
| ☑ | T-12 | Drill create, start, emit, act, slip, stop, end; snapshot | FR-16 to FR-21 | P0 | Harsh | M2 | T-05, T-09, T-37 | [#14](https://github.com/harshbhx/modscrim/issues/14) |
| ☑ | T-13 | Mod join (code), participant tokens, rate limits | FR-22 | P0 | Harsh | M2 | T-12 | [#15](https://github.com/harshbhx/modscrim/issues/15) |
| ☑ | T-14 | Kai (sim) jobs | FR-39 | P0 | Harsh | M2 | T-12 | [#16](https://github.com/harshbhx/modscrim/issues/16) |
| ☐ | T-15 | Grading queue with pacing and local fallback | FR-28, FR-29 | P0 | Dhairya | M2 | T-11, T-12 | [#17](https://github.com/harshbhx/modscrim/issues/17) |
| ☐ | T-16 | Rules, proof, push and undo in the room; audit log | FR-31 to FR-35, FR-45 | P0 | Dhairya | M2 | T-04, T-15 | [#18](https://github.com/harshbhx/modscrim/issues/18) |
| ☑ | T-17 | Report build and console view | FR-27 | P0 | Harsh | M2 | T-16 | [#19](https://github.com/harshbhx/modscrim/issues/19) |
| ☑ | T-18 | Demo rooms with fixtures and GC | FR-38 | P0 | Harsh | M2 | T-12, T-14 | [#20](https://github.com/harshbhx/modscrim/issues/20) |
| ☑ | T-19 | Web: tokens, layout, landing, privacy page | — | P0 | Harsh | M2 | T-01 | [#21](https://github.com/harshbhx/modscrim/issues/21) |
| ☐ | T-20 | Web: `useRoom` and the WebSocket client | FR-21 | P0 | Dhairya | M2 | T-09, T-37 | [#22](https://github.com/harshbhx/modscrim/issues/22) |
| ☐ | T-21 | Web: mod console with keyboard | FR-22, FR-24 | P0 | Dhairya | M2 | T-20 | [#23](https://github.com/harshbhx/modscrim/issues/23) |
| ☐ | T-22 | Web: console steps 1 to 3 | F-02 to F-06 | P0 | Dhairya | M2 | T-20 | [#24](https://github.com/harshbhx/modscrim/issues/24) |
| ☐ | T-23 | Web: console steps 4 to 6 | F-10 to F-14 | P0 | Dhairya | M2 | T-22 | [#25](https://github.com/harshbhx/modscrim/issues/25) |
| ☐ | T-24 | Web: overlay | FR-37 | P0 | Dhairya | M2 | T-20 | [#26](https://github.com/harshbhx/modscrim/issues/26) |
| ☐ | T-25 | Web: demo page and QR code | FR-38 | P0 | Dhairya | M2 | T-18, T-22 | [#27](https://github.com/harshbhx/modscrim/issues/27) |
| ☑ | T-26 | Hourly cron: validate, purge, subscription health | FR-03, FR-11, FR-43 | P0 | Harsh | M3 | T-10 | [#28](https://github.com/harshbhx/modscrim/issues/28) |
| ☑ | T-27 | Sign-out deletion flow and test | FR-04 | P0 | Harsh | M3 | T-10 | [#29](https://github.com/harshbhx/modscrim/issues/29) |
| ☐ | T-28 | Load script and NFR measurements | NFR-01 to NFR-03 | P0 | Dhairya | M3 | T-12 | [#30](https://github.com/harshbhx/modscrim/issues/30) |
| ☐ | T-29 | P1: Twitch re-grade after push; agreement rate | FR-30, FR-36 | P1 | Dhairya | M4 | T-16 | [#31](https://github.com/harshbhx/modscrim/issues/31) |
| ☐ | T-30 | P1: status panel | FR-44 | P1 | Dhairya | M4 | T-26 | [#32](https://github.com/harshbhx/modscrim/issues/32) |
| ☐ | T-31 | P1: Queue and R2 export, share link | FR-27 | P1 | Harsh | M4 | T-17 | [#33](https://github.com/harshbhx/modscrim/issues/33) |
| ☐ | T-32 | P1: revoke subscription and handler | FR-12 | P1 | Dhairya | M4 | T-27 | [#34](https://github.com/harshbhx/modscrim/issues/34) |
| ☐ | T-33 | P1: mod Twitch sign-in and moderator check | FR-23 | P1 | Dhairya | M4 | T-13 | [#35](https://github.com/harshbhx/modscrim/issues/35) |
| ☐ | T-34 | P2: chat votes | FR-40 | P2 | Dhairya | M4 | T-10, T-12 | [#36](https://github.com/harshbhx/modscrim/issues/36) |
| ☐ | T-35 | P2: announcement | FR-41 | P2 | Dhairya | M4 | T-12 | [#37](https://github.com/harshbhx/modscrim/issues/37) |
| ☐ | T-36 | P2: coach's note | FR-42 | P2 | Harsh | M4 | T-17 | [#38](https://github.com/harshbhx/modscrim/issues/38) |
| ☑ | T-37 | Shared types, WebSocket protocol and view types in core | — | P0 | Dhairya | M1 | T-02 | [#41](https://github.com/harshbhx/modscrim/issues/41) |
| ☑ | T-38 | Worker foundations: router layout, error handling, structured logs and IDs | NFR-10, NFR-11, NFR-20 | P0 | Harsh | M1 | T-01 | [#42](https://github.com/harshbhx/modscrim/issues/42) |
| ☐ | T-39 | Continuous integration on every pull request | NFR-06, NFR-12, NFR-17, NFR-21 | P0 | Dhairya | M1 | T-01 | [#43](https://github.com/harshbhx/modscrim/issues/43) |
| ☐ | T-40 | Register the Twitch app and deploy the Worker to Cloudflare | — | P0 | Harsh | M1 | T-01 | [#44](https://github.com/harshbhx/modscrim/issues/44) |
| ☐ | T-41 | Run the day-0 kill test and record the decision | A-01 to A-06 | P0 | Dhairya | M3 | T-06, T-40 | [#45](https://github.com/harshbhx/modscrim/issues/45) |
| ☑ | T-42 | Hide mod names on the overlay | FR-46 | P1 | Harsh | M4 | T-09, T-24 | [#46](https://github.com/harshbhx/modscrim/issues/46) |
| ☐ | T-43 | Mod history across drills | FR-27 | P2 | Dhairya | M4 | T-17 | [#47](https://github.com/harshbhx/modscrim/issues/47) |
| ☐ | T-44 | End-to-end test of the demo loop | M-05 | P1 | Dhairya | M4 | T-25 | [#48](https://github.com/harshbhx/modscrim/issues/48) |
| ☐ | T-45 | README, licence and a judge-ready public repository | M-06 | P0 | Dhairya | M6 | T-18, T-40 | [#49](https://github.com/harshbhx/modscrim/issues/49) |
| ☐ | T-46 | Accessibility, responsive and cross-browser pass | NFR-06, NFR-15, NFR-16 | P1 | Dhairya | M4 | T-21, T-23, T-24 | [#50](https://github.com/harshbhx/modscrim/issues/50) |
| ☐ | T-47 | Live rehearsal on the test channel with real mods | M-01, M-03, M-04 | P0 | Dhairya | M4 | T-10, T-16, T-23, T-24 | [#51](https://github.com/harshbhx/modscrim/issues/51) |
| ☐ | T-48 | Record and edit the demo video | M-07 | P0 | Dhairya | M5 | T-47 | [#52](https://github.com/harshbhx/modscrim/issues/52) |
| ☐ | T-49 | Devpost submission | M6 | P0 | Dhairya | M6 | T-45, T-48 | [#53](https://github.com/harshbhx/modscrim/issues/53) |
| ☐ | T-50 | Tests: auth, sessions, crypto and Worker foundations | Tests for T-07, T-38 | P0 | Dhairya | M1 | T-07, T-38 | [#56](https://github.com/harshbhx/modscrim/issues/56) |
| ☐ | T-51 | Tests: ChannelRoom scheduler, sockets and tickets | Tests for T-09 | P0 | Dhairya | M1 | T-09 | [#57](https://github.com/harshbhx/modscrim/issues/57) |
| ☐ | T-52 | Tests: drill engine, mod join and Kai (sim) | Tests for T-12, T-13, T-14 | P0 | Dhairya | M2 | T-12, T-13, T-14 | [#58](https://github.com/harshbhx/modscrim/issues/58) |
| ☐ | T-53 | Tests: after-action reports and demo rooms | Tests for T-17, T-18 | P0 | Dhairya | M2 | T-17, T-18 | [#59](https://github.com/harshbhx/modscrim/issues/59) |
| ☐ | T-54 | Tests: hourly cron, retention and sign-out deletion | Tests for T-26, T-27 | P0 | Dhairya | M3 | T-26, T-27 | [#60](https://github.com/harshbhx/modscrim/issues/60) |
| ☐ | T-55 | Tests: report export, coach note and hidden mod names | Tests for T-31, T-36, T-42 | P1 | Dhairya | M4 | T-31, T-36, T-42 | [#61](https://github.com/harshbhx/modscrim/issues/61) |
| ☐ | T-56 | Brand kit and marketing website on modscrim.dualmindlab.tech (parent of T-57 to T-60) | — | P0 | Harsh | M4 | — | [#76](https://github.com/harshbhx/modscrim/issues/76) |
| ☐ | T-57 | Brand assets in `brand/`: logos, fonts with OFL licences, social and stream images, `DESIGN.md` | PRD §9.7 | P0 | Harsh | M4 | — | [#77](https://github.com/harshbhx/modscrim/issues/77) |
| ☐ | T-58 | Website pages and shared styles in `site/` (parent of T-61 to T-73) | PRD §9.1, §9.6 | P0 | Harsh | M4 | T-57 | [#78](https://github.com/harshbhx/modscrim/issues/78) |
| ☐ | T-61 | ↳ Shared styles, brand tokens and self-hosted fonts | PRD §9.7 | P0 | Harsh | M4 | T-57 | [#81](https://github.com/harshbhx/modscrim/issues/81) |
| ☐ | T-62 | ↳ Head meta, favicons, web manifest and OG image | — | P0 | Harsh | M4 | T-57 | [#82](https://github.com/harshbhx/modscrim/issues/82) |
| ☐ | T-63 | ↳ Home page with the playable 30-second drill (`index.html`, `site.js`) | PRD §9.8 | P0 | Harsh | M4 | T-61, T-62 | [#83](https://github.com/harshbhx/modscrim/issues/83) |
| ☐ | T-64 | ↳ How it works page | — | P0 | Harsh | M4 | T-63 | [#84](https://github.com/harshbhx/modscrim/issues/84) |
| ☐ | T-65 | ↳ For mods page | PRD §9.3 | P0 | Harsh | M4 | T-63 | [#85](https://github.com/harshbhx/modscrim/issues/85) |
| ☐ | T-66 | ↳ Safety page | PRD §10 | P0 | Harsh | M4 | T-63 | [#86](https://github.com/harshbhx/modscrim/issues/86) |
| ☐ | T-67 | ↳ Setup guide page | — | P0 | Harsh | M4 | T-63 | [#87](https://github.com/harshbhx/modscrim/issues/87) |
| ☐ | T-68 | ↳ FAQ page | — | P0 | Harsh | M4 | T-63 | [#88](https://github.com/harshbhx/modscrim/issues/88) |
| ☐ | T-69 | ↳ Demo room page | PRD §9.5 | P0 | Harsh | M4 | T-63 | [#89](https://github.com/harshbhx/modscrim/issues/89) |
| ☐ | T-70 | ↳ Product preview: streamer console | PRD §9.2 | P0 | Harsh | M4 | T-63 | [#90](https://github.com/harshbhx/modscrim/issues/90) |
| ☐ | T-71 | ↳ Product preview: mod view | PRD §9.3 | P0 | Harsh | M4 | T-63 | [#91](https://github.com/harshbhx/modscrim/issues/91) |
| ☐ | T-72 | ↳ Product preview: OBS overlay | PRD §9.4 | P0 | Harsh | M4 | T-63 | [#92](https://github.com/harshbhx/modscrim/issues/92) |
| ☐ | T-73 | ↳ Product preview: shared report | — | P0 | Harsh | M4 | T-63 | [#93](https://github.com/harshbhx/modscrim/issues/93) |
| ☐ | T-59 | Legal pages and placeholders (parent of T-74 to T-76) | PRD §10 | P0 | Harsh | M4 | T-58 | [#79](https://github.com/harshbhx/modscrim/issues/79) |
| ☐ | T-74 | ↳ Privacy policy page | PRD §10 | P0 | Harsh | M4 | T-61, T-62 | [#94](https://github.com/harshbhx/modscrim/issues/94) |
| ☐ | T-75 | ↳ Terms of use page | PRD §10 | P0 | Harsh | M4 | T-61, T-62 | [#95](https://github.com/harshbhx/modscrim/issues/95) |
| ☐ | T-76 | ↳ Contact email and governing law in the legal pages | — | P0 | Harsh | M4 | T-74, T-75 | [#96](https://github.com/harshbhx/modscrim/issues/96) |
| ☐ | T-60 | Host `site/` on Cloudflare Pages at modscrim.dualmindlab.tech (parent of T-77 to T-80) | SRS §9.6 | P0 | Harsh | M4 | T-58, T-59 | [#80](https://github.com/harshbhx/modscrim/issues/80) |
| ☐ | T-77 | ↳ Security headers for the static site (`site/_headers`) | SRS §9.6 | P0 | Harsh | M4 | T-63 | [#97](https://github.com/harshbhx/modscrim/issues/97) |
| ☐ | T-78 | ↳ Cloudflare Pages project, Git-connected (branch `main`, output `site`, no build) | — | P0 | Harsh | M4 | T-77 | [#98](https://github.com/harshbhx/modscrim/issues/98) |
| ☐ | T-79 | ↳ Custom domain modscrim.dualmindlab.tech and DNS | — | P0 | Harsh | M4 | T-78 | [#99](https://github.com/harshbhx/modscrim/issues/99) |
| ☐ | T-80 | ↳ Post-launch checks: links, OG preview, Lighthouse | PRD §9.8 | P0 | Harsh | M4 | T-79 | [#100](https://github.com/harshbhx/modscrim/issues/100) |

T-37 to T-49 were added after a gap review of the PRD and SRS (protocol types, Worker foundations, CI, deploy, the day-0 run, hide names, mod history, end-to-end tests, README, accessibility, rehearsal, video, Devpost). T-50 to T-55 hold the automated tests for Harsh's Cloudflare tickets, owned by Dhairya. T-56 to T-80 cover the brand kit (`brand/`) and the static marketing website (`site/`) on Cloudflare Pages at `https://modscrim.dualmindlab.tech`; rows marked ↳ are nested sub-issues of the parent row above them. Every ticket is a GitHub issue with labels for priority, owner, area and type, a milestone (M1 to M6), and a card on the [project board](https://github.com/users/harshbhx/projects/3).

**Critical path to submission:** T-38 → T-07 (Harsh) → T-08 → T-11 → T-15 → T-16 (Dhairya) → T-47 → T-48 → T-49 (Dhairya). Harsh's T-38, T-07 and T-09 unblock almost everything, so they go first. Dhairya's core tickets (T-03 to T-05, T-37) need nothing from Harsh and run in parallel.

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
