# Testing

[Docs](README.md) / Testing

> Unit and Worker tests run with Vitest, browser tests run with Playwright, and a handful of small scripts gate the design tokens. This page is the map. The test inventory, matcher cases and reference numbers are in [`for-agents/testing.md`](for-agents/testing.md), which is the source of truth for them and is not repeated here.

## The layers

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest in Node (`packages/core`) | The pure engine: matcher, tricks, waves, rule finder, scoring, proof, pacing |
| Worker integration | Vitest with the Cloudflare plugin, in `workerd` (`app/test`) | Routes, webhook verification, `ChannelRoom` behaviour with Durable Object alarms, deletion, report export, overlay redaction |
| End to end | Playwright (`app/e2e`) | The surfaces, the demo loop, safety checks, the console and the mod view |
| Design gates | Node scripts in `scripts/` | Contrast, action borders, site token sync, site colours |

Core tests must also pass in the Worker pool, because the core runs unchanged in Node and `workerd`.

## Commands

```sh
npm test                                   # core (Node) + Worker (workerd)
npm test -w packages/core                  # core only
npm test -w app                            # Worker tests only
npm test -w packages/core -- matcher       # one core file by name
npm run typecheck                          # tsc -b

npm run e2e                                # Playwright, local dev server starts automatically
npm run e2e:ui                             # Playwright's UI mode
npm run e2e:report                         # open the HTML report
npx playwright test --project=smoke        # one project

npm run contrast:check                     # colour gate
npm run lint:tokens                        # action-border lint
npm run site:tokens:check                  # site tokens match design/
npm run site:colours                       # site uses only known colours
```

When `PLAYWRIGHT_BASE_URL` is unset or points at `http://localhost:5173`, the Playwright config starts `npm run dev` and waits for `/api/health`. Set it to a deployed URL to run against that Worker instead. Each run creates one shared demo room for all projects.

## Playwright projects

| Project | Runs against | Checks |
|---|---|---|
| `setup` | App URL | Health check, creates the shared demo room and saved browser state |
| `smoke`, `safety`, `console`, `demo` | App URL (depend on `setup`) | The smoke path; `.invalid` links, slur placeholders and token shapes; the six console steps and the local-estimate grade table; the full demo loop |
| `mod` | App URL | Keyboard control of the mod view |
| `landing`, `shell-surface`, `console-surface`, `report-surface`, `mod-surface`, `overlay-surface` | Branch build served statically | One screen each, with mocked API and WebSocket data, light and dark at 375, 768 and 1440 px |
| `shared-states` | Branch build | Hover, focus, disabled, loading, empty and error states, reduced motion |
| `site` | `site/` served statically | The marketing pages |

Surface specs build every fixture with the same zod schemas the app parses with, and keep to the safety rules: links end in `.invalid`, slurs are placeholders only, overlay frames are redacted. To add one, follow "Add a surface spec" in [`for-agents/testing.md`](for-agents/testing.md).

## What CI enforces

[`ci.yml`](../.github/workflows/ci.yml) runs two jobs on every pull request and push to `main`.

**Design token contrast and action-border lint**

- `node scripts/contrast-check.mjs` validates `design/tokens.json` with the bundled palette skill's `validate.py` with no exemptions, then checks that the shipped palette (tokens plus [`design/tokens.override.css`](../design/tokens.override.css)) fails on exactly the documented pairs, no more and no fewer. The single accepted exemption is whistle orange as a fill on chalk and on white. See [Design system](design-system.md).
- `node scripts/lint-action-border.mjs` fails if a rule fills itself with the action colour without also declaring an approved border.
- `node scripts/sync-site-tokens.mjs --check` fails if `site/css/tokens*.css` drifted from `design/`.
- `node scripts/check-site-colours.mjs` fails if `site/` uses a colour that is not a token or listed in `brand/DESIGN.md`.

**Typecheck, tests, security and build**

- Scan tracked files for a tracked `.dev.vars` and for token-like strings.
- `npm run typecheck`, core tests with line coverage, Worker tests, and the app build.
- Fail if the initial JavaScript exceeds 250 KiB gzipped.

[`e2e.yml`](../.github/workflows/e2e.yml) builds the SPA, serves it on port 4173 and runs the surface projects against it, then runs `setup`, `smoke`, `safety`, `console` and `mod` against the deployed app. It uploads the light and dark screenshots as the `screenshots-<run id>` artifact on every run and the report and traces when it fails. [`site.yml`](../.github/workflows/site.yml) does the same for the website. [`demo-e2e.yml`](../.github/workflows/demo-e2e.yml) runs the `setup` and `demo` projects against production every night.

## Running heavy checks

Browser suites and builds are meant to run in GitHub Actions: push a branch, watch the run with `gh run watch`, read failures with `gh run view --log-failed` and fetch screenshots with `gh run download`.

## Not yet verified

The live Twitch path (the real grading quota, batch size and matching behaviour) is checked by a manual checklist on a test channel. Its results are not recorded yet; see the day-0 section of [`LOG.md`](LOG.md) and [`for-agents/open-questions.md`](for-agents/open-questions.md).

**Next:** [Design system](design-system.md) | [Contributing](contributing.md) | [Troubleshooting](troubleshooting.md)
