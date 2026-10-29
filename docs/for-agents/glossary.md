# Glossary

Merged from PRD §16 and SRS §1.4. ID prefixes are in `INDEX.md` §5.

## Domain

| Term | Meaning |
|---|---|
| Streamer, broadcaster | Owner of the Twitch channel |
| Mod | Volunteer moderator of the channel |
| Blocked terms | The channel's banned words and phrases on Twitch; 2 to 500 characters; `*` only at the start or end of a word. Apps see only public terms |
| AutoMod | Twitch's automatic filter with category levels 0 to 4. Read-only for this app |
| Check AutoMod Status | Twitch API that says whether each message would be permitted by the channel's current AutoMod settings and blocked (and permitted) terms |
| EventSub | Twitch's event system; this app receives chat through EventSub **webhooks** |
| Helix | Twitch's REST API |
| Drill | One practice session: a wave of lines played into the practice chat |
| Practice chat | The sandboxed chat the app shows; never posted to Twitch |
| Wave A | The drill wave: 14 attack lines and 8 banter lines by default, built from the training trick pools |
| Wave B, fresh wave, held-out wave | 30 attack lines from a new seed and held-out tricks the rule finder never saw |
| Attack line | A generated scam, spam, bot or placeholder-hate line mods should remove |
| Banter line | A harmless line from the curated 40-line pool mods should leave alone |
| Tactic | Attack family: `linkscam` (fake giveaway links), `spam` (follower and viewer spam), `botwave` (art and promo bots), `hateraid` (placeholder slurs, P2, off by default) |
| Primary tactic | The tactic that gets most lines (57% in wave A, 50% in wave B) |
| Trick | A transformation that helps an attack evade filters: `plain`, `caps`, `leet`, `stretch`, `emoji`, `spaced`, `dotted`, `zerowidth`, `lookalike` |
| Link trick | A transformation on the link: `plain`, `spaced`, `bracket`, `leet`, `dotword` |
| Needs a bot rule | A trick no blocked term can express: spaced, dotted, zero-width, emoji inside a word, look-alike letters, space in link, `[.]` in link, "dot" spelled out |
| Slipped | An attack line no mod removed within the slip window (default 9 s). Banter never slips |
| Got past the filters, passed | An attack line the engine says the current filters would permit (`is_permitted = true`) |
| False ban | A mod action on a banter line |
| Caught | A mod action on an attack line |
| Reaction time | `actedAt − shownAt`, both server timestamps |
| Rule finder | Code that proposes up to 6 blocked terms from lines that passed in phase A |
| Clean set | The channel's chat from the last 7 days (latest 20,000 lines at most) plus the banter pool; a proposed term must match none of it |
| Real-chat matches | How many clean-set lines a term matches; must be 0 to push |
| Rejected term | A candidate that covers attacks but also matches a clean-set line, shown with that line as its example |
| Push | Adding approved terms to the channel's real blocked terms on Twitch |
| Preexisting | A pushed term that already existed on Twitch; undo leaves it alone |
| Undo | Removing every term a drill's push added (not preexisting ones) |
| Kai (sim) | The simulated co-mod; deterministic from the seed; always labelled "(sim)"; scored separately |
| Join code | 6 random digits that let a mod join the current draft or running drill |
| Overlay | The viewer-safe page loaded in OBS as a browser source; receives only redacted data |
| Overlay key | 32 random characters in the overlay URL; rotatable |
| Reveal | After a drill, per-line kind, tactic and trick tags; console and mods only |
| After-action report | Per-drill summary: scores, grades, rules, proof, pushes |
| Report card | The numbers-only part of the report, safe for the overlay and share links |
| Demo room | A temporary channel room filled with fixtures (`pixelpanda_tv`), usable without a Twitch account |

## Technical

| Term | Meaning |
|---|---|
| Room, channel room | A `ChannelRoom` Durable Object. Live rooms are `ch:<broadcasterId>`, demo rooms `demo:<uuid>` |
| Phase | A grading pass: `A` (wave A vs current filters), `B-before` (wave B vs current filters), `B-after` (wave B after a push) |
| Engine | Who produced a grade: `twitch` (Check AutoMod Status) or `local` (our matcher). Aggregates can be `mixed` |
| Ticket | A short-lived (60 s), single-use, HMAC-signed token that authorises one WebSocket connection |
| Participant token | A signed `{ room, pid, exp }` valid 12 hours; lets a mod get new tickets after a refresh |
| Schedule, job | Rows in the room's `schedule` table multiplexed onto its single alarm |
| Quota unit | What Check AutoMod Status counts against the per-channel limit: one per `request` or per `line` (day 0 decides) |
| Sealed | Encrypted with AES-256-GCM in the form `v1.<iv>.<ciphertext>`, bound to the owner's user ID |
| Session epoch | A counter in D1 `users`; bumping it signs the user out everywhere |
| Hibernation | Durable Object WebSocket mode where idle sockets stay open while the object sleeps |
| `[verify]` | An unconfirmed Twitch or Cloudflare behaviour; see `open-questions.md` |
