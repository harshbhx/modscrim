# Glossary

[Docs](README.md) / Glossary

> The words ModScrim uses, in plain language. The complete version, with ID prefixes for requirements and tickets, is [`for-agents/glossary.md`](for-agents/glossary.md).

## Drill vocabulary

| Term | Meaning |
|---|---|
| Streamer, broadcaster | The owner of the Twitch channel |
| Mod | A volunteer moderator of the channel |
| Drill | One practice session: a wave of lines played into the practice chat |
| Practice chat | The sandboxed chat the app shows. Never posted to Twitch |
| Wave A | The drill wave: 14 attack lines and 8 banter lines by default |
| Wave B, fresh wave | 30 attack lines from a new seed and tricks the rule finder never saw |
| Attack line | A generated scam, spam, bot or placeholder-hate line mods should remove |
| Banter line | A harmless line from a curated pool of 40 that mods should leave alone |
| Tactic | An attack family: `linkscam`, `spam`, `botwave` or `hateraid` |
| Trick | A transformation that helps a line evade filters: plain, caps, leet, stretch, emoji, spaced, dotted, zero-width, look-alike |
| Caught | A mod acted on an attack line |
| Slipped | An attack line no mod removed within the slip window (9 s by default) |
| False ban, foul | A mod acted on a banter line |
| Kai (sim) | The simulated co-mod. Deterministic from the seed, always labelled "(sim)", scored separately |
| Join code | Six random digits that let a mod join the current drill |
| Overlay | The viewer-safe page loaded in OBS. It receives only redacted data |
| Overlay key | The 32 random characters in the overlay URL. Can be rotated |
| Reveal | After a drill, each line's kind, tactic and trick; for the console and mods only |
| After-action report | The per-drill summary of scores, grades, rules, proof and pushes |
| Report card | The numbers-only part of the report, safe for overlays and share links |
| Demo room | A temporary room with fixtures, usable without a Twitch account |

## Twitch and grading

| Term | Meaning |
|---|---|
| Blocked terms | The channel's banned words and phrases on Twitch. Apps see only the public ones |
| AutoMod | Twitch's automatic filter. ModScrim reads it and never changes it |
| Check AutoMod Status | The Twitch API that says whether a message would be allowed by the channel's current settings and terms |
| EventSub | Twitch's event system. ModScrim receives chat through EventSub webhooks |
| Helix | Twitch's REST API |
| Engine | Who produced a grade: `twitch` (Check AutoMod Status) or `local` (ModScrim's own matcher) |
| Local estimate | A grade from the local matcher. Always labelled |
| Rule finder | The code that proposes up to six blocked terms from lines that got past the filters |
| Clean set | The channel's chat from the last 7 days (up to 20,000 lines) plus the banter pool. A proposed term must match none of it |
| Rejected term | A candidate that catches attacks but also matches a clean line, shown with that line |
| Needs a bot rule | A trick no blocked term can express, such as spaced letters or look-alike characters |
| Push | Adding approved terms to the channel's blocked terms on Twitch |
| Preexisting | A pushed term that already existed on Twitch. Undo leaves it alone |
| Undo | Removing every term a drill's push added |

## Technical

| Term | Meaning |
|---|---|
| `ChannelRoom` | The Durable Object that owns one channel or demo room. Live rooms are `ch:<broadcasterId>`, demo rooms `demo:<uuid>` |
| Phase | A grading pass: `A`, `B-before` or `B-after` |
| Ticket | A short-lived, single-use signed token that authorises one WebSocket connection |
| Participant token | A signed token that lets a mod reconnect after a refresh |
| Sealed | Encrypted with AES-256-GCM and bound to the owner's user ID |
| Session epoch | A counter in D1; bumping it signs a user out everywhere |
| Hibernation | The Durable Object mode where idle sockets stay open while the object sleeps |
| Seed | The number that makes a wave reproducible: the same seed gives the same wave |
| `@mfd/core` | The pure TypeScript engine package in `packages/core` |

## Design words

| Term | Meaning |
|---|---|
| Wall green, dugout, chalk | The dark and light grounds of the brand: `#123D2E`, `#0B2A1F` and `#EEF1E8` |
| Whistle orange | The one action colour, `#FF6A1F` |
| Card yellow | The label colour for anything that is practice, `#FFD23F` |
| Plate | A hung number plate on the scoreboard |

**Next:** [FAQ](faq.md) | [Design system](design-system.md) | [How it works](how-it-works.md)
