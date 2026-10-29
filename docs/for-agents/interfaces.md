# Interfaces

A digest of PRD §9.1 and SRS §8. Exact TypeScript types are in SRS §8.3 (`protocol.ts`), §8.4 (RPC) and §8.7 (`views.ts`); both the Worker and the SPA import them from `@mfd/core`.

## 1. SPA routes (PRD §9.1, SRS §9.1)

| Route | Who | Purpose |
|---|---|---|
| `/` | Everyone | Landing: pitch, Sign in with Twitch, Try the demo |
| `/console` | Streamer | Six-step stepper: Read filters → Configure → Run the drill → Twitch grades → Fix the rules → Fresh wave and push |
| `/mod/:channel` | Mods | Join, practice chat, results |
| `/overlay/:channel?key=…` | OBS | Viewer-safe overlay; calls only `GET /api/public/channel/:login` |
| `/demo` | Judges | Creates a demo room and opens its console |
| `/demo/:room` | Demo visitors | Console with `apiBase = /api/demo/:room` |
| `/demo/:room/mod` | Demo visitors | Mod view for a demo room |
| `/r/:reportId` | Anyone with the link (P1) | Read-only report card, numbers only |
| `/privacy` | Everyone | What is stored, for how long, how to delete it |

## 2. REST API (SRS §8.2)

All JSON. Errors: `{ "error": { "code", "message", "field"? } }`.

| Status | Code | When |
|---|---|---|
| 400 | `invalid` | Validation failed (field-level message) |
| 401 | `unauthenticated` | Missing, forged or expired session |
| 403 | `forbidden`, `bad_origin` | Wrong code or key; cross-origin write |
| 404 | `not_found` | Unknown resource, unshared report, unbootstrapped room |
| 409 | `conflict` | Wrong drill state; unsafe term at push |
| 429 | `rate_limited` | Limiter or failed-join counter |
| 502 | `twitch_error` | Twitch call failed |
| 503 | `room_unavailable` | Room call failed |

**Auth**

| Route | Auth | Result |
|---|---|---|
| GET `/auth/login` | — | 302 to Twitch; sets `__Host-mfd_oauth` |
| GET `/auth/callback` | OAuth cookie | 302 `/console`; sets `__Host-mfd_s` |
| POST `/auth/logout` | Session | 204; deletes everything (FR-04) |
| GET `/auth/mod/login?channel=` (P1) | — | 302 to Twitch, no scopes |
| GET `/auth/mod/callback` (P1) | OAuth cookie | 302 `/mod/:channel` with a participant token |

**Streamer** (session cookie; writes also need `Content-Type: application/json` and `Origin == PUBLIC_BASE_URL`)

| Route | Body | Response |
|---|---|---|
| GET `/api/me` | — | `{ user, channel, tokenStatus, subscriptionStatus, overlayUrl, modUrl }` |
| GET `/api/status` (P1) | — | `{ token, subscription, chatLog, quota }` |
| GET `/api/filters` · POST `/api/filters/refresh` | — | `FiltersView` |
| GET `/api/chatlog/stats` | — | `{ count, oldest, newest, logging, samples }` (latest 6) |
| POST `/api/chatlog/logging` | `{ on }` | `{ logging }` |
| DELETE `/api/chatlog` | — | `{ deleted }` |
| POST `/api/overlay/rotate` | — | `{ overlayUrl }` |
| POST `/api/overlay/settings` (P1) | `{ hideNames }` | `{ hideNames }` |
| POST `/api/subscription/repair` (P1) | — | `{ status }` |
| POST `/api/ws-ticket` | — | `{ ticket, wsUrl }` |
| POST `/api/drills` | `DrillConfigInput` | `{ drillId, joinCode, modUrl }`; existing draft if any |
| PATCH `/api/drills/:id` | `DrillConfigInput` | `DrillView`; 409 unless draft |
| POST `/api/drills/:id/cancel` · `/start` · `/stop` | — | `{ status }` · `{ startedAt }` · `{ endedAt }` |
| GET `/api/drills/:id` | — | `DrillView` |
| POST `/api/drills/:id/grade` | `{ phase }` | 202 `{ queued }` |
| POST `/api/drills/:id/grade/local` | `{ phase }` | `{ passed, total, engine: "local" }` |
| GET `/api/drills/:id/grades` | — | `GradesView` |
| POST `/api/drills/:id/rules` | — | `RuleFinderResult` |
| POST `/api/drills/:id/prove` | `{ terms }` | `ProofResult` |
| POST `/api/drills/:id/push` · `/undo` | `{ terms }` · — | `PushResult[]` |
| GET `/api/drills/:id/report` | — | `Report` |
| POST `/api/drills/:id/report/share` (P1) | `{ shared }` | `{ url? }` |
| GET `/api/audit` | — | Audit rows, newest first |

