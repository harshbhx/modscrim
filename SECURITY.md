# Security policy

ModScrim handles Twitch OAuth tokens and reads a channel's public chat, so we take security reports seriously. Thank you for reporting responsibly.

## Supported versions

| Version | Supported |
|---|---|
| `main` and the deployed app at <https://app.modscrim.dualmindlab.tech> | Yes |
| Older commits, forks and preview Workers | No |

## Report a vulnerability privately

**Please do not open a public issue, discussion or pull request for a vulnerability.**

1. **GitHub private vulnerability reporting.** If the repository's [Security tab](https://github.com/harshbhx/modscrim/security) shows a **Report a vulnerability** button, use it. The report stays private between you and the maintainers.
2. **Email.** Otherwise, write to **<bhanushaliharsh434@gmail.com>** with the subject `ModScrim security`.

Include:

- what you found and where (route, file or screen);
- steps to reproduce, with a demo room where possible (`/demo` needs no account);
- the impact you expect.

Never include a real token, secret or another person's chat text in a report. If you had to use a token to show the issue, revoke it at <https://www.twitch.tv/settings/connections> first.

## What to expect

ModScrim is maintained by two people, so these are goals rather than guarantees:

- an acknowledgement within 3 days;
- an assessment and a plan within 10 days;
- credit in the fix's release notes if you want it.

## In scope

| Area | What we want to hear about |
|---|---|
| **Token handling** | A Twitch access or refresh token leaving the Worker, appearing in a log, response, report or WebSocket frame, or being stored unsealed. Session or cookie flaws that let one user act as another. |
| **Overlay redaction** | Any readable attack text, reveal, term or hidden mod name reaching an overlay socket (`/overlay/:channel?key=…`), or an overlay key that can be guessed or reused after rotation. |
| **Webhook signatures** | An EventSub message on `/eventsub` accepted without a valid signature, outside the timestamp window, or replayed. |
| **Twitch writes** | A blocked term pushed without the streamer's approval, an Undo that removes terms the drill did not add, any write to AutoMod settings, or any text sent to Twitch chat other than the fixed announcement. |
| **Demo isolation** | A demo room (`demo:<uuid>`) reaching Twitch, D1, R2 or the report queue, or reading another room's data. |
| **Data retention** | Chat logs kept beyond 7 days, or data left behind after sign-out or revoke. |

## Out of scope

- Twitch's own platform, AutoMod behaviour and rate limits.
- Cloudflare platform issues (report those to Cloudflare).
- Denial of service by volume, and missing hardening headers with no demonstrated impact.
- Findings that need a compromised device or browser.

The full threat model and controls are in [`docs/for-agents/safety-security-privacy.md`](docs/for-agents/safety-security-privacy.md) and, in plain language, in [Safety](docs/safety.md).
