# Index: Mod Fire Drill docs

Start here. This page tells you which document answers which question, where each topic sits inside the PRD and SRS, and how every feature traces to requirements, tickets and tests.

## 1. Document map

| File | Kind | Contents |
|---|---|---|
| [`PRD.md`](PRD.md) | Normative (scope, copy, safety) | Product Requirements Document v2.0: the what and the why |
| [`SRS.md`](SRS.md) | Normative (implementation) | Software Requirements Specification v2.0: the how, with working TypeScript |
| [`architecture.md`](architecture.md) | Digest | System shape, `ChannelRoom`, scheduler, flows, data placement |
| [`tech-stack.md`](tech-stack.md) | Digest | Libraries, Cloudflare bindings, vars and secrets, scripts, limits |
| [`interfaces.md`](interfaces.md) | Digest | REST, WebSocket protocol, room RPC, errors, cookies |
| [`twitch.md`](twitch.md) | Digest | Scopes, Helix calls, EventSub, rate limits, Twitch CLI |
| [`safety-security-privacy.md`](safety-security-privacy.md) | Digest | Safety rules, redaction, threats, retention, deletion |
| [`build-plan.md`](build-plan.md) | Tracker | Milestones, tickets with status, cut order, day-0, submission |
| [`testing.md`](testing.md) | Digest | Test layers, required files, commands, live checklist |
| [`glossary.md`](glossary.md) | Reference | Domain terms and ID prefixes |
| [`open-questions.md`](open-questions.md) | Tracker | `[verify]` register, open questions, spec gaps |
| [`../LOG.md`](../LOG.md) | Tracker | Decisions, day-0 results, Codex session IDs, session notes |
| [`../../AGENTS.md`](../../AGENTS.md) | Rules | Agent rules, commands, repo map, definition of done |

The digests summarise the PRD and SRS and point to the normative section. When you need exact code, a full schema or exact wording, open the cited section.

## 2. "Where do I find…"

| Topic | Normative source | Digest |
|---|---|---|
| The pitch and the 7-beat loop | PRD §1 | `architecture.md` §1 |
| P0 / P1 / P2 feature list | PRD §8.1, §8.2 | `build-plan.md` §3 |
| Exact UI strings | PRD §9.6 | — |
| Screens, routes, empty and error states | PRD §9.1 to §9.5 | `interfaces.md` §1 |
| Visual language, fonts, accessibility | PRD §9.7, §9.8; SRS §9 | — (design is out of this doc set) |
| Safety rules S-01 to S-12 | PRD §10 | `safety-security-privacy.md` |
| Cloudflare feature map | SRS §3.1 | `tech-stack.md` §2 |
| `ChannelRoom` design, scheduler, jobs | SRS §3.4, §8.5 | `architecture.md` §4 |
| Functional requirements FR-01 to FR-46 | SRS §4 | §4 below |
| Shared types | SRS §5.1 | — |
| PRNG, matcher, tricks, templates, waves | SRS §5.2 to §5.4 | `architecture.md` §6 |
| zod schemas | SRS §5.5 | `interfaces.md` §6 |
| Rule finder, clean index, proof | SRS §5.6 to §5.8 | `architecture.md` §6 |
| Scoring, Kai (sim) | SRS §5.9 | `architecture.md` §6 |
| Token sealing, webhook verify, sessions | SRS §5.10, §5.11, §5.13 | `safety-security-privacy.md` §3 |
| Grading pace | SRS §5.12 | `twitch.md` §5 |
| Fixtures (demo channel, chat, default config) | SRS §5.16 | `testing.md` §5 |
| Twitch setup, scopes, endpoints, webhooks | SRS §6 | `twitch.md` |
| Room SQLite and D1 schemas | SRS §7.2, §7.3 | `architecture.md` §5 |
| Report shape, queue message, retention | SRS §7.4 to §7.6 | `interfaces.md` §5, `safety-security-privacy.md` §5 |
| REST API | SRS §8.2 | `interfaces.md` §2 |
| WebSocket protocol and role routing | SRS §8.3 | `interfaces.md` §3 |
| Room RPC surface | SRS §8.4 | `interfaces.md` §4 |
| View types (`DrillView`, `ReportCard`…) | SRS §8.7 | `interfaces.md` §5 |
| UI stack, components, keyboard map | SRS §9 | `tech-stack.md` §1 |
| Non-functional requirements | SRS §10 | `testing.md` §4 |
| Threats and controls | SRS §11 | `safety-security-privacy.md` §3 |
| Repo layout, wrangler config, vars, scripts, deploy | SRS §12 | `tech-stack.md` |
| Tests, day-0 kill test, live checklist | SRS §13 | `testing.md`, `build-plan.md` §5 |
| Log events and runbook | SRS §14 | `architecture.md` §8 |
| Codex workflow and tickets | SRS §15 | `build-plan.md` §4 |
| Milestones, day plan, risks | PRD §12, §14 | `build-plan.md` |
| Assumptions and open questions | PRD §15 | `open-questions.md` |

