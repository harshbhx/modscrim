# Contributing

[Docs](README.md) / Contributing

> Changes here are small, ticketed and test-first, and they never weaken a safety rule. This page summarises [`AGENTS.md`](../AGENTS.md), which applies to people and to AI coding agents alike and is the authority if the two differ.

## Before you start

1. Read [`AGENTS.md`](../AGENTS.md) and the [specs index](for-agents/INDEX.md). The [PRD](for-agents/PRD.md) wins on scope, copy and safety; the [SRS](for-agents/SRS.md) wins on implementation.
2. Work from a GitHub issue. Its Scope, Requirements, Tests and Done-when sections are the brief, and the issues it depends on must be closed.
3. Do not add a feature, endpoint, dependency or table the PRD or SRS does not list. If something is unclear, leave a `TODO(question)` and ask.

## Workflow

1. Branch from the base branch as `t-xx-short-name`.
2. Write or update the tests first, watch them fail, then implement.
3. Keep the diff small: one ticket per branch and pull request.
4. Run `npm test` and `npm run typecheck`. Let GitHub Actions run the browser suites and builds ([Testing](testing.md)).
5. Open a pull request titled `T-xx: ...` whose description says `Closes #<number>`.
6. Append what changed and the test evidence to [`LOG.md`](LOG.md), and tick the ticket in [`for-agents/build-plan.md`](for-agents/build-plan.md).
7. Name the requirement in commit messages, for example `FR-17: emit lines on the drift-free clock`.

## Rules that never bend

- No code sends text to Twitch chat except the fixed announcement behind `ANNOUNCE_ENABLED`.
- Every generated link ends in `.invalid`; slurs are only the placeholders `slurx` and `slury`.
- Overlay sockets receive redacted payloads only.
- Tokens never leave the Worker and never appear in logs or responses.
- Never call Twitch's AutoMod settings update endpoint.
- No blocked term reaches Twitch without the streamer's approval, and every push can be undone.
- Secrets come only from `wrangler secret put` and `app/.dev.vars`. Never commit either.
- `packages/core` stays pure: no I/O, no `Date.now()`, no `Math.random()`. Use the seeded `Rng`.
- TypeScript is strict with `noUncheckedIndexedAccess`; no `any`; validate every boundary with zod.
- Durable Object changes are atomic with `transactionSync()`, use one alarm multiplexed through the `schedule` table, and use the Hibernation API.

## Design and copy changes

- Screen copy matches the PRD section 9.6 copy deck; strings live in [`app/src/copy.ts`](../app/src/copy.ts).
- Colours come from tokens. Run the gates in [Design system](design-system.md) before pushing.
- `site/` is the static website and `app/` is the Worker. Never add app routes or API calls to `site/`.

## Docs changes

- The Markdown specs in `docs/for-agents/` are the source; the PDFs in `docs/for-humans/` are never edited by hand.
- Keep pages factual: every statement should come from the code, a spec or a workflow file. Where something is not confirmed, say so.
- Check relative links before you push, and keep Mermaid diagrams valid.

## Commits and attribution

Commits are authored by the human builders. Do not add co-author trailers or generated-by lines to commits, pull requests or documentation.

**Next:** [Testing](testing.md) | [Design system](design-system.md) | [Docs index](README.md)
