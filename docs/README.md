<p align="center">
  <img src="assets/banner.svg" alt="ModScrim: raid drills for your mod team." width="100%">
</p>

<p align="center">
  <a href="https://github.com/harshbhx/modscrim/actions/workflows/ci.yml"><img src="https://github.com/harshbhx/modscrim/actions/workflows/ci.yml/badge.svg" alt="CI workflow status"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/licence-MIT-1E5A40?style=flat-square&amp;labelColor=123D2E" alt="Licence: MIT"></a>
  <a href="https://twitchcon-codex.devpost.com"><img src="https://img.shields.io/badge/built%20for-Codex%20x%20TwitchCon-FF6A1F?style=flat-square&amp;labelColor=123D2E" alt="Built for the Codex x TwitchCon hackathon"></a>
  <img src="https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-123D2E?style=flat-square&amp;labelColor=0B2A1F" alt="Runs on Cloudflare Workers">
  <img src="https://img.shields.io/badge/TypeScript-strict-123D2E?style=flat-square&amp;labelColor=0B2A1F" alt="TypeScript, strict mode">
</p>

# ModScrim documentation

[Repository](../README.md) / Docs

> Everything about ModScrim in one place: what a drill does, why it is safe, how it is built and how to run, test and deploy it. New here? Read [Getting started](getting-started.md), then [How it works](how-it-works.md).

## Guides

| Page | Read it when you want to |
|---|---|
| [Getting started](getting-started.md) | Try the demo, run the app locally, and set up Twitch |
| [How it works](how-it-works.md) | Follow a drill from the first read of your filters to push and undo |
| [Safety](safety.md) | Check what ModScrim will never do and how each promise is enforced |
| [Architecture](architecture.md) | See how the Worker, the `ChannelRoom` Durable Object, D1, R2, the Queue and Twitch fit together |
| [Deployment](deployment.md) | Ship the Worker and the website, and read the workflows |
| [Testing](testing.md) | Run the suites and understand the CI gates |
| [Troubleshooting](troubleshooting.md) | Fix a stuck grade, a blank overlay or a 429 |
| [Glossary](glossary.md) | Look up a term: slipped, wave B, engine, sealed |
| [FAQ](faq.md) | Get quick answers for streamers, mods, judges and contributors |
| [Design system](design-system.md) | Use the tokens, the contrast gate and the brand kit |
| [Contributing](contributing.md) | Make a change the way this repository expects |

## Specifications and records

| Path | Read by | Contents |
|---|---|---|
| [`for-agents/`](for-agents/INDEX.md) | AI coding agents and reviewers | The [PRD](for-agents/PRD.md) (what and why), the [SRS](for-agents/SRS.md) (how), and digests: [`architecture`](for-agents/architecture.md), [`tech-stack`](for-agents/tech-stack.md), [`interfaces`](for-agents/interfaces.md), [`twitch`](for-agents/twitch.md), [`safety-security-privacy`](for-agents/safety-security-privacy.md), [`build-plan`](for-agents/build-plan.md), [`testing`](for-agents/testing.md), [`glossary`](for-agents/glossary.md), [`open-questions`](for-agents/open-questions.md) |
| [`for-humans/`](for-humans/) | Judges, teammates, reviewers | `PRD.pdf`, `SRS.pdf` |
| [`LOG.md`](LOG.md) | Everyone | Decisions, day-0 results and a note per working session |
| [`assets/`](assets/README.md) | Doc authors | The banner, GIFs and screenshots used by the README and these pages |

The guides above are written for people and link into the digests for detail. When the Markdown and PDF specs disagree, the Markdown is the source; fix it first, then regenerate the PDF.

## Conventions

- Every page starts with a breadcrumb and a one-paragraph summary and ends with **Next** links.
- Commands are the real npm scripts from the root [`package.json`](../package.json). Nothing here needs a secret; secret names appear, values never do.
- Where a number or behaviour is unconfirmed (for example the live Twitch grading quota), the page says so.

**Next:** [Getting started](getting-started.md)