**Mods and public** (no session, rate-limited)

| Route | Body | Response |
|---|---|---|
| GET `/api/public/channel/:login` | — | `{ broadcasterId, displayName, avatarUrl, drillOpen }` |
| POST `/api/mod/:login/join` | `{ code, displayName }` | `{ participantId, participantToken, ticket, wsUrl }` |
| POST `/api/mod/ticket` | `{ participantToken }` | `{ ticket, wsUrl }` |
| GET `/api/public/reports/:reportId` (P1) | — | Shared report card or 404 |

**Demo**

| Route | Auth | Purpose |
|---|---|---|
| POST `/api/demo` | `DEMO_LIMITER` per IP | Create a room; sets `__Host-mfd_demo`; `{ room, joinCode, modUrl }` |
| `/api/demo/:room/...` | Demo cookie for that room | Streamer drill routes scoped to the demo room; push and undo simulated |
| POST `/api/demo/:room/mod/join` | Join code + failed-attempt limit | No cookie, so a phone can join from the QR code |
| POST `/api/demo/:room/mod/ticket` | Participant token | Reconnect |

**Webhook and sockets**

| Route | Auth |
|---|---|
| POST `/eventsub` | Twitch HMAC signature |
| GET `/ws/ch/:broadcasterId?ticket=…` or `?overlayKey=…` | Ticket or overlay key, checked by the room; Worker 404s unknown channels without waking a room |
| GET `/ws/demo/:room?ticket=…` | Ticket |

## 3. WebSocket protocol (SRS §8.3)

Every message is JSON `{ type, data }`, except the keepalive: clients send the text `ping` every 20 s; the runtime answers `pong` without waking the room.

**Server → client:** `hello`, `drill.state` (snapshot per role), `drill.started`, `drill.line`, `drill.action`, `drill.slipped`, `drill.score`, `drill.ended`, `action.rejected` (`taken | slipped | not_shown | ended | not_participant`), `participants`, `grade.progress`, `grade.done`, `push.result`, `report.ready`, `chat.stats`, `vote.update` (P2), `error`.

**Client → server:** `{ type: "mod.action", data: { lineId, action } }` (mods only) and `{ type: "sync" }`.

| Message | Console | Mods | Overlay |
|---|---|---|---|
| `hello`, `participants`, `error` | Yes | Yes | Yes |
| `drill.state` | Full | Full | Redacted |
| `drill.started`, `drill.action`, `drill.slipped`, `drill.score` | Yes | Yes | Yes |
| `drill.line` | Full text (`PublicLine`) | Full text | `RedactedLine` only |
| `drill.ended` | With reveal | With reveal | No reveal |
| `action.rejected` | No | Sender only | No |
| `grade.progress`, `grade.done`, `push.result`, `chat.stats` | Yes | No | No |
| `report.ready` | Card | No | Card (counts only) |
| `vote.update` (P2) | Yes | No | Yes |

**Redaction rule.** For overlays, `drill.line` carries `RedactedLine` with exactly `lineId`, `user` and `len` (rounded to 4); `drill.ended` has no `reveal`; `report.ready` carries only `ReportCard`; with `hideNames` on, names become "Mod 1", "Mod 2" in join order. `overlay.redaction.test.ts` enforces this for a full drill.

