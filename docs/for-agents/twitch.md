# Twitch integration

A digest of SRS §6 and the Twitch parts of §2.4, §4 and §5. Anything marked `[verify]` is unconfirmed: test it on the test channel and record the result in `docs/LOG.md` (see `open-questions.md`).

## 1. Application setup (SRS §6.1)

1. Twitch developer console → new application. Category: Application Integration. Client type: **Confidential**.
2. OAuth redirect URLs: `https://mod-fire-drill.<account>.workers.dev/auth/callback` and `http://localhost:5173/auth/callback`.
3. Client ID → `TWITCH_CLIENT_ID` var (public). Client secret → `TWITCH_CLIENT_SECRET` secret.
4. EventSub secret: 10 to 100 ASCII characters (`openssl rand -hex 24`) → `EVENTSUB_SECRET`.

## 2. Tokens and scopes (SRS §6.2)

| Token | Obtained by | Used for | Scopes |
|---|---|---|---|
| Broadcaster user token | Authorization code flow at sign-in | Blocked terms, AutoMod settings, Check AutoMod Status, Get Moderators, Send Chat Message (P2) | `moderator:read:blocked_terms`, `moderator:manage:blocked_terms`, `moderator:read:automod_settings`, `moderation:read`, `user:read:chat`, `user:bot`, `channel:bot`; add `user:write:chat` only if FR-41 is on |
| App access token | Client credentials grant; cached sealed in D1 `app_state` until 5 min before expiry | Create, list, delete EventSub webhook subscriptions | None |
| Mod user token (P1) | Authorization code flow, no scopes | Identity only via `/oauth2/validate`, then discarded | None |

- `user:bot` and `channel:bot` let the app token subscribe to `channel.chat.message` over webhooks with the broadcaster as the chatting user `[verify on first sign-in]` (A-03).
- Tokens are sealed with AES-256-GCM using the user ID as additional data (SRS §5.10). Refresh when within 5 min of expiry or after a 401, one refresh in flight per room (FR-02). Store the new refresh token if it changes.
- Validate every stored user token hourly with `GET https://id.twitch.tv/oauth2/validate` (Twitch requires it; FR-03).

## 3. Endpoints (SRS §6.3)

All Helix calls send `Authorization: Bearer <token>` and `Client-Id`; JSON bodies send `Content-Type: application/json`.

| Purpose | Call | Token |
|---|---|---|
| Authorize | `GET https://id.twitch.tv/oauth2/authorize?client_id&redirect_uri&response_type=code&scope&state` | — |
| Exchange code | `POST https://id.twitch.tv/oauth2/token` (form, `grant_type=authorization_code`) | — |
| Refresh | `POST https://id.twitch.tv/oauth2/token` (form, `grant_type=refresh_token`) | — |
| App token | `POST https://id.twitch.tv/oauth2/token` (form, `grant_type=client_credentials`) | — |
| Validate | `GET https://id.twitch.tv/oauth2/validate` with `Authorization: OAuth <token>` | user |
| Revoke | `POST https://id.twitch.tv/oauth2/revoke` (form `client_id`, `token`) | user |
| Who is this | `GET /helix/users` | user |
| Read blocked terms | `GET /helix/moderation/blocked_terms?broadcaster_id&moderator_id&first=100&after` | broadcaster |
| Add blocked term | `POST /helix/moderation/blocked_terms?broadcaster_id&moderator_id`, body `{"text": "…"}` | broadcaster |
| Remove blocked term | `DELETE /helix/moderation/blocked_terms?broadcaster_id&moderator_id&id` | broadcaster |
| AutoMod settings | `GET /helix/moderation/automod/settings?broadcaster_id&moderator_id` | broadcaster |
| Grade lines | `POST /helix/moderation/enforcements/status?broadcaster_id`, body `{"data":[{"msg_id","msg_text"}]}` | broadcaster's own |
| Is a moderator (P1) | `GET /helix/moderation/moderators?broadcaster_id&user_id` | broadcaster |
| Subscriptions | `POST` / `GET ?type&after` / `DELETE ?id` on `/helix/eventsub/subscriptions` | app |
| Announce (P2) | `POST /helix/chat/messages` body `{ broadcaster_id, sender_id, message }` | broadcaster |

Hard rules:
- **Never call the AutoMod settings update endpoint**: it overwrites every field.
- Get Blocked Terms returns only **public** terms. Private terms are invisible to apps; the console says so.
- `moderator_id` is always the broadcaster.
- Adding an existing term returns it. Treat "already exists" as `preexisting`, not as failure.

## 4. EventSub webhooks (SRS §6.4)

**Subscriptions**

```json
{ "type": "channel.chat.message", "version": "1",
  "condition": { "broadcaster_user_id": "<B>", "user_id": "<B>" },
  "transport": { "method": "webhook", "callback": "<PUBLIC_BASE_URL>/eventsub", "secret": "<EVENTSUB_SECRET>" } }
```

One per channel, created with the app token after sign-in, recorded in D1. A 409 means "exists": reconcile by listing (FR-08). The hourly cron re-creates any that are not `enabled` (FR-11, P1).

```json
{ "type": "user.authorization.revoke", "version": "1",
  "condition": { "client_id": "<TWITCH_CLIENT_ID>" },
  "transport": { "method": "webhook", "callback": "<PUBLIC_BASE_URL>/eventsub", "secret": "<EVENTSUB_SECRET>" } }
```

