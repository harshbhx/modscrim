# Contributing to ModScrim

Thanks for helping. Changes here are small, ticketed and test-first, and they never weaken a safety rule. This guide applies to people and to AI coding agents alike. [`AGENTS.md`](AGENTS.md) is the authority if the two differ, and the longer version of this page is [docs/contributing.md](docs/contributing.md).

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, do not open an issue: follow the [Security policy](SECURITY.md).

## Ways to help

- **Try the [live demo](https://app.modscrim.dualmindlab.tech/demo)** and [report a bug](https://github.com/harshbhx/modscrim/issues/new?template=bug_report.yml) when something looks wrong.
- **Suggest a feature** with the [feature request form](https://github.com/harshbhx/modscrim/issues/new?template=feature_request.yml). Scope is set by the specs, so tell us the problem first.
- **Improve the docs.** Every statement should come from the code, a spec or a workflow file.
- **Pick up a ticket.** Every ticket is a GitHub issue; the numbers are in [`docs/for-agents/build-plan.md`](docs/for-agents/build-plan.md).

## Before you start

1. Read [`AGENTS.md`](AGENTS.md) and the [specs index](docs/for-agents/INDEX.md). The [PRD](docs/for-agents/PRD.md) wins on scope, copy and safety; the [SRS](docs/for-agents/SRS.md) wins on implementation.
2. Work from a GitHub issue. Its Scope, Requirements, Tests and Done-when sections are the brief, and the issues it depends on must be closed.
3. Do not add a feature, endpoint, dependency or table that the PRD or SRS does not list. If something is unclear, leave a `TODO(question)` and ask instead of guessing.

## Set up

```sh
git clone https://github.com/harshbhx/modscrim.git
cd modscrim
npm ci
npm run dev        # http://localhost:5173/demo
```

Local-only values go in `app/.dev.vars`; [Getting started](docs/getting-started.md) lists them. Demo rooms need no Twitch credentials.

## Workflow

1. **Branch** from `main` as `t-xx-short-name` (for docs or tooling without a ticket, a short descriptive name such as `docs-readme`).
2. **Tests first.** Write or update the tests SRS §13.2 names for your requirements, watch them fail, then implement.
3. **Keep the diff small:** one ticket per branch and pull request.
4. **Check locally:**

   ```sh
   npm test            # core tests (Node) + Worker tests (Vitest in workerd)
   npm run typecheck   # tsc -b across workspaces
   ```

   GitHub Actions runs the browser suites, builds and design gates on the pull request ([Testing](docs/testing.md)).
5. **Open a pull request** titled `T-xx: ...` whose description says `Closes #<number>`, and fill in the template's checklist.
6. **Log it.** Append what changed and the test evidence to [`docs/LOG.md`](docs/LOG.md), and tick the ticket in [`docs/for-agents/build-plan.md`](docs/for-agents/build-plan.md).

### Commit messages

Name the requirement or ticket:

```text
FR-17: emit lines on the drift-free clock
T-03: wave builder and safety scan
docs: redesign the README
```

Commits are authored by the human builders. Do not add co-author trailers or generated-by lines to commits, pull requests or documentation.

## Rules that never bend

> [!IMPORTANT]
> A pull request that weakens any of these is not merged, whatever else it fixes.

- No code sends text to Twitch chat except the fixed announcement behind `ANNOUNCE_ENABLED`.
- Every generated link ends in `.invalid`. Slurs exist only as the placeholders `slurx` and `slury`, drawn as blocks. No real slur list exists anywhere.
- Banter comes only from the curated `BANTER` pool, never from real chat.
- Overlay sockets receive redacted payloads only: no readable attack text, no reveal, no terms.
- Tokens never leave the Worker and never appear in logs or responses. Logs never contain tokens, chat text or attack text.
- Never call Twitch's AutoMod settings update endpoint. AutoMod is read-only.
- No blocked term reaches Twitch without the streamer's approval, and every push can be undone.
- Demo rooms never call Twitch, D1, R2 or the Queue.

## Code rules

- `packages/core` stays pure: no I/O, no `Date.now()`, no `Math.random()`. Use the seeded `Rng`.
- TypeScript is strict with `noUncheckedIndexedAccess`. No `any`. Validate every boundary with zod.
- Durable Object changes are atomic with `transactionSync()`, use one alarm multiplexed through the `schedule` table, and use the Hibernation API.
- Optional bindings (`REPORTS`, `REPORT_QUEUE`, `AI`) are guarded with `if (env.X)`.
- Screen copy matches the PRD §9.6 copy deck; strings live in [`app/src/copy.ts`](app/src/copy.ts).
- `site/` is the static website and `app/` is the Worker. Never add app routes or API calls to `site/`.

## No secrets, ever

Secrets come only from `wrangler secret put` and the git-ignored `app/.dev.vars`. Never commit either, never paste a token into an issue or pull request, and never log one. CI runs a secret scan on every pull request.

## Docs changes

- The Markdown specs in `docs/for-agents/` are the source; the PDFs in `docs/for-humans/` are never edited by hand.
- Some website pages are built from `docs/*.md` and two README sections. After editing those, run `npm run site:docs` and commit the result; `npm run site:docs:check` must pass.
- Use relative links, check that they resolve, and keep Mermaid diagrams valid.
