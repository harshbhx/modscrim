![ModScrim: raid drills for your mod team](https://raw.githubusercontent.com/harshbhx/modscrim/main/docs/assets/gifs/intro.gif)

**Your mods have never practised a raid. Now they can.** ModScrim runs fire drills for a Twitch channel's moderators: a private practice chat floods with spam built to slip past *this channel's own* filters, the mods race to clear it, Twitch grades the filters, and the fixes are proven before the streamer pushes them with one click. Try a full drill in about a minute in the [no-account demo](https://app.modscrim.dualmindlab.tech/demo).

## Inspiration

Twitch mod teams are volunteers, and **the only practice most of them get is a real raid**, with real harm and an audience watching. Streamers tune their filters by guesswork: a new blocked term might ban a regular, and nobody can see that risk until the term is live.

![A blocked term catches "free nitro" but the same scam with number swaps, stretched letters or spaced letters slips past](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/problem.png)

We started from the research, not from a hunch:

- **Mods learn on the job.** In [a survey of 1,053 active Twitch moderators](https://joseph.seering.org/papers/Seering_and_Kairam_2023_Who_Moderates_Twitch_What_Do_They_Do.pdf) (Seering and Kairam, 2023), about 12% had trained another mod in the past month, and most learn from streamers (76%) and other mods (69%) rather than Twitch's tutorials (49%).
- **Filters leak both ways.** [An audit of AutoMod with test accounts](https://arxiv.org/abs/2506.07667) let through up to 94% of hateful messages on some test sets and blocked up to 89.5% of harmless messages that used sensitive words; spacing and punctuation changes lowered what it caught.
- **Raids are coordinated, and bots adapt.** [A study of hate raids on Twitch](https://arxiv.org/abs/2305.16248) describes real-time attacks run by people and bots together, and [volunteer mods report spam bots](https://gaminghq.eu/2026/05/09/twitch-communities-struggle-with-spam-bots-and-fake-view-activity/) that reword and respace messages to dodge filters. That is exactly the behaviour ModScrim's drill imitates.

Schools run fire drills because nobody is in danger. We wanted the same for chat: **a fake raid, real filters, real feedback.** Every source we used is listed, with a note on why it matters, in [`docs/references.md`](https://github.com/harshbhx/modscrim/blob/main/docs/references.md).

## What it does

![Drill, Grade, Fix: the seven steps of a drill](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/drill-grade-fix.png)

### Drill

ModScrim reads the channel's public blocked terms and AutoMod levels. The streamer picks tactics, speed and a slip window, and shares a mod link with a six-digit code. The practice chat fills with attacks aimed at those exact filters, mixed with harmless banter. The tricks (spacing, dotted letters, number swaps, stretched letters, look-alike letters, emoji inside words, zero-width characters) live in [`tricks.ts`](https://github.com/harshbhx/modscrim/blob/main/packages/core/src/tricks.ts):

```text
blocked term:  free nitro
plain:         free nitro for the first 50 -> nitrodrop.invalid      BLOCKED
number swap:   fr33 nitro for the first 50 -> nitrodrop.invalid      SLIPPED
spaced:        f r e e nitro, claim yours at freebits[.]invalid       SLIPPED (needs a bot rule)
```

Mods delete, time out or ban from any device (**D**, **T**, **B** on the keyboard, [tested here](https://github.com/harshbhx/modscrim/blob/main/app/e2e/mod.keyboard.spec.ts)). The first action wins, a line nobody touches slips through, and banning a harmless regular counts as a foul. The streamer watches every move live, and an OBS overlay shows viewers the drill as blurred bars, never readable attacks.

### Grade

Every attack line goes to Twitch's [Check AutoMod Status](https://dev.twitch.tv/docs/api/reference), so the score comes from Twitch, not from us. The [rule finder](https://github.com/harshbhx/modscrim/blob/main/packages/core/src/ruleFinder.ts) then proposes up to six blocked terms that catch what got past, and rejects any term that would match the last 7 days of the channel's real chat or a harmless banter line.

### Fix

The proposed terms are tested on **a fresh wave of 30 attacks** ([`waves.ts`](https://github.com/harshbhx/modscrim/blob/main/packages/core/src/waves.ts)), built from a new seed with tricks the rule finder never saw. Push stays disabled unless real-chat matches are zero. The streamer approves, ModScrim adds the terms on Twitch, and **Undo removes exactly the terms that drill added**. An after-action report keeps per-mod scores, grades and results.

### What makes it different

Live bots and AutoMod act *during* a raid, and [Twitch's AutoMod testing tool](https://gaming-careers.pages.dev/newsletters/twitch-gets-smart-about-moderation-three-new-tools) checks one typed phrase at a time. ModScrim is the rehearsal and the filter test that come *before* a raid: it trains the team, aims attacks at the channel's own filters, has Twitch grade them, and proves the fix on real chat. It never acts on real chat itself.

## How we built it

### With OpenAI Codex, from a written brief

We treated Codex as a teammate that needs a precise brief, so we wrote the brief first:

1. **Specs first.** The [PRD](https://github.com/harshbhx/modscrim/blob/main/docs/for-agents/PRD.md) sets scope, copy and safety; the [SRS](https://github.com/harshbhx/modscrim/blob/main/docs/for-agents/SRS.md) sets the architecture, data, interfaces, algorithms and tests.
2. **Rules for the agent.** [`AGENTS.md`](https://github.com/harshbhx/modscrim/blob/main/AGENTS.md) tells Codex which spec wins, which safety rules it must never break, and that it may not add a feature, endpoint, dependency or table the specs do not list.
3. **Tickets, tests first.** Work was split into [numbered tickets](https://github.com/harshbhx/modscrim/blob/main/docs/for-agents/build-plan.md), each a [GitHub issue](https://github.com/harshbhx/modscrim/issues?q=is%3Aissue). Codex wrote the tests the SRS names, watched them fail, then implemented; `npm test` and `npm run typecheck` had to pass.
4. **Humans decide.** We reviewed every change against the safety rules, tested it, and kept a dated trail of decisions and test evidence in [`docs/LOG.md`](https://github.com/harshbhx/modscrim/blob/main/docs/LOG.md).

### On Twitch

- **[OAuth](https://github.com/harshbhx/modscrim/blob/main/app/worker/twitch/oauth.ts)** sign-in, with tokens [sealed with AES-256-GCM](https://github.com/harshbhx/modscrim/blob/main/app/worker/auth/crypto.ts); they never leave the server, and [validating them hourly](https://dev.twitch.tv/docs/authentication/validate-tokens/) keeps them honest.
- **Get Blocked Terms** and **Get AutoMod Settings** ([moderation guide](https://dev.twitch.tv/docs/api/moderation)) to aim the drill. AutoMod is read-only: we never call its update endpoint.
- **Check AutoMod Status** to grade, paced to the [per-channel limits Twitch announced](https://discuss.dev.twitch.com/t/upcoming-changes-to-the-check-automod-status-api-endpoint/38512).
- **Add / Remove Blocked Term** for push and undo, only after the streamer approves. All Helix calls are in [`helix.ts`](https://github.com/harshbhx/modscrim/blob/main/app/worker/twitch/helix.ts).
- **EventSub webhooks** for the 7-day chat log, with every signature [checked on the raw body before it is read](https://github.com/harshbhx/modscrim/blob/main/app/worker/twitch/verify.ts), as [Twitch's webhook rules](https://dev.twitch.tv/docs/eventsub/handling-webhook-events) require.

### On Cloudflare

![Architecture: clients, one Cloudflare Worker with the ChannelRoom Durable Object, D1, Queue and R2, and Twitch OAuth, Helix and EventSub](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/architecture.png)

One **Worker** serves the Hono API and the React app. Each channel gets one **[Durable Object](https://github.com/harshbhx/modscrim/blob/main/app/worker/room/ChannelRoom.ts)** with its own [SQLite database](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) that owns the drill clock, the [hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) for the console, mods and overlay, the chat log, grades and reports. **D1** holds users and sealed tokens; a **Queue** and **R2** carry report exports. The [engine](https://github.com/harshbhx/modscrim/tree/main/packages/core/src) is pure TypeScript with a [seeded random generator](https://github.com/harshbhx/modscrim/blob/main/packages/core/src/prng.ts): **no AI runs at runtime**, and the same seed always builds the same drill.

## Challenges we ran into

- **Twitch said "slow down" while our counter said "go".** Grading once sat at "0 of 14 checked" ([issue #249](https://github.com/harshbhx/modscrim/issues/249)): we sent a whole phase in one request, but Twitch counts its limit per line. For a normal channel that limit is 5 lines a minute, so grading the 14 attack lines of a drill takes

$$t = \left\lceil \frac{14 \text{ lines}}{5 \text{ lines/min}} \right\rceil = 3 \text{ min}$$

We now [pace requests by line](https://github.com/harshbhx/modscrim/pull/247), tell the streamer when the next batch goes, and [fall back to a labelled local estimate](https://github.com/harshbhx/modscrim/pull/248) if Twitch keeps refusing.

- **One alarm per Durable Object.** [Cloudflare gives each object one alarm](https://developers.cloudflare.com/durable-objects/api/alarms/), and it can fire twice. A drill needs a line clock, grading ticks, reports and clean-up, so every job runs through [one schedule table](https://github.com/harshbhx/modscrim/blob/main/app/worker/room/scheduler.ts) and is safe to run twice.
- **Redaction had to be structural.** "Never show attack text on stream" is easy to break by accident, so overlays only ever get a [`RedactedLine` of `{ lineId, user, len }`](https://github.com/harshbhx/modscrim/blob/main/packages/core/src/protocol.ts), and [a test checks every overlay frame of a full drill](https://github.com/harshbhx/modscrim/blob/main/app/test/safety.overlay.test.ts).
- **Proving a rule without flattering it.** Testing terms on the lines they were learned from would overstate them, so [the proof](https://github.com/harshbhx/modscrim/blob/main/packages/core/src/proof.ts) uses a held-out wave.

## Accomplishments that we're proud of

- **It works on a real channel.** A drill on our own channel was graded 14 of 14 lines by Twitch, [recorded in our log](https://github.com/harshbhx/modscrim/blob/main/docs/LOG.md).
- **Anyone can try it in a minute** in the [no-account demo](https://app.modscrim.dualmindlab.tech/demo), which never calls Twitch.
- **Safety is code, not a promise.** Every generated link ends in `.invalid` ([test](https://github.com/harshbhx/modscrim/blob/main/app/e2e/safety.links.spec.ts)), slurs exist only as placeholders drawn as blocks ([test](https://github.com/harshbhx/modscrim/blob/main/app/e2e/safety.slurs.spec.ts)), no token ever reaches the browser ([test](https://github.com/harshbhx/modscrim/blob/main/app/e2e/safety.tokens.spec.ts)), nothing reaches Twitch without approval, and every push can be undone.
- **119 tests** in `npm test` ([engine](https://github.com/harshbhx/modscrim/tree/main/packages/core/test) and [Worker with the Durable Object](https://github.com/harshbhx/modscrim/tree/main/app/test)), plus [Playwright runs of the full demo loop and the safety checks against the live app](https://github.com/harshbhx/modscrim/actions/workflows/e2e.yml) on every push to main.
- **A deterministic engine:** any drill can be replayed exactly from its seed.

## What we learned

- **Specs are the best prompt.** A precise PRD, SRS and `AGENTS.md` kept Codex in scope and turned every review into a check against something written down.
- **Tests first matters most for safety rules.** Redaction, `.invalid` links and undo should be proven, not remembered.
- **Honest labels build trust.** "Local estimate" and "needs a bot rule" help a streamer more than a confident wrong number. Some tricks, like spaced letters or zero-width characters, cannot be written as blocked terms at all, and ModScrim says so.
- **What we have not measured yet:** the full comparison of Twitch's grading against our local engine on a test channel is still to run, so we make no claim of measured improvement on a real channel. Our [known limits](https://github.com/harshbhx/modscrim#roadmap-and-known-limits) are written down.

## What's next for ModScrim

- **Run drills with real mod teams** and learn whether they would schedule them without a hackathon reason.
- **Rules suggested per tactic**, not only per drill, and future waves aimed at the tricks a team misses most.
- **A Twitch Extension**, once there is time for Twitch's 5 to 14 day review.
- **A path to a product:** who might pay, tiers and risks are sketched in [`docs/business.md`](https://github.com/harshbhx/modscrim/blob/main/docs/business.md).

![ModScrim](https://raw.githubusercontent.com/harshbhx/modscrim/main/docs/assets/gifs/outro.gif)

Your mods should not meet their first raid live on stream. With ModScrim they meet it in a practice chat nobody else can see, Twitch tells you which filters held, and the fix is proven, approved and one click from undone. Built by **Harsh Bhanushali** and **Dhairya Patel** with OpenAI Codex.

**Blow the whistle before the raiders do.**