## 3. Section index

### PRD v2.0

| § | Title | What is there |
|---|---|---|
| 1 | Executive summary | Pitch, 7-beat loop, why it can win, why Cloudflare, what it is not |
| 2 | Context and constraints | Hackathon facts, team and hours, hard constraints C-01 to C-06, platform decision |
| 3 | Problem | Statement, evidence, root causes, jobs to be done |
| 4 | Landscape | Hackathon field, existing tools, positioning, honest limits |
| 5 | Product principles | P-1 to P-8 |
| 6 | Personas | Streamer, mod, viewer, judge |
| 7 | User journeys | Streamer first run, live drill (10 steps), mod, viewer, judge, undo, leaving |
| 8 | Feature requirements | F-01 to F-28, P0 set, cut order, out of scope |
| 9 | Experience specification | Routes, console steps, mod console, overlay, demo page, copy deck, visuals, accessibility |
| 10 | Safety, trust and policy | S-01 to S-12 |
| 11 | Success metrics | M-01 to M-08 (hackathon), M-10 to M-14 (product), guardrails, instrumentation |
| 12 | Release plan | Milestones M0 to M6, day-0 decision table, day-by-day plan, definition of done, rhythm |
| 13 | Demo, video and submission | Demo strategy, video script, recording setup, judging map, Devpost outline, checklist |
| 14 | Risks | R-01 to R-16, early warnings, fallback ladder |
| 15 | Assumptions and open questions | A-01 to A-06, Q-01 to Q-03 |
| 16 | Glossary | Domain terms |
| 17 | References | Evidence, Twitch and Cloudflare docs |
| App. A, B | Changes from v1; judge FAQ | |

### SRS v2.0

| § | Title | What is there |
|---|---|---|
| 1 | Introduction | Purpose, scope, conventions, definitions (room, phase, engine, ticket) |
| 2 | Overall description | Context diagram, actors and auth, environment, design constraints with plan limits |
| 3 | Architecture | Cloudflare feature map, components, sequence diagrams, `ChannelRoom` design, request budget |
| 4 | Functional requirements | FR-01 to FR-46 with acceptance criteria |
| 5 | Core algorithms | Normative TypeScript: types, PRNG, matcher, attack engine, schema, rule finder, clean index, proof, scoring, sim, sealing, webhook verify, pace, sessions, coach note, fixtures |
| 6 | Twitch integration | App setup, tokens and scopes, endpoints, EventSub, rate limits, policy, CLI testing |
| 7 | Data model | Data placement, room schema, D1 schema, report shape, queue message, retention |
| 8 | Interfaces | Routing, REST API, WebSocket protocol, RPC surface, room and Worker sketches, view types |
| 9 | UI implementation | Stack, WebSocket client, components, keyboard map, overlay, security headers |
| 10 | Non-functional requirements | NFR-01 to NFR-21 |
| 11 | Security and privacy | Threats and controls, data minimisation, deletion flows |
| 12 | Configuration and deployment | Repo layout, `wrangler.jsonc`, Vite config, vars and secrets, scripts, first deploy, OBS |
| 13 | Verification | Strategy, required tests, DO test pattern, day-0 kill test, load script, live checklist |
| 14 | Observability | Log events, runbook |
| 15 | Codex build plan | How Codex is used, the original AGENTS.md, tickets T-01 to T-36 |
| 16 | Traceability | Feature to FR to tests |
| 17 | References | Twitch and Cloudflare docs |

## 4. Traceability: feature → requirements → tickets → tests

