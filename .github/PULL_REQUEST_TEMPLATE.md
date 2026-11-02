## What and why

<!-- Title: `T-xx: ...` for a ticket, or `docs: ...` / `ci: ...` for other work. -->

Closes #

Requirements covered: <!-- e.g. FR-17, F-04 -->

## How it was tested

<!-- Paste the test counts, and say what you checked by hand (demo room, deployed app, screen reader). -->

- `npm test`:
- `npm run typecheck`:

## Checklist

- [ ] Tests for the requirements were written or updated first, and `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] No safety rule is weakened: nothing generated is sent to Twitch chat, links end in `.invalid`, slurs are only `slurx` / `slury`, overlay payloads stay redacted, AutoMod stays read-only, and every push needs approval and can be undone
- [ ] User-facing copy matches the PRD §9.6 copy deck (`app/src/copy.ts`)
- [ ] No secret, token or `.dev.vars` content is in the diff, the logs or this description
- [ ] No feature, endpoint, dependency or table the PRD or SRS does not list
- [ ] `docs/LOG.md` and `docs/for-agents/build-plan.md` are updated for a ticket
- [ ] If `docs/*.md` or the README's "Repository structure" or "Built with Codex" sections changed, `npm run site:docs` was run
- [ ] Keyboard and screen-reader basics were checked for UI changes
