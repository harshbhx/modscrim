# Deployment

[Docs](README.md) / Deployment

> The app deploys to Cloudflare Workers from GitHub Actions; the website deploys through a Git-connected Cloudflare Pages project. This page covers the one-time setup, the workflows, and how to verify a release.

## What deploys where

| Host | Serves | Source | How |
|---|---|---|---|
| `https://modscrim.dualmindlab.tech` | Static website | `site/` | Cloudflare Pages project `modscrim`, Git-connected |
| `https://app.modscrim.dualmindlab.tech` | App Worker `mod-fire-drill`: SPA routes plus `/api/*`, `/auth/*`, `/ws/*`, `/eventsub` | `app/` | [`deploy-app.yml`](../.github/workflows/deploy-app.yml), or `npm run deploy` |
| `https://mod-fire-drill.creharsh.workers.dev` | The same Worker on `workers.dev` | `app/` | Same |
| `https://mod-fire-drill-preview.creharsh.workers.dev` | Preview Worker with its own database | `app/` with `CLOUDFLARE_ENV=preview` | [`preview-app.yml`](../.github/workflows/preview-app.yml) |

`site/` is the website and `app/` is the Worker: app routes, API calls and app screens never go into `site/`.

## One-time setup

1. Authenticate Wrangler: `npx wrangler login`.
2. Create the D1 database `mfd` and put its ID in [`app/wrangler.jsonc`](../app/wrangler.jsonc).
3. Apply migrations: `npm run db:migrate:remote`.
4. Set the secrets, one `npx wrangler secret put <NAME>` per name. Run it from `app/`, and never paste values into the repository or a chat.

   | Name | Purpose |
   |---|---|
   | `PUBLIC_BASE_URL` | Redirect URI, webhook callback, links and the `Origin` check (`https://app.modscrim.dualmindlab.tech` in production) |
   | `TWITCH_CLIENT_SECRET` | OAuth token exchange |
   | `EVENTSUB_SECRET` | Webhook signatures (10 to 100 ASCII characters) |
   | `SESSION_HMAC_KEY` | Cookies, tickets and participant tokens |
   | `TOKEN_ENC_KEY` | AES-256-GCM sealing of OAuth tokens |

   `TWITCH_CLIENT_ID` and the other settings (`CHAT_LOG_RETENTION_DAYS`, `CLEAN_SET_MAX_LINES`, `GRADING_ENGINE`, `GRADING_BATCH_SIZE`, `GRADING_QUOTA_UNIT`, `DEMO_ENABLED`, `ANNOUNCE_ENABLED`, `COACH_AI_ENABLED`) are public `vars` in the Wrangler config. The config lists the five secrets under `secrets.required`, so a deploy without them fails.
5. Production-only report export: an R2 bucket and a Queue, both named `mfd-reports`, matching the config.
6. In the Twitch Developer Console, register `https://app.modscrim.dualmindlab.tech/auth/callback` as the redirect URL; EventSub calls `https://app.modscrim.dualmindlab.tech/eventsub`.
7. Deploy with `npm run deploy` (`vite build && wrangler deploy`), then open `/api/health`; it answers `{"ok":true}`. Optionally run `npm run subscribe-revoke` once to create the app-level revoke subscription.

## The workflows

| Workflow | Trigger | What it does |
|---|---|---|
| [`deploy-app.yml`](../.github/workflows/deploy-app.yml) | Push to `main` touching `app/`, `packages/` or the root config; manual | Install, typecheck, test, apply D1 migrations to `mfd`, `npm run deploy`, then retry `/api/health` up to five times |
| [`preview-app.yml`](../.github/workflows/preview-app.yml) | Pull requests to `main` touching the app (same-repo branches only) | Same checks, migrations on `mfd-preview`, deploy the preview Worker, health check, and comment the link on the PR. One shared preview: the latest updated PR is what it shows |
| [`ci.yml`](../.github/workflows/ci.yml) | Pull requests and pushes to `main` | Gates described in [Testing](testing.md) |
| [`e2e.yml`](../.github/workflows/e2e.yml) | Pull requests and pushes to `main` | Playwright projects |
| [`site.yml`](../.github/workflows/site.yml) | Changes under `site/`, the design tokens or the site spec | Site Playwright project and screenshots |
| [`demo-e2e.yml`](../.github/workflows/demo-e2e.yml) | Nightly at 02:00 UTC; manual with a URL | The full demo loop against production |
| [`lighthouse.yml`](../.github/workflows/lighthouse.yml) | Manual | Lighthouse scores for the site and the console |
| [`firefox-console-check.yml`](../.github/workflows/firefox-console-check.yml) | Manual; changes to the console page | Checks that Enter in a console preview form does not reload the page in Firefox |

The deploy and preview workflows need a `CLOUDFLARE_API_TOKEN` secret and a `CLOUDFLARE_ACCOUNT_ID` variable in the repository settings.

## Verify a release

- `https://app.modscrim.dualmindlab.tech/api/health` returns `{"ok":true}`.
- `https://app.modscrim.dualmindlab.tech/demo` starts a demo drill.
- Sign in with a test channel: the console shows the connection and the chat subscription becomes enabled.
- Run the nightly demo workflow by hand if you need a fresh end-to-end check.

Do not deploy from a checkout that contains unreviewed local configuration or secrets.

**Next:** [Testing](testing.md) | [Troubleshooting](troubleshooting.md) | [Architecture](architecture.md)