Once per deployment (P1, `[verify]` availability, A-04), via `npm run subscribe-revoke`.

**Message handling**

| `Twitch-Eventsub-Message-Type` | Response | Action |
|---|---|---|
| `webhook_callback_verification` | 200, `text/plain`, body = raw `challenge` | Mark subscription `enabled` in D1 |
| `notification` | 204 after the room accepts; **500 if the room call fails** (Twitch retries) | Route by `subscription.type` |
| `revocation` | 204 | Store status: `user_removed`, `authorization_revoked`, `notification_failures_exceeded`, `version_removed` |

**Verification (SRS §5.11, normative code).** HMAC-SHA256 over `message_id + timestamp + raw_body` with `EVENTSUB_SECRET`, compared to `sha256=<hex>` using `crypto.subtle.verify` (constant time). Verify **before** `JSON.parse`. Reject timestamps more than 10 minutes off (the timestamp is RFC 3339 with nanoseconds; trim to milliseconds before parsing). Bad signature → 403, touch no room.

**Delivery** is at least once: the room dedupes by message ID. Answer within a few seconds; slow answers lead to revocation with `notification_failures_exceeded`. Target p95 under 500 ms (NFR-05).

**Headers used:** `Twitch-Eventsub-Message-Id`, `-Retry`, `-Type`, `-Signature`, `-Timestamp`, `Twitch-Eventsub-Subscription-Type`, `-Version`.

**Chat event fields used:** `broadcaster_user_id`, `chatter_user_id`, `chatter_user_login`, `message_id`, `message.text`, `message_type`, `source_broadcaster_user_id`.

**Ingest rules (FR-10):** store message ID, chatter ID, login, text, pre-computed tokens, time. Ignore duplicates; ignore shared-chat messages whose `source_broadcaster_user_id` is set and differs from the channel; ignore the app's own announcement text; skip while logging is paused.

## 5. Rate limits and grading (SRS §5.12, §6.5, FR-28)

- **Helix** uses a token bucket per client ID and user. Read `Ratelimit-Remaining` and `Ratelimit-Reset` on every response; on 429 wait until the reset.
- **Check AutoMod Status** has an extra per-channel limit, chosen by broadcaster type from Get Users (FR-07):

| Broadcaster type | Per minute | Per hour |
|---|---|---|
| `''` (normal) | 5 | 50 |
| `affiliate` | 10 | 100 |
| `partner` | 30 | 300 |

- The remaining per-channel quota is **not** reported in headers; a 429 is the only signal `[verify]`. Whether a "check" is a request or a line is unknown until day 0 → `GRADING_QUOTA_UNIT` (`request` or `line`). Batch size is `GRADING_BATCH_SIZE` (100 assumed `[verify]`).
- The pace (`nextAllowedAt`) counts units over sliding minute and hour windows from `grade_sends`, adds a 250 ms margin, and honours a block: after a 429, `blockedUntil = now + 60 s`, or `Ratelimit-Reset × 1000` when `Ratelimit-Remaining` is 0 (that is the general Helix bucket).
- Grading defers while a drill is running, refreshes once on 401, and stores every result with engine `twitch`.
- Check AutoMod Status also applies AutoMod categories and **permitted** terms, which the local matcher does not model, so the engines can disagree. Every number shows its engine label: "graded by Twitch" or "local estimate".
- **Local fallback (FR-29):** demo rooms, no valid token, `GRADING_ENGINE=local`, or the streamer presses **Use local estimate now** → `blockedBy(currentTerms, text)`, engine `local`.

## 6. Push and undo (FR-34, FR-35)

1. Re-read blocked terms immediately before pushing.
2. Call Add Blocked Term once per term, **sequentially**; store the returned term ID.
3. Mark a term `preexisting` if its text (case-insensitive) is in the fresh list, or Twitch returns a `created_at` more than 60 s before the push started.
4. `added` or `preexisting` → no-op on re-push; `failed` or `removed` → push again.
5. Broadcast `push.result` per term; write an audit row to D1.
6. Undo removes every term this drill added that is not `preexisting` and not already removed.
7. Demo rooms edit their own `blocked_terms` table (IDs `demo-<n>`) and never call Twitch.

The room re-checks at push time that every term has 0 real-chat matches; otherwise 409 (FR-33).

## 7. Testing without a stream (SRS §6.7)

```bash
twitch configure
twitch token -u -s "<scopes>"                    # user token for the day-0 test
twitch event verify-subscription channel.chat.message -F http://localhost:5173/eventsub -s $EVENTSUB_SECRET   # [verify] CLI support
twitch event trigger channel.chat.message -F http://localhost:5173/eventsub -s $EVENTSUB_SECRET              # [verify]
twitch mock-api start                            # Helix mocks
```

- The mock Check AutoMod Status returns random results: **never use it for numbers**.
- Live checks need the real test channel and a second Twitch account as the mod.

## 8. Policy (SRS §6.6, PRD S-12)

- Never send attack text to Twitch chat; the Developer Agreement forbids spam bots.
- Keep chat only as long as needed (7 days); never build a public chat database; honour deletion; delete everything on sign-out or revoke.
- `.invalid` links, placeholder slurs, no published evasion lists.
