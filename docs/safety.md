# Safety

[Docs](README.md) / Safety

> ModScrim writes fake attacks, so its safety rules are hard requirements, not preferences. This page lists each promise, where the code enforces it and which test checks it. The normative list is [`for-agents/safety-security-privacy.md`](for-agents/safety-security-privacy.md); AGENTS.md says a change that weakens any of these is not done.

## What ModScrim will never do

| Promise | How it is enforced |
|---|---|
| Practice only: generated attacks never reach real Twitch chat | The one chat-send path is a fixed announcement constant behind `ANNOUNCE_ENABLED`, which is `false` in [`app/wrangler.jsonc`](../app/wrangler.jsonc). The `user:write:chat` scope is requested only when that flag is `true` |
| Every generated link ends in `.invalid` | The link tricks in [`packages/core/src/tricks.ts`](../packages/core/src/tricks.ts) always append `.invalid`; the `safety.links` Playwright spec checks rendered lines |
| No real slurs | Only the placeholders `slurx` and `slury` exist, drawn as solid blocks. There is no real slur list in the repository |
| Banter never comes from real chat | Banter is drawn from a curated 40-line pool |
| The overlay never shows attack text | Overlay sockets get only `{ lineId, user, len }` per line, no reveal and no terms. The overlay message schema is strict, and `app/test/safety.overlay.test.ts` checks every overlay frame of a full drill |
| Reports carry numbers, not text | Report exports copy fields by name and never include attack text or the rejected-term example |
| AutoMod settings are never changed | The app only reads them. Twitch's update call replaces every setting at once, so it is never used |
| No term reaches Twitch without approval | Push runs only from **Approve and push**, and the room re-checks zero real-chat matches at push time |
| Every push can be undone | Undo removes the terms that drill added and skips terms that already existed |
| Tokens stay on the server | Tokens are sealed with AES-256-GCM, never sent to the browser and never logged |
| Hate raid is opt-in | The `hateraid` tactic is off by default and carries a content warning |
| Practice is always labelled | The practice chat carries the banner "Practice chat only. Nothing here is posted to Twitch." and the brand rules require a card-yellow Practice tag wherever attack text appears |

## Demo rooms

Demo rooms are named `demo:<uuid>` and never call Twitch, D1, R2 or the report queue. Creation is rate-limited per IP (`DEMO_LIMITER`, 5 a minute) and a room deletes all its storage after two hours of inactivity.

## What data is kept

| Data | Kept | Removed by |
|---|---|---|
| Public chat lines (for the false-ban check only) | 7 days | Daily and hourly purges, the **Delete chat log** button, sign-out |
| Drills and their lines | 30 days or until sign-out | Daily purge, sign-out |
| User profile and sealed tokens | Until sign-out or revoke | Sign-out, revoke |
| Audit log, report summaries | Until sign-out | Sign-out |
| Demo rooms | 2 hours after last activity | Room garbage collection |

The streamer can pause logging or delete the chat log at any time. **Sign out and delete my data** revokes the tokens at Twitch, removes the EventSub subscriptions and deletes the room, the database rows and any exported reports. Chat lines appear in the console only as the rejected-term example and a sample, both blurred until hovered. The public [privacy policy](https://modscrim.dualmindlab.tech/privacy) has the details.

## Security controls

| Threat | Control |
|---|---|
| Forged or replayed webhook | HMAC-SHA256 over message ID, timestamp and the raw body, checked in constant time before parsing; a 10-minute timestamp window; duplicates dropped by message ID |
| Join-code guessing | Six random digits, constant-time compare, throttled per IP, and the code dies when the drill ends |
| Overlay key leak | The overlay only ever gets redacted data, and **Rotate key** issues a new key and closes old sockets |
| Session theft or fixation | `__Host-` cookies, `HttpOnly`, `Secure`, `SameSite=Lax`, a 7-day expiry and a session epoch for global sign-out |
| CSRF | `SameSite=Lax`, JSON content type, and an `Origin` check against `PUBLIC_BASE_URL` on writes |
| XSS | React escaping, no `dangerouslySetInnerHTML`, a strict Content-Security-Policy ([`app/public/_headers`](../app/public/_headers)), and chat text never rendered as HTML or as a link |
| Secrets in git | CI fails if `.dev.vars` is tracked or a token-like string appears in a tracked file |

## Responsible use

ModScrim is not affiliated with or endorsed by Twitch, and it follows the Twitch Developer Agreement: no spam, no public chat database, deletion honoured. Its generated attacks stay inside a labelled practice chat, and evasion lists are never published or exported.

**Next:** [Architecture](architecture.md) | [Testing](testing.md) | [FAQ](faq.md)
