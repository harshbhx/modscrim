# Open questions, `[verify]` register and spec gaps

Never guess a `[verify]` behaviour. Put it behind a named constant or var, test it on the test channel or the deployed Worker, log what you observe, and update the status here and in `docs/LOG.md`.

## 1. Assumptions (PRD §15)

| ID | Assumption | Code that depends on it | How to resolve | Owner, by | Status |
|---|---|---|---|---|---|
| A-01 | Blocked terms match case-insensitively, all words in any order, with no Unicode normalisation. **The most important one:** the best fixture rules are two-word pairs like `nitrodrop invalid` | `matcher.ts`; rule finder; every local number | Day-0 step 6 | B, Thu | ☐ |
| A-02 | Check AutoMod Status accepts up to 100 lines per request and counts quota per request or per line; remaining quota is not in headers | `GRADING_BATCH_SIZE`, `GRADING_QUOTA_UNIT`, `pace.ts` | Day-0 step 5 | A, Thu | ☐ |
| A-03 | `channel.chat.message` over webhooks works with an app token when the broadcaster grants `user:read:chat`, `user:bot`, `channel:bot`, with the broadcaster as chatting user | FR-08 subscription create | First sign-in on the test channel | A, Fri | ☐ |
| A-04 | `user.authorization.revoke` is available to the app over webhooks | FR-12 | Create on deploy; check the subscription list | A, Sun | ☐ |
| A-05 | Durable Object alarms are precise enough for a 1.5 s cadence | Drill clock | Day-0 step 7; fallback: in-object timers during a running drill | A, Thu | ☐ |
| A-06 | The rule finder fits the Free plan's per-invocation CPU budget for a 20,000-line log | `rules.ts` in the room | Day-0 step 8; fallback: lower `CLEAN_SET_MAX_LINES` or Workers Paid with `limits.cpu_ms` | A, Thu | ☐ |

## 2. Other `[verify]` items in the SRS

| Item | Where | Default until verified |
|---|---|---|
| Check AutoMod Status batch size and body shape `{"data":[{msg_id,msg_text}]}` | SRS §6.3 | `GRADING_BATCH_SIZE=100` |
| Remaining per-channel quota not reported in headers; a 429 is the only signal | SRS §2.4, §5.12, §6.5 | Count own sends in `grade_sends` |
| Get Moderators needs scope `moderation:read` | FR-23 (P1) | Scope requested at sign-in |
| A read-only query on a never-bootstrapped room leaves no stored data | SRS §3.4 | Answer `ignored`/404 before touching SQL |
| Twitch CLI supports `event verify-subscription` / `event trigger` for `channel.chat.message` | SRS §6.7 | Fall back to hand-signed requests in tests |
| CSP `connect-src 'self'` covers same-origin `wss:` in Safari | SRS §9.6 | Add explicit `wss://<host>` if not |
| Workers AI model `@cf/zai-org/glm-4.7-flash` Neuron cost on the Free plan | SRS §5.14 (P2) | Template fallback |

## 3. Spec gaps and contradictions found while indexing

| # | Issue | Where | Resolution to use |
|---|---|---|---|
| G-1 | FR-46 (hide mod names on the overlay, F-28, P1) has no ticket | SRS §15.3 | Resolved: ticket T-42 |
| G-2 | F-27 mod history (P2) has no ticket | SRS §15.3 | Resolved: ticket T-43 (P2, first to cut) |
| G-3 | Join-code throttle: FR-22 says 429 after **5** failed attempts per IP per minute (room SQLite); SRS §11.1 says **10** a minute per IP and channel; `JOIN_LIMITER` is 10/60 s | FR-22, §11.1, §12.2 | FR-22 is the requirement: 5 in the room; `JOIN_LIMITER` (10) is only an approximate outer guard |
| G-4 | `FIXTURE_CHAT` is declared as `readonly string[] = [] = [ … ]` (a stray destructuring assignment) | SRS §5.16 | Write `export const FIXTURE_CHAT: readonly string[] = [ … ];` |
| G-5 | The SRS repo layout puts specs at `docs/PRD.md` and `docs/SRS.md` and names the root `mod-fire-drill/` | SRS §12.1, PRD §13.6 | This repo uses `docs/for-agents/` and root `modscrim/`; the Worker is still named `mod-fire-drill` |
| G-6 | Overlay SPA route uses the channel **login** (`/overlay/:login?key=`) while its socket uses the **broadcaster ID** (`/ws/ch/:broadcasterId?overlayKey=`) | FR-37, SRS §8.2 | Overlay resolves the ID with `GET /api/public/channel/:login`, its only API call (SRS §9.5) |
| G-7 | React version is "18 or 19" | SRS §9.1 | Decide at T-01; record in `docs/LOG.md` |
| G-8 | Schedule slip: M0 (Thu 29 Oct 23:59) and the Thu evening setup are past and no code exists yet | PRD §12 | Run T-01, T-02 to T-06 and the day-0 test first; re-plan in `docs/LOG.md` |

## 4. Open questions (PRD §15)

| ID | Question | Plan | Owner, by |
|---|---|---|---|
| Q-01 | Will mod teams schedule drills without a hackathon reason? | Ask the 2 to 3 mods at the rehearsal; note answers in the README's "What's next" | B, Sun |
| Q-02 | Should mod names on the overlay be optional? | Default on, console toggle to hide (F-28, P1 if cheap) | B, Sat |
| Q-03 | Should rules be suggested per tactic rather than per drill? | Out of scope; note as next step | Both, after |

## 5. Risks to watch (PRD §14)

Highest: R-01 (grading quota too small), R-02 (Twitch matching differs from our model), R-08 (time overrun), R-13 (agent code drifts from the spec: follow `AGENTS.md`, cite FR IDs, tests first, review every diff). Full table with mitigations in PRD §14.
