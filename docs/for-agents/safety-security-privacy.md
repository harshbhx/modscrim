# Safety, security and privacy

A digest of PRD §5, §10 and SRS §5.10 to §5.13, §7.6, §11. These rules are hard requirements (C-04). A change that weakens any of them is not done, whatever else it achieves.

## 1. Safety rules (PRD §10) and how they are enforced

| ID | Rule | Enforced by |
|---|---|---|
| S-01 | Nothing the attack engine generates is ever sent to real Twitch chat. The only message the app may send is the fixed F-25 announcement | The only chat send path uses a constant behind `ANNOUNCE_ENABLED` (NFR-14 test); log audit |
| S-02 | Every generated link uses the `.invalid` TLD | `LINK_TRICK` always appends an `.invalid` form; `safety.test.ts` scans 10,000 lines |
| S-03 | Slurs are placeholders `slurx`, `slury`, rendered as solid `▇` blocks; no real slur list anywhere | `SLURS` constant; `safety.test.ts`; renderers draw `slur` segments as blocks |
| S-04 | Banter only from the curated pool, never from real viewers | `BANTER` constant; test that no logged chat line appears in a wave (FR-15) |
| S-05 | The overlay never receives readable attack text; only length placeholders | Per-role payload builders; `overlay.redaction.test.ts`; overlay DOM has no text nodes for message bodies |
| S-06 | Evasion lists are never published, exported or shared; reports carry counts, not attack text | Report export strips text and `fpExample`; share card is numbers only |
| S-07 | Hate-raid tactic off by default with a content warning | Default config excludes `hateraid`; copy key `hate.warning` |
| S-08 | Chat log used only for the false-ban check; 7 days; never on the overlay; blurred in the console until hovered; deletable; deleted on sign-out or revoke | Retention jobs; Delete button; deletion flows below |
| S-09 | No term reaches Twitch without explicit approval; every push can be undone | Push only from the **Approve and push** action; `undo` |
| S-10 | Tokens never reach the browser and are encrypted at rest | AES-256-GCM sealing; no token in any response or log |
| S-11 | Practice chat is opt-in for mods and always carries the "practice only" banner | Copy key `banner.practice` |
| S-12 | Follow the Twitch Developer Agreement and ToS: no spam, no public chat database, honour deletion | All of the above |

Also out of scope for safety reasons (PRD §8.4): acting on real chat (delete, timeout, ban), real slur lists or phishing links, writing AutoMod settings.

## 2. Overlay redaction rule (SRS §8.3)

For overlay sockets, payload builders take the role and produce:
- `drill.line` → `RedactedLine` with exactly `lineId`, `user`, `len` (rounded to 4).
- `drill.ended` → no `reveal`.
- `drill.state` → redacted lines, no reveal.
- `report.ready` → `ReportCard` only (counts, no terms).
- With `hideNames` (FR-46), mod names become "Mod 1", "Mod 2" in join order.

The test serialises every overlay message of a full drill and asserts that, for each attack line, no string field other than `user` and `name` contains the line's text, any link segment, or any keyword segment of 4+ characters after its trick. Bot usernames such as `free_x1y2z37` stay readable by design. The overlay page never calls the API except `GET /api/public/channel/:login`.

## 3. Security controls (SRS §11.1, §5.10, §5.11, §5.13)

| Threat | Control |
|---|---|
| Forged webhook | HMAC-SHA256 over ID + timestamp + raw body; `crypto.subtle.verify` (constant time) |
| Replayed webhook | 10-minute timestamp window; dedupe by message ID |
| Join-code guessing | 6 random digits from `crypto.getRandomValues`; constant-time compare; 429 after 5 failed attempts per IP per minute counted in room SQLite (FR-22), with `JOIN_LIMITER` as an outer guard; codes die when the drill ends |
| Overlay key leak | Overlay gets only redacted data; **Rotate key** issues a new 32-character key and closes old overlay sockets |
| Session theft or fixation | `__Host-` cookies, HttpOnly, Secure, SameSite=Lax, 7-day expiry, `session_epoch` for global sign-out |
| CSRF | SameSite=Lax + `Content-Type: application/json` + `Origin` must equal `PUBLIC_BASE_URL` on writes (else 403 `bad_origin`) |
| XSS | React escaping; no `dangerouslySetInnerHTML`; CSP; chat text never rendered as HTML; links never anchors |
| Token theft | AES-256-GCM sealed (`v1.<iv>.<ct>`), user ID as AAD, key in Workers secrets, never logged |
| Mod privilege escalation | Mod sockets can only send `mod.action`; streamer routes need the streamer session |
| Demo abuse | 5 rooms a minute per IP; demo rooms never call Twitch; self-delete after 2 idle hours |
| Unwanted chat posting | No code path posts to chat except the FR-41 constant |
| Over-broad AutoMod changes | The AutoMod update endpoint is never called |
| Stray room creation | Rooms answer `ignored` or 404 until bootstrapped; the Worker 404s `/ws/ch/:id` for unknown channels |

**Security headers** (`app/public/_headers`, SRS §9.6): CSP `default-src 'self'; connect-src 'self'; img-src 'self' data: https://static-cdn.jtvnw.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'self'; frame-ancestors 'none'`, plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. Whether `connect-src 'self'` covers same-origin `wss:` in Safari is `[verify]`.

**Secrets:** never in the repository; `secrets.required` lists every secret so a deploy without them fails (NFR-12).

## 4. Data minimisation (SRS §11.2)

- Chat is stored only for the false-ban check: message ID, chatter ID and login, text, tokens, time.
- Chat lines appear in the console only as the rejected-term example and the step 1 sample, both blurred until hovered.
- Nothing about chat leaves the room except those console views. Logs never contain tokens, chat text or attack text.

## 5. Retention (SRS §7.6)

| Data | Store | Kept | Deleted by |
|---|---|---|---|
| User profile, sealed tokens | D1 | Until sign-out or revoke | FR-04, FR-12 |
| App token | D1 | Rotated before expiry | Overwrite |
| Chat log | Room | 7 days (`CHAT_LOG_RETENTION_DAYS`) | `chatlog.purge`, hourly cron, Delete button, sign-out |
| Drills and everything under them | Room | 30 days or until sign-out | Daily purge, sign-out |
| Audit log, report summaries | D1 | Until sign-out | FR-04 |
| Report exports | R2 | Until sign-out | FR-04 |
| Demo rooms | Room | 2 hours after last activity | `room.gc` |
| Join-attempt counters | Room | 2 minutes | `chatlog.purge` and each join |
| Ticket nonces | Room | Until expiry (60 s) | `chatlog.purge` |
| Logs | Workers Logs | Platform retention | Platform |

## 6. Deletion flows (SRS §11.3, FR-04, FR-12)

| Trigger | Deletes |
|---|---|
| **Delete chat log** | Room `chat_log` immediately |
| **Sign out and delete my data** | Revoke tokens at Twitch; delete EventSub subscriptions; room `destroy()`; D1 user, tokens, channel, subscriptions, audit, summaries; R2 `reports/<id>/`; clear cookies |
| Revoke on Twitch (P1) | Same as sign-out without the Twitch revoke call, within a minute |
| Retention | Chat older than 7 days; drills older than 30 days; idle demo rooms after 2 hours |

Deletions complete within 60 s (NFR-13). `deletion.test.ts` asserts nothing remains after logout.

## 7. Audit log (FR-45)

Every push, undo, sign-in, sign-out, revoke, chat-log deletion and overlay-key rotation in a live room writes a row to D1 `audit_log`. Demo rooms never write to D1.