| Feature | Pri | FRs | Tickets | Tests |
|---|---|---|---|---|
| F-01 Streamer signs in with Twitch | P0 | FR-01 to FR-05 | T-07, T-08, T-26 (FR-03), T-27 (FR-04) | `session.test.ts`, `deletion.test.ts`, live checklist |
| F-02 Read the channel's filters | P0 | FR-06, FR-07 | T-11 | Contract tests, live checklist |
| F-03 Chat log for the false-ban check | P0 | FR-08 to FR-10, FR-43 | T-10, T-26 | `verify.test.ts`, `eventsub.route.test.ts` |
| F-04 Attack engine | P0 | FR-13 to FR-15 | T-02, T-03 | `waves.test.ts`, `safety.test.ts` |
| F-05 Live practice chat | P0 | FR-16 to FR-21, FR-24 | T-05, T-12, T-20, T-21 | `room.drill.test.ts`, load script |
| F-06 Mods join with a code | P0 | FR-22 | T-13 | `room.drill.test.ts` |
| F-07 Mods sign in with Twitch | P1 | FR-23 | T-33 | Manual |
| F-08 Scoring and reveal | P0 | FR-25, FR-26 | T-05, T-12 | `scoring.test.ts`, `overlay.redaction.test.ts` |
| F-09 Hosted OBS overlay | P0 | FR-37 | T-09, T-24 | `overlay.redaction.test.ts` |
| F-10 Twitch grades the filters | P0 | FR-07, FR-28 | T-05, T-15 | `pace.test.ts`, `room.grading.test.ts` |
| F-11 Labelled local fallback | P0 | FR-29 | T-15 | `room.grading.test.ts` |
| F-12 Rule finder with real-chat check | P0 | FR-31, FR-32 | T-02, T-04, T-16 | `matcher.test.ts`, `ruleFinder.test.ts`, `cleanIndex.property.test.ts` |
| F-13 Proof on a fresh wave | P0 | FR-33 | T-04, T-16 | `proof.test.ts` |
| F-14 Push with undo | P0 | FR-34, FR-35, FR-45 | T-16 | `room.push.test.ts` |
| F-15 Twitch re-grade after push | P1 | FR-30, FR-36 | T-29 | `room.grading.test.ts` |
| F-16 Public demo rooms | P0 | FR-38 | T-18, T-25 | Playwright (P1), manual |
| F-17 Several mods on one scoreboard | P0 | FR-18, FR-25 | T-12 | `room.drill.test.ts` |
| F-18 Simulated co-mod Kai (sim) | P0 demo, P1 live | FR-39 | T-05, T-14 | `sim.test.ts` |
| F-19 After-action report | P0 | FR-27 | T-17 | Manual |
| F-20 Report export and share link | P1 | FR-27 | T-31 | `deletion.test.ts`, manual |
| F-21 Deletion on revoke | P1 | FR-12 | T-32 | Manual on the test channel |
| F-22 Connection status panel | P1 | FR-11, FR-44 | T-26, T-30 | Manual |
| F-23 Hate-raid tactic | P2 | FR-13, FR-14 | T-03 (templates; off by default) | `safety.test.ts` |
| F-24 Chat votes | P2 | FR-40 | T-34 | Manual |
| F-25 Drill announcement | P2 | FR-41 | T-35 | NFR-14 constant test |
| F-26 Coach's note | P2 | FR-42 | T-36 | Prompt contains no line text |
| F-27 Mod history | P2 | FR-27 | T-43 | History aggregation test |
| F-28 Hide mod names on overlay | P1 | FR-46 | T-42 | `overlay.redaction.test.ts` |

## 5. ID scheme

| Prefix | Meaning | Defined in |
|---|---|---|
| `F-xx` | Product feature | PRD §8.1 |
| `FR-xx` | Functional requirement | SRS §4 |
| `NFR-xx` | Non-functional requirement | SRS §10 |
| `S-xx` | Safety requirement | PRD §10 |
| `T-xx` | Build ticket for Codex | SRS §15.3 |
| `M-xx` | Metric or milestone (`M0` to `M6` are milestones, `M-01`+ are metrics) | PRD §11, §12.1 |
| `R-xx` | Risk | PRD §14 |
| `A-xx` | Assumption | PRD §15 |
| `Q-xx` | Open question | PRD §15 |
| `C-xx` | Hard constraint | PRD §2.3 |
| `P-x` | Product principle | PRD §5 |
| `P0` / `P1` / `P2` | Priority: must ship / should ship / only if ahead at the freeze | PRD "How to use" |
| `[verify]` | Unconfirmed Twitch or Cloudflare behaviour; test it, never guess | `open-questions.md` |
