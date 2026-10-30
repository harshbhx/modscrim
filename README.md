# modscrim

**Mod Fire Drill**: fire drills for a Twitch channel's moderators. Built for the Codex x TwitchCon hackathon on Devpost.

Brand kit in [`brand/`](brand/).

## URLs

| URL | What it is |
|---|---|
| [modscrim.dualmindlab.tech](https://modscrim.dualmindlab.tech) | The static website, served from [`site/`](site/) by Cloudflare Pages |
| [app.modscrim.dualmindlab.tech](https://app.modscrim.dualmindlab.tech) | The app: the `mod-fire-drill` Worker from [`app/`](app/), serving the React SPA plus `/api/*`, `/auth/*`, `/ws/*` and `/eventsub` |
| [app.modscrim.dualmindlab.tech/api/health](https://app.modscrim.dualmindlab.tech/api/health) | Health check, returns `{"ok":true}` |
| `http://localhost:5173` | Local dev (`npm run dev`): SPA, Worker, Durable Object and local D1 |

**Works today:** the deployed Worker, `/api/health`, the SPA shell, the D1 schema, signed EventSub intake and the room sockets. Twitch sign-in waits for the Twitch app registration (T-40, #44). **Comes later:** demo rooms and drills land with T-12 to T-18; the console, mod view, overlay and `/demo` screens land with the web tickets (T-20 onwards).

Twitch sign-in is tested on the deployed app; local dev covers everything else (demo rooms, drills, tests).

Specs live in [`docs/`](docs/README.md):

- [PRD](docs/for-agents/PRD.md): the what and the why
- [SRS](docs/for-agents/SRS.md): the how

PDF copies are in [`docs/for-humans/`](docs/for-humans/).
