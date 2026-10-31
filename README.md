# ModScrim

**Mod Fire Drill** helps Twitch moderators practise raid response in a private sandbox, then checks whether the channel's public blocked terms catch the generated attacks. The drill chat is never sent to Twitch. Twitch grades filters on real channels; demo rooms use a clearly labelled local estimate.

## For judges

- **Open the [public demo](https://app.modscrim.dualmindlab.tech/demo)**. No Twitch account is needed. Start a drill, join as a moderator, clear practice lines, then review the local grade, proposed rules, fresh-wave proof and simulated push/undo.
- **Architecture:**

  ```mermaid
  flowchart LR
    Twitch -->|EventSub chat webhook| Worker[Cloudflare Worker<br/>Hono API + React app]
    Worker -->|one room per channel| Room[ChannelRoom Durable Object<br/>SQLite + alarms + WebSockets]
    Room --> Mods[Moderators]
    Room --> Console[Streamer console]
    Room --> OBS[Redacted OBS overlay]
    Worker <-->|OAuth + Helix| Twitch
  ```

- The application is at [app.modscrim.dualmindlab.tech](https://app.modscrim.dualmindlab.tech); the project website is [modscrim.dualmindlab.tech](https://modscrim.dualmindlab.tech).
- This project was built from the requirements and implementation notes in [`docs/for-agents/`](docs/for-agents/), with ticket-based changes, safety constraints in [`AGENTS.md`](AGENTS.md), and automated tests. Codex session IDs are tracked in [`docs/LOG.md`](docs/LOG.md).

## Local quick start

Requirements: Node.js 22 or newer, npm, and a Cloudflare account for deployment. Local demo rooms run with the Cloudflare Vite plugin and do not need Twitch credentials.

1. Clone the repository and install dependencies:

   ```sh
   git clone https://github.com/harshbhx/modscrim.git
   cd modscrim
   npm ci
   ```

2. Create `app/.dev.vars` with local-only values (never commit this file):

   ```dotenv
   PUBLIC_BASE_URL=http://localhost:5173
   SESSION_HMAC_KEY=local-session-key-change-me
   TOKEN_ENC_KEY=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
   EVENTSUB_SECRET=local-eventsub-secret
   TWITCH_CLIENT_ID=local-client-id
   TWITCH_CLIENT_SECRET=local-client-secret
   ```

3. Start the app:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:5173/demo](http://localhost:5173/demo). Demo rooms use fixtures and never call Twitch, D1, R2 or the report queue.

Run the local verification suite with:

```sh
npm test
npm run typecheck
```

## Twitch app setup

1. Create a **Confidential** application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Set the OAuth redirect URL to `https://app.modscrim.dualmindlab.tech/auth/callback` and the EventSub callback URL to `https://app.modscrim.dualmindlab.tech/eventsub`.
3. Set `TWITCH_CLIENT_ID` as a Worker variable. Store `TWITCH_CLIENT_SECRET`, `PUBLIC_BASE_URL`, `EVENTSUB_SECRET`, `SESSION_HMAC_KEY` and `TOKEN_ENC_KEY` as Worker secrets. Generate fresh secrets for production; never reuse the local examples above.
4. Sign in on the deployed app. Twitch requires an HTTPS redirect URI; local development covers demo rooms, drills and tests without Twitch sign-in.

The requested scopes, EventSub subscription and Helix calls are documented in [`docs/for-agents/twitch.md`](docs/for-agents/twitch.md). The app never sends drill lines to Twitch chat and never updates AutoMod settings. A streamer approves every blocked-term push, which can be undone.

## Deploying the Worker

Cloudflare work (Worker, Durable Objects, D1, queues, R2, AI and deployment) is owned by the Cloudflare builder; follow [`docs/for-agents/tech-stack.md`](docs/for-agents/tech-stack.md) and [`docs/for-agents/architecture.md`](docs/for-agents/architecture.md).

1. Install and authenticate Wrangler with `npx wrangler login`.
2. Configure the D1 database ID and required bindings in `app/wrangler.jsonc`.
3. Apply migrations with `npm run db:migrate:remote`.
4. Set production secrets with `npx wrangler secret put <NAME>` for each required secret. Set public variables in the Wrangler config.
5. Deploy with `npm run deploy`, then verify `https://app.modscrim.dualmindlab.tech/api/health` returns `{"ok":true}`.

Do not deploy from a checkout containing unreviewed local configuration or secrets.

## Privacy and safety

Only public chat messages are retained for up to seven days to check proposed terms against harmless chat. Streamers can pause or delete the chat log. Reports contain counts and moderation outcomes, not attack text or chat text. Overlay sockets receive redacted lines only. Demo rooms are isolated and expire after two hours of inactivity. See the [privacy policy](https://modscrim.dualmindlab.tech/privacy) and [`docs/for-agents/safety-security-privacy.md`](docs/for-agents/safety-security-privacy.md).

## Day-0 decision and known limits

The day-0 Twitch validation is the gate for real-channel grading assumptions and minimum fresh-wave improvement. Do not claim a measured improvement until the run and its evidence are recorded in [`docs/LOG.md`](docs/LOG.md). Public blocked terms are the only filter terms visible to the app; private Twitch terms cannot be inspected. Local estimates do not model every AutoMod category, and demo grading is not a Twitch grade. Scheduled drills are still an open product question (Q-01); the team should record moderator feedback after rehearsal.

## What's next

Use the project board and [`docs/for-agents/build-plan.md`](docs/for-agents/build-plan.md) for ticket status. The near-term work is finishing the judge-ready end-to-end demo, verifying the live Twitch path and day-0 gate, then capturing the submission video and results.

## License

This project is licensed under the MIT License; see [`LICENSE`](LICENSE).
