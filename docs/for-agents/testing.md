# Testing

A digest of SRS §5.3, §5.15, §10 and §13. Tests come first (AGENTS.md rule 4): write the test the SRS names, watch it fail, then implement.

## 1. Layers (SRS §13.1)

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest in Node | Everything in `packages/core` (≥ 80% line coverage, M-08 / NFR-17) |
| Property | Vitest with seeded generators | Clean index equals brute force; rule-finder safety; wave invariants |
| Worker integration | `@cloudflare/vitest-plugin` (Vitest 4.1+) in `workerd` | Routes, webhook verify, room behaviour with `runInDurableObject` and `runDurableObjectAlarm`, D1 migrations |
| Contract | Mocked `fetch` for Helix and OAuth | Request shapes, 401 refresh, 429 back-off |
| End to end | Playwright on a demo room (P1) | Start, act, grade, rules, prove, simulated push |
| Live | Manual checklist (§6) | The real Twitch path |

Core tests must also run in the Worker pool (NFR-21: core runs unchanged in Node and `workerd`).

## 2. Commands

Created by T-01 (see `AGENTS.md`):

```bash
npm test                                               # everything
npm test -w packages/core                              # core only (Node)
npm test -w app                                        # Worker tests (workerd pool)
npm test -w packages/core -- matcher                   # one file by name
npx vitest run packages/core/test/matcher.test.ts -t "spaced"   # one test by name
npm test -w packages/core -- --coverage                # coverage report
npm run typecheck
```

## 3. Required tests (SRS §13.2)

| File | Asserts | Covers | Ticket |
|---|---|---|---|
| `packages/core/test/matcher.test.ts` | Table in §4; multi-word any order; wildcards at both ends; uppercase; digits | FR-31 | T-02 |
| `waves.test.ts` | Same seed deep-equal; exact counts; wave B never uses training-only tricks, wave A never held-out-only | FR-13 | T-03 |
| `safety.test.ts` | 10,000 lines: every link ends `.invalid`; slur segments only placeholders; no banter line equals a fixture chat line | FR-14, FR-15, S-02 to S-04 | T-03 |
| `ruleFinder.test.ts` | ≤ 6 accepted; each covers ≥ 2 and matches 0 clean lines; deterministic; `invalid` rejected on the fixture | FR-31 | T-04 |
| `cleanIndex.property.test.ts` | 500 random cases: fast index equals brute force | NFR-04 | T-04 |
| `proof.test.ts` | Before ≤ after; push disallowed if any selected term matches clean | FR-33 | T-04 |
| `scoring.test.ts` | Fixed logs give expected caught, false bans, averages, slipped | FR-25 | T-05 |
| `sim.test.ts` | Deterministic per seed; about 60% of attacks over 1,000 lines | FR-39 | T-05 |
| `pace.test.ts` | Minute and hour windows in units; oversized batches rejected; post-429 block honoured | FR-28 | T-05 |
| `app/test/verify.test.ts` | Valid signature passes; one changed byte fails; stale timestamp fails; nanosecond timestamps parse | FR-09 | T-10 |
| `session.test.ts` | Sign and read; tampering fails; expiry fails; malformed tokens return null | FR-05 | T-07 |
| `room.drill.test.ts` | Emits in order; first action wins; slips; stop; one draft at a time; editing keeps the code; mods carry over; non-members rejected; 6th failed join in a minute → 429; restart mid-drill emits nothing twice | FR-17 to FR-22, NFR-07 | T-12, T-13 |
| `room.grading.test.ts` | Batching by quota unit; pacing; 429 resume; 401 refresh once; deferred while running; a self-rescheduling job survives; local label | FR-28, FR-29, NFR-07 | T-15 |
| `room.push.test.ts` | Stores IDs; `preexisting` only from the fresh list or `created_at` > 60 s old; idempotent re-push; failed and removed retried; undo skips preexisting; demo never calls Twitch | FR-34, FR-35 | T-16 |
| `overlay.redaction.test.ts` | Redaction rule for every overlay message of a full drill, including report cards; `hideNames` | FR-37, FR-46, S-05 | T-09, T-24 |
| `eventsub.route.test.ts` | Challenge echoed as `text/plain`; revocation recorded; duplicate stored once; shared-chat ignored | FR-08 to FR-10 | T-10 |
| `deletion.test.ts` | After logout no D1 rows, room storage or R2 objects remain | FR-04, NFR-13 | T-27 |

## 4. Matcher cases (SRS §5.3, required)

