![ModScrim: raid drills for your mod team](https://raw.githubusercontent.com/harshbhx/modscrim/main/docs/assets/gifs/intro.gif)

## Your mods have never practised a raid. Now they can.

**ModScrim runs fire drills for a Twitch channel's moderators.** A private practice chat floods with spam built to slip past *this channel's own* blocked terms. The mods race to clear it. Then Twitch grades the filters, a rule finder proposes the blocked terms that close the gaps, the terms are proven on a fresh wave of spam they have never seen, and the streamer pushes them with one click and can undo with another.

Anyone can run a full drill in about a minute in the [no-account demo](https://app.modscrim.dualmindlab.tech/demo). It sends nothing to Twitch.

## The problem

![A blocked term catches "free nitro" but the same scam with number swaps, stretched letters or spaced letters slips past](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/problem.png)

Twitch mod teams are volunteers, and **the only practice most of them get is a real raid**, with real harm and an audience watching. Streamers tune their filters by guesswork: a new blocked term might ban a regular, and nobody can see that risk until the term is live.

- **Mods learn on the job.** In a survey of 1,053 Twitch moderators, about 12% had trained another mod in the past month. Mods learn mostly from streamers (76%) and other mods (69%), more than from Twitch's tutorials (49%). (Seering and Kairam, 2023)
- **Filters leak both ways.** An audit of AutoMod let through up to 94% of hateful messages on some test sets and blocked up to 89.5% of harmless messages that used sensitive words; spacing and punctuation changes lowered what it caught. (arXiv 2506.07667)

## How it works: Drill, Grade, Fix

![Drill, Grade, Fix: the seven steps of a drill](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/drill-grade-fix.png)

**Drill.** ModScrim reads the channel's public blocked terms and AutoMod levels. The streamer picks tactics, speed and a slip window, and shares a mod link with a six-digit code. The practice chat fills with attacks aimed at those filters, mixed with harmless banter. Mods delete, time out or ban from any device (**D**, **T**, **B** on the keyboard); the first action wins, and a line nobody touches slips through.

**Grade.** Every attack line goes to Twitch's Check AutoMod Status, so the score comes from Twitch, not from us. A rule finder then proposes up to six blocked terms that catch what got past, and rejects any term that would match the last 7 days of real chat or a harmless banter line.

**Fix.** The terms are tested on a fresh wave of 30 attacks, built from a new seed with tricks the rule finder never saw. Push stays disabled unless real-chat matches are zero. The streamer approves, ModScrim adds the terms on Twitch, and Undo removes exactly the terms that drill added.

**What makes it different:** live bots and AutoMod act *during* a raid. ModScrim is the rehearsal and the filter test that come *before* it, and it never acts on real chat.

## How it uses Twitch

![The Twitch calls ModScrim makes: read, grade, write with approval, listen](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/twitch.png)

- **Sign in** with Twitch OAuth; tokens are sealed and never leave the server.
- **Read** blocked terms and AutoMod settings. AutoMod is read-only: we never call its update endpoint.
- **Grade** with Check AutoMod Status, paced to Twitch's per-channel limits. If Twitch keeps refusing, the rest is graded locally and labelled "local estimate".
- **Push and undo** with Add and Remove Blocked Term, only after the streamer approves.
- **Listen** through EventSub webhooks for the 7-day chat log, with every signature checked before the body is read.

## How it runs on Cloudflare

![Architecture: clients, one Cloudflare Worker with the ChannelRoom Durable Object, D1, Queue and R2, and Twitch OAuth, Helix and EventSub](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/architecture.png)

One Worker serves the API and the React app. Each channel gets one **Durable Object** with its own SQLite database that owns the drill clock, the live WebSockets for the console, the mods and the OBS overlay, the chat log, the grades and the reports. D1 holds users and sealed tokens. The attack engine, rule finder and scoring are deterministic TypeScript: **no AI runs at runtime**, and the same seed always builds the same drill.

## How we built it with OpenAI Codex

![Specs first, rules in AGENTS.md, tickets, tests first, human review, a written log](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/built-with-codex.png)

We treated Codex as a teammate that needs a precise brief, so we wrote the brief first. A PRD and an SRS are the source of truth, and `AGENTS.md` tells Codex which spec wins, which safety rules it must never break, and that it may not add anything the specs do not list. Work was split into numbered tickets; Codex wrote the tests first, watched them fail, then implemented. We reviewed, tested and decided, and `docs/LOG.md` keeps the trail. Today `npm test` runs 119 tests, and Playwright runs the full demo loop and the safety checks against the live app.

## Safety

![Eight safety promises, each enforced in code](https://raw.githubusercontent.com/harshbhx/modscrim/devpost-media/docs/assets/devpost/safety-promises.png)

A fire drill should have no fire. Attack lines are never posted to Twitch chat. Every generated link ends in `.invalid`, and slurs exist only as placeholders drawn as blocks. Viewers on stream see the practice chat as blurred bars, never readable attacks. Nothing reaches Twitch without the streamer's approval, and every push can be undone.

## Challenges and what we learned

- **Twitch said "slow down" while our counter said "go".** Grading once sat at "0 of 14" because we sent a whole phase in one request and Twitch counts its limit per line. We now pace a few lines a minute and fall back to a labelled estimate when Twitch refuses; on our own channel the next drill graded 14 of 14 lines with Twitch.
- **One alarm per Durable Object.** A drill needs a line clock, grading, reports and clean-up, so every job runs through one schedule table and is safe to run twice.
- **Specs are the best prompt.** Clear rules kept Codex in scope and turned every review into a check against something written down.
- **Honest labels build trust.** "Local estimate" and "needs a bot rule" are more useful to a streamer than a confident wrong number.

## Honest scope

Demo rooms are fully simulated and grade with a local estimate. Twitch only shares a channel's public blocked terms. Some tricks, like spaced letters or zero-width characters, cannot be written as blocked terms, so ModScrim marks them "needs a bot rule". We have not yet run the full measurement on a test channel, so we make no claim of measured improvement on a real channel.

## Practise the raid before it is real

![ModScrim](https://raw.githubusercontent.com/harshbhx/modscrim/main/docs/assets/gifs/outro.gif)

Your mods should not meet their first raid live on stream. With ModScrim they meet it in a practice chat nobody else can see, Twitch tells you which filters held, and the fix is proven, approved and one click from undone.

Built by **Harsh Bhanushali** and **Dhairya Patel** with OpenAI Codex. ModScrim is an independent project and is not affiliated with or endorsed by Twitch.

**Blow the whistle before the raiders do.**
