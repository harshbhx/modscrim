# FAQ

[Docs](README.md) / FAQ

> Short answers for streamers, mods, judges and contributors. The website has a streamer-facing version at <https://modscrim.dualmindlab.tech/faq.html>.

## For streamers

**Does anything attack my real chat?**
No. Attacks exist only in the practice chat, which only your team and the overlay see. The one optional exception is a single fixed announcement when a drill starts. It is off by default (`ANNOUNCE_ENABLED` is `false`).

**Is the grading real?**
On a real channel, yes: Twitch's Check AutoMod Status grades every line it can within your channel's limits. Anything ModScrim's own matcher graded is labelled "local estimate", and demo rooms always use the local estimate.

**Can ModScrim change my AutoMod settings?**
No. It reads them. The only thing it can change is your blocked terms, and only after you press **Approve and push**.

**What if a new term bans a regular?**
ModScrim rejects any term that matches your last 7 days of chat, and push is disabled unless real-chat matches are zero. If a term still causes trouble, **Undo** removes the terms that drill added, or you can remove one in your Twitch dashboard.

**How long does a drill take?**
The drill itself runs 30 seconds to 3 minutes.

**Do I need to install anything?**
No. You, your mods and OBS all use links.

**What does it cost?**
It is a free, open-source hackathon project that runs on Cloudflare and makes no paid AI calls at runtime.

**What happens to my chat data?**
It stays in your channel's own room for 7 days, is used only for the false-ban check, and is deleted when you ask, sign out or revoke the app. See [Safety](safety.md).

## For mods

**Do my actions affect real viewers?**
No. Delete, time out and ban in the practice chat only score the drill.

**Can I use a phone?**
Yes. The mod view works from 360 px wide. On a keyboard, D, T and B act on the focused line.

**Will my name show on stream?**
Your display name appears on the overlay scoreboard unless the streamer turns on the hide-names overlay setting, which shows Mod 1, Mod 2 and so on.

## For judges

**Where do I start?**
Open the [live demo](https://app.modscrim.dualmindlab.tech/demo). No account is needed. Start a drill, join as a moderator, clear practice lines, then review the local grade, the proposed rules, the fresh-wave proof and the simulated push and undo.

**What is the hard part?**
Proving the new rules. The rule finder must catch what slipped while matching nothing in real chat, and the proof uses a held-out wave built from tricks the finder never saw.

**What is not proven yet?**
The live Twitch day-0 run is not recorded, so no real-channel improvement is claimed. See [`LOG.md`](LOG.md) and the limits in the [README](../README.md#roadmap-and-known-limits).

**How was it built?**
From the PRD and SRS with ticketed, test-first work; see the "Built with Codex" section of the [README](../README.md#built-with-codex). Specs are in [`for-agents/`](for-agents/INDEX.md).

## About the project

**Is ModScrim made by Twitch?**
No. It is an independent project that signs in with Twitch and uses Twitch's public API. It is not affiliated with or endorsed by Twitch.

**Why not use an AI model to write the attacks?**
Templates and tricks are safer, free and repeatable: the same seed always gives the same wave, so a drill can be replayed and tested.

**What can blocked terms not catch?**
Spaced or dotted letters, zero-width characters, emoji inside a word and look-alike letters. ModScrim labels these "needs a bot rule".

**Can viewers learn tricks from the overlay?**
No. The overlay never receives attack text, only each line's length, drawn as a blurred bar.

**What licence is it under?**
MIT. See [`LICENSE`](../LICENSE).

**Next:** [Troubleshooting](troubleshooting.md) | [Glossary](glossary.md) | [Contributing](contributing.md)
