# Research and references

[Repository](../README.md) / [Docs](README.md) / References

> The sources behind ModScrim: the research and reporting that framed the problem, the Twitch and Cloudflare documentation the code is built against, and one piece of prior art. Every link was opened and checked when this page was written.

## How to read this page

- **Built with** means the repository records the link as a reference: the problem evidence is in [PRD §3.2 and §17](for-agents/PRD.md), and the platform references are in [SRS §2.4 and §17](for-agents/SRS.md) and [`for-agents/twitch.md`](for-agents/twitch.md).
- **Why it matters** is a one-line note on what each source gave the project. It is a summary, not a quotation.
- The type of each source (Twitch docs, Cloudflare docs, paper, article, game) is in the first column.
- There are no Reddit threads on this list. The repository does not record any as a source, so none is claimed. The hate-raid paper below is a study of discussions on r/Twitch.

## Background: the problem

These sources are the evidence in PRD §3.2 for why mod teams need practice and why filters are tuned blind.

| Type | Source | Why it matters |
|---|---|---|
| Paper | [Seering and Kairam, "Who Moderates on Twitch and What Do They Do?" (2023)](https://joseph.seering.org/papers/Seering_and_Kairam_2023_Who_Moderates_Twitch_What_Do_They_Do.pdf) | A survey of 1,053 active Twitch moderators in the United States. It is where the PRD's picture of how mods learn and what they do comes from. |
| Paper | [Silencing Empowerment, Allowing Bigotry: Auditing the Moderation of Hate Speech on Twitch (arXiv 2506.07667)](https://arxiv.org/abs/2506.07667) | An audit of AutoMod with test accounts. It found hateful messages getting through and harmless messages blocked, which is the gap the filter loop is built to measure. |
| Paper | [Hate Raids on Twitch: Understanding Real-Time Human-Bot Coordinated Attacks (arXiv 2305.16248)](https://arxiv.org/abs/2305.16248) | A qualitative study of r/Twitch discussions about hate raids. It shows why a team that has never rehearsed one is at a disadvantage. |
| Article | [GamingHQ: Twitch Communities Struggle With Rising Spam Bots and Fake View Activity (9 May 2026)](https://gaminghq.eu/2026/05/09/twitch-communities-struggle-with-spam-bots-and-fake-view-activity/) | Volunteer mods describe bots that reword and respace messages to dodge filters. That is the behaviour the drill's tricks imitate. |
| Newsletter | [Stream Report: Twitch Gets Smart About Moderation, Three New Tools (27 Aug 2025)](https://gaming-careers.pages.dev/newsletters/twitch-gets-smart-about-moderation-three-new-tools) | Describes Twitch's AutoMod testing tool, which checks typed phrases against current settings. ModScrim differs by drilling mods and testing new rules against real chat. |
| Twitch blog | [Community First: Everything We Announced at TwitchCon Rotterdam 2026](https://blog.twitch.com/en/2026/05/30/everything-we-announced-at-twitchcon-rotterdam-2026/) | Shows moderation is a current platform priority, including an AutoMod detection update. |

## Prior art

| Type | Source | Why it matters |
|---|---|---|
| Game | [Twitch Mod Simulator by adamziadi](https://adamziadi.itch.io/twitch-mod-simulator) | A satirical browser game made for a game jam in which you play a Twitch moderator. It is listed in PRD §17 as prior art; ModScrim is a practice tool tied to a channel's real filters. |

## Built with: Twitch developer documentation

| Type | Source | Why it matters |
|---|---|---|
| Twitch docs | [Moderation guide](https://dev.twitch.tv/docs/api/moderation) | The overview of the moderation endpoints ModScrim reads: AutoMod settings and blocked terms. |
| Twitch docs | [API reference](https://dev.twitch.tv/docs/api/reference) | Where Check AutoMod Status, Get Blocked Terms and the other Helix calls in `app/worker/twitch/` are defined. |
| Twitch forum | [Upcoming changes to the Check AutoMod Status API endpoint](https://discuss.dev.twitch.com/t/upcoming-changes-to-the-check-automod-status-api-endpoint/38512) | Announces the per-channel limits (5 a minute and 50 an hour for most channels, more for affiliates and partners) that shape the paced grading queue and its local fallback. |
| Twitch docs | [Handling webhook events](https://dev.twitch.tv/docs/eventsub/handling-webhook-events) | The signature and reply rules the `/eventsub` endpoint follows. |
| Twitch docs | [Chat authentication](https://dev.twitch.tv/docs/chat/authenticating/) | Which tokens and scopes EventSub chat subscriptions need. |
| Twitch docs | [Validating tokens](https://dev.twitch.tv/docs/authentication/validate-tokens/) | Why the hourly cron validates every stored token. |

## Built with: Cloudflare documentation

| Type | Source | Why it matters |
|---|---|---|
| Cloudflare docs | [Durable Objects: WebSockets and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) | The hibernation API the `ChannelRoom` uses for console, mod and overlay sockets. |
| Cloudflare docs | [Durable Objects: Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) | One alarm per object, which can fire more than once. This is why jobs go through a `schedule` table and are idempotent. |
| Cloudflare docs | [Durable Objects: SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) | `sql.exec` and `transactionSync`, used for atomic state changes in the room. |
| Cloudflare docs | [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) | The design rules behind one room object per channel. |
| Cloudflare docs | [Durable Objects pricing and free-plan limits](https://developers.cloudflare.com/durable-objects/platform/pricing/) | The free-plan limits SRS §2.4 designs around. |

## The event

| Type | Source | Why it matters |
|---|---|---|
| Devpost | [Codex x TwitchCon hackathon](https://twitchcon-codex.devpost.com) | The event ModScrim was built for. |

## Deliberately left out

Other pages on hate raids, Shield Mode and Twitch's moderator tooling exist, but the repository does not record them as sources for this project, so they are not listed as if they were. Twitch's own documentation is the authority for those features.

**Next:** [Documentation index](README.md)
