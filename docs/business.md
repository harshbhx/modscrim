# How ModScrim could become a business

[Repository](../README.md) / [Docs](README.md) / Business plan

> ModScrim was built for a hackathon, but the problem it works on outlasts the event. This page is an honest first plan for turning it into a product: who has the problem, who might pay, what the tiers could be, what it costs to run, how it could reach people, and what could sink it.

> [!IMPORTANT]
> **Everything on this page is a hypothesis.** No price has been tested, no customer has paid, and the live day-0 run on a real Twitch channel is not yet recorded. Every number below is marked as an **estimate** or an **assumption**. Facts about the product come from the repository; outside facts link to their source. No market statistics are quoted, because none have been checked.

## Contents

[The problem](#the-problem) · [Who pays](#who-has-the-problem-and-who-might-pay) · [Why ModScrim](#why-modscrim-and-not-something-else) · [Tiers](#product-tiers) · [Pricing hypotheses](#pricing-hypotheses) · [Go-to-market](#go-to-market) · [Costs](#costs) · [Risks](#risks) · [What we must learn first](#what-we-must-learn-first) · [Milestones](#next-milestones)

## The problem

Twitch mod teams are volunteers who are rarely trained for the attacks they face, and streamers change their filters by guesswork, because nothing lets them test a filter against likely attacks or against their regulars' chat before the change goes live. The evidence the project rests on is in PRD §3.2 and on [Research and references](references.md):

- In a survey of 1,053 Twitch moderators, 26% had handled a targeted attack in the past month, and about 12% had trained another mod in that time ([Seering and Kairam, 2023](https://joseph.seering.org/papers/Seering_and_Kairam_2023_Who_Moderates_Twitch_What_Do_They_Do.pdf)).
- An audit of AutoMod let through up to 94% of hateful messages on some test sets, and spacing and punctuation changes lowered what it caught ([arXiv 2506.07667](https://arxiv.org/abs/2506.07667)).
- In 2026, volunteer mods describe spam bots that reword and respace messages to dodge filters ([GamingHQ, May 2026](https://gaminghq.eu/2026/05/09/twitch-communities-struggle-with-spam-bots-and-fake-view-activity/)).

> [!WARNING]
> **Demand for drills is not proven.** Mods in that 2026 article asked for faster ban syncing and better link detection, not for drills (PRD §3.5, open question Q-01). The business case therefore leans on the **filter loop** (grade, propose, prove, push, undo), which helps a streamer even if they never train their mods.

## Who has the problem and who might pay

| Segment | The job they need done | Would they pay? (assumption) |
|---|---|---|
| **Small and mid-size streamers** (the PRD persona: 50 to 2,000 viewers, 1 to 6 mods) | Filters that work without banning regulars; a team that is ready for a raid | Some would, at a low monthly price, once a drill has caught something real. Most will stay on the free tier. |
| **Mod teams** that moderate several channels | Practice without stakes, and recognition for good work | Mods rarely pay; they bring ModScrim to the streamers they mod for. They are the main **distribution** channel, not the buyer. |
| **Creator agencies and talent managers** | Consistent safety across a roster of channels, and evidence they can show a brand partner | Likely the best early buyer per account, if multi-channel reports save them time. |
| **Esports organisations and event broadcasters** | Rehearsing a high-profile stream before it goes live, with many mods across shifts | Plausible for paid one-off "pre-event drills" and team analytics. |
| **Platform and partner programmes** (for example a creator safety programme) | Helping their creators be raid-ready | A possible sponsor or licensing partner later. No conversation has happened; listed as an idea only. |

## Why ModScrim and not something else

From PRD §4.2 and §4.3, existing tools each cover part of the problem:

| Tool | What it does | What it does not do |
|---|---|---|
| AutoMod | Holds or blocks messages by category level | Train people, or show which attack variants get through |
| Twitch's AutoMod testing tool | Tests one typed phrase against the channel's settings | Generate attacks, batch-test, test a rule against real chat, train mods |
| Chat bots (Sery_bot, Fossabot, Nightbot) | Live moderation with link, spam and raid protection | Rehearsal, scoring, or proving rules on held-out attacks |

ModScrim is the one tool in that list that does all four together: attacks aimed at **this channel's own filters**, training and scoring **the channel's real mods**, **Twitch grading** the filters through its own API, and fixes **proven on a held-out wave** with **zero matches against the channel's real chat** before anything is pushed. Chat bots are partners rather than rivals: ModScrim already labels some tricks "needs a bot rule", which is a natural hand-off.

## Product tiers

What exists today is marked **Built**. Everything else is **Not built**, and each paid feature would need its own spec, tests and safety review before it ships. The safety rules never change between tiers: nothing generated is posted to Twitch chat, links end in `.invalid`, the overlay stays redacted, and no term reaches Twitch without the streamer's approval.

| Tier | For | What is in it |
|---|---|---|
| **Demo** (free, no account) | Anyone curious, judges, mods trying it out | The full loop in a private room with a fake channel and Kai (sim); grades are a labelled local estimate. **Built.** |
| **Starter** (free) | Small channels | One channel; manual drills; Twitch grading within Twitch's own per-channel limits; up to six proposed terms per drill, fresh-wave proof, push and undo; the after-action report and numbers-only share links. **Built.** |
| **Crew** (paid) | Streamers with a regular mod team | Everything in Starter, plus **scheduled drills** with reminders to mods, **team analytics** drill over drill (reaction time, false bans, catches per mod; PRD metrics M-11 and M-12), and a longer **report history**. **Not built.** |
| **Studio** (paid) | Agencies, esports organisations, large channels | Everything in Crew, plus **multi-channel** management from one account, roster-wide reports, roles for managers, and pre-event drill packs. **Not built.** |
| **Partner** (custom) | Platform or creator programmes | Bulk seats, programme-level reporting with counts only, onboarding help. **An idea, not a plan.** |

> [!NOTE]
> **Two items need care.**
> - **Grading limits are Twitch's, not ours.** Check AutoMod Status has a per-channel limit (announced as 5 a minute and 50 an hour for most channels, with more for affiliates and partners, in the [Twitch developer forum](https://discuss.dev.twitch.com/t/upcoming-changes-to-the-check-automod-status-api-endpoint/38512); whether it counts requests or lines is still marked `[verify]` as assumption A-02 in [`for-agents/open-questions.md`](for-agents/open-questions.md)). A paid tier cannot buy more Twitch quota. What it can offer is smarter use of the quota a channel already has, such as grading spread across the hour and graded history kept for comparison.
> - **Chat retention is a privacy promise.** Today public chat is kept for 7 days, used only for the false-ban check, and deleted on sign-out (PRD principle P-7). Any longer retention would have to be opt-in, explained in plain words, and agreed in the specs first. Longer **report** history (counts, not chat text) is the safer paid feature.

## Pricing hypotheses

> [!CAUTION]
> These are guesses to test, not prices. They have not been shown to any customer.

| Tier | Hypothesis to test | How we would test it |
|---|---|---|
| Starter | Free forever, so mods can bring it to new channels | Count channels that run a second drill within 30 days |
| Crew | A low monthly price per channel, in the range of a few US dollars a month (**assumption**) | A waitlist with two price points shown at random; count sign-ups at each |
| Studio | A per-channel price with a roster minimum, or a flat monthly fee (**assumption**) | Five interviews with agencies or esports organisations before any build |
| Pre-event drill | A one-off fee for a guided drill before a big stream (**assumption**) | Offer it by hand to three events; track how many accept |

**Rule of thumb we will hold ourselves to (assumption):** a paid tier only launches when its running cost per channel, measured on real usage, is well under its price.

## Go-to-market

1. **Mods first.** Mods moderate several channels and talk to each other. A mod who scores well in a drill brings it to the next streamer. Channels: mod communities and moderator Discord servers, with the free tiers as the entry point.
2. **Shareable proof.** The numbers-only report and share card show "blocked X of Y before, Z after" without any chat text. Streamers posting them is free reach. The share links already exist.
3. **TwitchCon and creator events.** Live drills on a stage or at a booth, run in demo rooms so nothing touches a real channel.
4. **Creator agencies.** Direct outreach with a Studio pilot: run one drill per roster channel, hand over a combined report.
5. **Chat-bot integrations.** Where ModScrim says "needs a bot rule", link to the bot's own rule page. A partnership could send bot users to ModScrim for rehearsal, and ModScrim users to the bot for live protection.
6. **Open source.** The repository is public under MIT. Developers who read it are a source of trust, contributions and word of mouth.

## Costs

ModScrim was designed to be cheap to run.

| Cost | Today | Notes (all estimates) |
|---|---|---|
| **Compute and storage** | One Cloudflare Worker, one `ChannelRoom` Durable Object per channel, D1, and optional Queue and R2 for report exports | Usage-based. The design fits the Workers Free plan limits listed in [`for-agents/tech-stack.md`](for-agents/tech-stack.md), which notes the $5 Workers Paid plan as optional headroom. Rooms hibernate between drills, and demo rooms delete themselves after two idle hours. Check current prices on [Cloudflare's pricing pages](https://developers.cloudflare.com/durable-objects/platform/pricing/) before relying on them. |
| **AI** | None at runtime | The attack engine, rule finder and scoring are deterministic code, so there is no per-drill model bill. |
| **Twitch API** | Free | Bound by Twitch's rate limits and developer terms, not by price. |
| **Website and domain** | Cloudflare Pages and one domain | Small fixed cost (estimate). |
| **People** | Two builders, unpaid | The real cost. Support, safety review and Twitch policy work grow with every paying customer. |

**Estimate to validate:** because a channel's room sleeps between drills and no AI is called, the infrastructure cost of a channel that runs a few drills a week should be small next to any paid price above. This must be measured with Workers Logs on real channels before any price is fixed.

## Risks

| Risk | Why it matters | How we would reduce it |
|---|---|---|
| **Twitch API limits and changes** | Grading, blocked terms and chat depend on Helix and EventSub. Limits and endpoints can change. | Keep every unconfirmed value behind a named constant (already the rule); fall back to the labelled local estimate; follow the Twitch developer forum. |
| **Twitch policy** | A tool that generates spam-like text must stay clearly within the developer terms. | Never post generated text to Twitch chat; `.invalid` links and placeholder slurs only; ask Twitch for a review before charging money. |
| **Single-platform dependency** | All value today is on Twitch. | Keep the engine (`packages/core`) platform-free, which it already is. Other platforms are a later option only if Twitch customers ask for it. |
| **Demand is unproven** | Mods asked for better live tools, not drills (Q-01). | Lead with the filter loop; measure repeat drills before building paid features. |
| **Twitch builds it** | Twitch already ships AutoMod and a testing tool. | Move faster on the parts Twitch does not do: rehearsal, scoring, and proofs against real chat. A partnership is also possible. |
| **Engines disagree** | Twitch's check models AutoMod categories and permitted terms that the local matcher does not. | Label every number with its engine; track the agreement rate (PRD metric M-14). |
| **Trust and safety incident** | One leaked token or readable overlay frame would end the product. | Keep the existing controls and tests; publish a [security policy](../SECURITY.md); add an outside review before paid launch. |
| **Team capacity** | Two people. | Keep scope small and ticketed; say no to features that do not move the north-star metric. |

## What we must learn first

1. **Does the filter loop work on a real channel?** Finish the live day-0 run and record it in [`LOG.md`](LOG.md). Until then, no improvement is claimed.
2. **Will teams come back?** The north-star metric is drills per week that end with at least one pushed term that passed the fresh-wave proof (PRD M-10).
3. **Are pushed terms kept?** The share of pushed terms undone within 7 days should stay under 10% (PRD M-13).
4. **Who reaches for a wallet?** Talk to streamers, mod teams and at least five agencies or esports organisations before building a paid tier.

## Next milestones

| # | Milestone | Done when (all targets are assumptions) |
|---|---|---|
| 1 | **Real-channel proof** | The day-0 run is recorded in `LOG.md` with Twitch-graded numbers |
| 2 | **Ten pilot channels** | Ten real channels have run at least two drills each, with feedback written down |
| 3 | **Retention signal** | A clear share of pilot channels run a drill in a second month without a reminder |
| 4 | **Pricing test** | The Crew waitlist has been shown two price points, and the results are recorded |
| 5 | **First paid feature** | Scheduled drills or team analytics are specified, tested and shipped behind the same safety rules |
| 6 | **Agency pilot** | One agency or esports organisation has run a roster-wide drill and received a combined report |
| 7 | **Policy check** | Twitch developer terms reviewed for paid use, ideally with a conversation with Twitch |

**Next:** [Research and references](references.md) | [Safety](safety.md) | [Docs index](README.md)