**Client behaviour (SRS §9.2).** Console and mods connect with a ticket; overlays with the key. A socket is dead after 45 s of silence. Reconnect backoff 1, 2, 4, 8, then 15 s plus up to 30% jitter, with a fresh ticket each time (tickets are single-use). Apply `drill.state` as the full truth after `hello`, later messages as deltas, and send `sync` if a delta mentions an unknown line.

## 4. `ChannelRoom` RPC surface (SRS §8.4)

`bootstrap`, `getFilters`, `refreshFilters`, `ingestChat`, `chatStats`, `setLogging`, `deleteChatLog`, `createDrill`, `updateDraft`, `cancelDraft`, `startDrill`, `stopDrill`, `getDrill`, `joinAsMod`, `issueTicket`, `requestGrading`, `gradeLocally`, `getGrades`, `findRules`, `proveFreshWave`, `push`, `undo`, `getReport`, `rotateOverlayKey`, `setOverlaySettings`, `validateToken`, `purge`, `destroy`. Plus `fetch` (WebSocket upgrade), `webSocketMessage`, `webSocketClose` and `alarm`.

## 5. Shared shapes (SRS §5.1, §7.4, §8.7)

| Type | File | Key fields |
|---|---|---|
| `WaveLine` | `types.ts` | `id = ${drillId}-${wave}-${idx}`, `kind`, `tactic`, `trick`, `linkTrick`, `tags`, `user`, `segments` (`text | link | slur`), `text` |
| `DrillConfig` | `types.ts` | `tactics`, `primaryTactic`, `attackCount` 14, `banterCount` 8, `intervalMs` 1500, `slipWindowMs` 9000, `seed`, `simMod` |
| `LineState`, `Participant`, `ModScore`, `DrillScore`, `Grade` | `types.ts` | `Grade.permitted = true` means it got past the filters |
| `DrillView` | `views.ts` | Console only: includes attack text |
| `DrillSnapshot` | `views.ts` | Per role; `reveal` only after end and never for overlays |
| `FiltersView`, `GradesView`, `PushResult`, `ReportCard` | `views.ts` | `ReportCard` holds numbers only |
| `JobKind`, `ActionResult`, `EventSubEnvelope`, `ChatMessageEvent` | `views.ts` | |
| `Report` | SRS §7.4 | `fpExample` (a real chat line) is console-only; exports and shares strip it |
| `ReportJob` | SRS §7.5 | `{ kind: 'report.export', roomName, drillId, reportId }` |

## 6. Validation (SRS §5.5)

| Schema | Rules |
|---|---|
| `DrillConfigInputZ` | 1 to 4 unique tactics; primary among them; attacks 6 to 30; banter 4 to 20; total ≤ 40; interval 800 to 3,000 ms; slip window 5,000 to 15,000 ms; seed uint32 optional; `simMod`, `chatVote` (P2), `announce` (P2) |
| `ClientMsgZ` | `mod.action` (`lineId` ≤ 80 chars, action `delete | timeout | ban`) or `sync` |
| `TermListZ` | 1 to 12 terms, each 2 to 500 characters |
| `JoinZ` | `code` exactly 6 digits; `displayName` 1 to 24 characters, trimmed |

## 7. Cookies and tokens (SRS §5.13)

| Name | Holds | Lifetime |
|---|---|---|
| `__Host-mfd_s` | Streamer session `{ uid, ep, exp }` | 7 days; rejected if `ep` ≠ D1 `session_epoch` |
| `__Host-mfd_demo` | `{ room, exp }` | 2 hours |
| `__Host-mfd_oauth` | OAuth `state` | 10 minutes |
| WebSocket ticket | `{ room, role, pid?, n, exp }` | 60 s, single use (nonce stored until expiry) |
| Participant token | `{ room, pid, exp }` | 12 hours; kept in `sessionStorage` |
| Overlay key | 32 random characters | Until rotated |

All cookies: `HttpOnly; Secure; SameSite=Lax; Path=/`. All tokens are `base64url(json).base64url(hmac)` signed with `SESSION_HMAC_KEY`.
