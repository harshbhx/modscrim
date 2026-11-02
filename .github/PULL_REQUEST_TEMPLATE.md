<!--
Title: `T-xx: …` for a ticket, or `docs: …` / `ci: …` for other work. One ticket per PR.
Never paste a token, a secret, `.dev.vars` content or real chat text here.
-->

Closes #

**Requirements:** <!-- FR-xx, F-xx, S-xx, or "none" -->

## What changed and why

-

## Test evidence

<!-- Paste the result lines with test counts, not just "passes". -->

- `npm test`:
- `npm run typecheck`:
- `npm run e2e` (UI changes):
- By hand: <!-- demo room, deployed app, OBS overlay, keyboard and screen reader -->

<!-- UI change? Add before and after screenshots here. -->

## Checklist

- [ ] Tests for the requirements were written or updated first
- [ ] No safety rule in `AGENTS.md` is weakened (no generated text to Twitch chat, `.invalid` links, `slurx` / `slury` only, redacted overlay, read-only AutoMod, every push approved and undoable)
- [ ] User-facing copy matches the PRD §9.6 copy deck (`app/src/copy.ts`)
- [ ] No secret, token or `.dev.vars` content in the diff, the logs or this description
- [ ] Nothing added that the PRD or SRS does not list (feature, endpoint, dependency, table)
- [ ] `docs/LOG.md` updated and the ticket ticked in `docs/for-agents/build-plan.md`
- [ ] Commits name the requirement and carry no AI co-author trailers
- [ ] If `docs/*.md` or the README's "Repository structure" or "Built with Codex" sections changed, `npm run site:docs` was run
