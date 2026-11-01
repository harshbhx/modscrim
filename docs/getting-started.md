# Getting started

[Docs](README.md) / Getting started

> Three ways in, from no setup to a full Twitch sign-in: try the hosted demo, run the app on your machine, or register your own Twitch application. Pick the first to see the product in two minutes.

## 1. Try the demo (no account)

Open <https://app.modscrim.dualmindlab.tech/demo> and start a demo drill. You get a private practice room with a fake channel (`pixelpanda_tv`), a simulated co-mod (Kai) and the whole loop: run the drill, review the grade, see the proposed rules, prove them on a fresh wave, and try a simulated push and undo.

Demo rooms are isolated: they never call Twitch, D1, R2 or the report queue, grading is a labelled local estimate, and a room deletes itself after two hours without activity. You can open the mod view on a phone from the demo page.

## 2. Run it locally

Requirements: Node.js 22 or newer and npm. No Twitch credentials are needed for demo rooms.

```sh
git clone https://github.com/harshbhx/modscrim.git
cd modscrim
npm ci
```

Create `app/.dev.vars`. The file is git-ignored and holds local-only placeholder values; generate fresh secrets for anything real and never commit this file.

```dotenv
PUBLIC_BASE_URL=http://localhost:5173
SESSION_HMAC_KEY=local-session-key-change-me
TOKEN_ENC_KEY=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
EVENTSUB_SECRET=local-eventsub-secret
TWITCH_CLIENT_ID=local-client-id
TWITCH_CLIENT_SECRET=local-client-secret
```

Start the app and open <http://localhost:5173/demo>:

```sh
npm run dev
```

`npm run dev` runs the Vite dev server with the Cloudflare plugin, so the SPA, the Worker, the Durable Object and a local D1 database all run on port 5173.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on <http://localhost:5173> |
| `npm test` | Core tests (Node) and Worker tests (Vitest in `workerd`) |
| `npm run typecheck` | `tsc -b` across the workspaces |
| `npm run db:migrate:local` | Apply D1 migrations to the local database |
| `npm run types` | Regenerate the Worker `Env` types with Wrangler |

**Local limits.** Twitch accepts only HTTPS redirect URIs and calls only HTTPS webhooks on port 443, so sign-in and live chat ingest are tested on the deployed app. Everything else, including demo rooms, drills and tests, runs locally.

## 3. Set up Twitch for a real channel

1. Create a **Confidential** application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Set the OAuth redirect URL to `https://app.modscrim.dualmindlab.tech/auth/callback` and use `https://app.modscrim.dualmindlab.tech/eventsub` as the EventSub callback. For your own deployment, substitute your app's host.
3. Put `TWITCH_CLIENT_ID` in the Worker's `vars` and store `TWITCH_CLIENT_SECRET`, `PUBLIC_BASE_URL`, `EVENTSUB_SECRET`, `SESSION_HMAC_KEY` and `TOKEN_ENC_KEY` as Worker secrets (see [Deployment](deployment.md)).
4. Sign in on the deployed app. ModScrim requests these scopes: `moderator:read:blocked_terms`, `moderator:manage:blocked_terms`, `moderator:read:automod_settings`, `moderation:read`, `user:read:chat`, `user:bot` and `channel:bot`. It adds `user:write:chat` only when the optional announcement flag is on. The endpoints behind them are listed in [`for-agents/twitch.md`](for-agents/twitch.md).

## 4. Run a drill with your team

1. **Console.** Sign in and open `/console`. The six screens are Read filters, Configure, Run the drill, Twitch grades, Fix the rules, and Fresh wave and push.
2. **Mods.** Share the mod link and the six-digit join code from the Configure screen. A mod joins from any device; on a keyboard, D, T and B act on the focused line.
3. **OBS (optional).** Add the overlay URL as a Browser Source at 1920 x 1080, turn off "Shutdown source when not visible", and add no custom CSS. If the key was ever visible on screen, use **Rotate key** and copy the URL again. The overlay shows an alarm bar, the scoreboard and a practice chat drawn as blurred bars.
4. **Rehearsing alone?** Turn on Kai (sim), a simulated co-mod that is always labelled and scored separately.

**Next:** [How it works](how-it-works.md) | [Safety](safety.md) | [Troubleshooting](troubleshooting.md)