| Term | Message | Expected |
|---|---|---|
| `free nitro` | "NITRO is free" | match |
| `nitrod*` | "nitrodrop.invalid" | match |
| `*odrop` | "nitrodrop" | match |
| `*itrod*` | "nitrodrop" | match |
| `free` | "f r e e nitro" | no match (spaced) |
| `free` | "fr33 nitro" | no match (leet) |
| `free` | "fr" + U+0435 U+0435 | no match (look-alike) |
| `free` | "fr" + U+200B + "ee" | no match (zero-width splits the token) |
| `bit.ly` | "go to bit.ly/x" | match (parts `bit` and `ly`) |
| `fr*ee` | — | rejected by `validateTerm` |
| `*` | — | rejected by `validateTerm` |

## 5. Fixtures and reference numbers (SRS §5.15, §5.16)

- **Demo channel:** `pixelpanda_tv`, broadcaster type normal. Terms: `free nitro`, `bit.ly`, `buy followers`, `slurx`, `freebits`.
- **Default config:** tactics `linkscam`, `spam`, `botwave`; primary `linkscam`; 14 attacks, 8 banter; 1,500 ms interval; 9,000 ms slip window; seed 7; Kai on.
- **Fixture chat:** 71 curated lines (`FIXTURE_CHAT`). Must keep "that move was invalid lol"; no line may equal a banter line.

Reference results the SRS measured on 29 Oct (use them as regression anchors):

| Check | Expected |
|---|---|
| Wave sizes | Wave A 22 lines (14 attacks); wave B 30 |
| Seed 7 run | 11 of 14 attacks pass the fixture terms; accepted `nitrodrop invalid`, `giftsnow invalid`, `viewbump invalid`; rejected include `invalid`, `inval*`, `strea*`; wave B blocked 4/30 before, 17/30 after |
| Rule-finder safety (200 seeds) | Every accepted term matches 0 clean lines and covers ≥ 2; `invalid` always rejected with "that move was invalid lol" |
| Fresh-wave improvement (200 seeds, local) | Median +30.0 points; 10th percentile +16.7 |
| Clean index | Equals brute force on 5,000 random queries |
| Kai (sim) | Acts on about 62% of attacks over 50 drills; delays 2.6 to 6.8 s |
| Index performance (Node 22) | 20,000-line log: index build 27 ms, rule finder 6 ms (brute force 1,192 ms) |

## 6. Durable Object test pattern (SRS §13.2, sketch)

Fast-forward the scheduler one job at a time: set the earliest `schedule.due_at` to 0 inside `runInDurableObject`, then call `runDurableObjectAlarm(room)` until it returns false. Bootstrap a demo room with `demoBootstrap('demo:test-…')` and `DEFAULT_CONFIG`. The full example (every attack slips when nobody acts) is in SRS §13.2.

## 7. Non-functional checks (SRS §10)

| NFR | Target | Measured by |
|---|---|---|
| NFR-01 | `drill.line` spread across clients p95 < 300 ms (10 mods, 2 overlays) | `scripts/load.ts` |
| NFR-02 | Emit jitter p95 < 250 ms at 1.5 s | Day-0; `line.emit` logs |
| NFR-03 | Mod action round trip p95 < 250 ms | Load script |
| NFR-04 | Rule finder + index < 1 s and within the CPU limit (40 passed lines, 20,000-line log) | Day-0; Workers Logs |
| NFR-05 | `/eventsub` p95 < 500 ms | Workers Logs |
| NFR-06 | Initial JS < 250 KB gzipped; console usable in 2.5 s on a mid-range phone over 4G | Vite build report; Lighthouse |
| NFR-07 | Restart mid-drill: no line emitted twice; drill finishes or ends within 10 s | Worker test |
| NFR-18 | Same seed → same waves, Kai decisions, rule-finder output | Snapshot tests |

Others (security, privacy, accessibility, compatibility, cost) are in SRS §10.

## 8. Live checklist before recording (SRS §13.5)

- [ ] Sign-in works; consent shows the expected scopes
- [ ] Blocked-term count matches the Twitch dashboard
- [ ] A message typed in the test channel increases the chat count within 5 s
- [ ] A second account joins as a mod from a phone on mobile data
- [ ] A full drill runs with no errors in Workers Logs
- [ ] Grading shows a Twitch-graded number with its label
- [ ] Push adds terms visible in the Twitch dashboard; Undo removes them; pre-existing terms survive Undo
- [ ] OBS shows the overlay with a transparent background and no readable attack text
- [ ] `/demo` works in a private window on another network
- [ ] Sign-out deletes data (check D1 and the console)
