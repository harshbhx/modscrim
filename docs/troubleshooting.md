# Troubleshooting

[Docs](README.md) / Troubleshooting

> Symptom, what to check, and the fix, for the problems a streamer, a mod or an operator is most likely to meet. The operator runbook is [SRS section 14.2](for-agents/SRS.md); this page restates it in plain terms.

## For streamers and mods

| Symptom | Check | Fix |
|---|---|---|
| The chat-log count stops growing | The console status strip: is the chat subscription enabled? | Use the repair action in the status strip. If Twitch revoked the subscription for failures, the hourly job re-creates it |
| A "Reconnect Twitch" banner | Your Twitch token is no longer valid | Sign in again |
| Grading is stuck at "waiting" | Twitch limits checks per channel each minute and hour | Wait for the limit to reset, or press **Use local estimate now**. Local numbers are labelled "local estimate" |
| Mods see lines late | Network or device load | Reload the mod view; it rejoins with the participant token |
| A term failed to push | The term's length or syntax | Fix the term. A term that already exists on Twitch is treated as preexisting, not as an error |
| The overlay is blank in OBS | Was the overlay key rotated, or is the Browser Source URL old? | Copy the overlay URL from the console again. In OBS, keep "Shutdown source when not visible" off and add no custom CSS |
| Creating a demo room says "too many" (HTTP 429) | The demo limiter allows 5 rooms a minute per IP | Wait a minute |
| A mod cannot join | Join codes expire when a drill ends; five failed attempts in a minute are throttled | Use the new code from the console, then retry after a minute |
| The numbers differ from what Twitch would do | Demo and fallback grades use the local matcher, which does not model AutoMod categories or permitted terms | Read the engine label on every number: "graded by Twitch" or "local estimate" |
| Push is disabled | A selected term matches real chat | Remove that term; push needs zero real-chat matches |

## For people running the app

| Symptom | Check | Fix |
|---|---|---|
| `npm run dev` fails to start | Node version and `app/.dev.vars` | Use Node 22 or newer; create `.dev.vars` as in [Getting started](getting-started.md) |
| Sign-in does not work locally | Twitch accepts only HTTPS redirect URIs | Test sign-in on a deployed host, not `localhost`. Demo rooms work locally |
| A deploy fails | A required secret is missing | The Wrangler config lists five required secrets; set each with `npx wrangler secret put <NAME>` |
| `/api/health` does not return `{"ok":true}` | Worker logs in the Cloudflare dashboard | Fix the error shown and redeploy; the deploy workflow retries the check five times |
| Error 1102 (CPU exceeded) | Workers Logs CPU time | Lower `CLEAN_SET_MAX_LINES`, or use a Workers plan with a higher CPU limit |
| Playwright runs fail in CI with only a surface project red | The branch markup changed | Download the `screenshots-<run id>` and failure artifacts with `gh run download` |
| `site:tokens:check` fails | `site/css/tokens*.css` drifted from `design/` | Run `npm run site:tokens` and commit the copies |
| `contrast:check` fails | A colour change widened or removed the documented exemption | See [Design system](design-system.md); never extend the exemption without updating the override file |

## Still stuck?

Open an issue at <https://github.com/harshbhx/modscrim/issues> with the page you were on, what you expected and the engine label shown on the grade. Do not paste tokens, secrets or chat text.

**Next:** [FAQ](faq.md) | [Deployment](deployment.md) | [Glossary](glossary.md)
