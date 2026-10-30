# ModScrim brand kit

> **In this repository:** the kit’s `website/` pages and its `web/` assets (favicon, icons, manifest, `css/`) live together in [`site/`](../site/) with `og-image.png` at its root. That folder is the static site deployed to `https://modscrim.dualmindlab.tech`. The `web/head.html` snippet is [`head.html`](head.html) here, and the pages load the fonts from `site/fonts/` through `site/css/fonts.css` instead of Google Fonts.

Raid drills for your mod team. This kit holds the whistle logo system, the full multi-page website (with a playable 30-second drill and the product screens), web and social assets, OBS overlays, design tokens and fonts. The full rules, written for people and for AI coding agents, are in [`DESIGN.md`](DESIGN.md) (Google's DESIGN.md format; `npx @google/design.md lint DESIGN.md` reports 0 errors and 0 warnings).

## The idea in one paragraph

ModScrim looks like a practice ground, not a gaming app. Wall green and chalk are the field, a hand-hung scoreboard keeps score, and a coach's whistle with chat's typing dots is the mark. Whistle orange is the one action colour. Card yellow labels anything that is practice. Big Shoulders sets the headlines and the scoreboard numbers; Atkinson Hyperlegible Next sets the text; Atkinson Hyperlegible Mono sets the practice chat, because it keeps look-alike spam characters like `v1ews` and `f0ll0w` easy to tell apart.

## What's inside

| Folder | Contents |
| --- | --- |
| `DESIGN.md` | Tokens in YAML front matter, then Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts, Responsive Behavior, Motion, Voice and copy, Logo, Inspirations and an Agent Prompt Guide |
| `logo/svg`, `logo/png` | `modscrim-<lockup>-<tone>`. Lockups: `horizontal`, `horizontal-tagline`, `stacked`, `mark`, `mark-small`, `wordmark`. Tones: `color` (light grounds), `reverse` (green grounds), `green`, `white`, `black`. Plus app icons (green and orange, square and rounded). All SVG text is outlined |
| `website/` | The website, 13 pages sharing `site.css` and `site.js`: home with the playable drill, how it works, for mods, safety, demo room, setup guide, FAQ, privacy policy, terms of use, and the product screens (streamer console, mod view, OBS overlay preview, shared report) with sample data. Open `website/index.html` in a browser |
| `web/` | `favicon.svg`, `favicon.ico` (16, 32, 48), `icons/`, `site.webmanifest`, `head.html`, and `css/` with `tokens.css`, `components.css`, `fonts.css`, `tailwind-theme.css` (Tailwind v4) |
| `social/` | OG image 1200×630, GitHub preview 1280×640, YouTube thumbnail 1280×720, Devpost 1200×800, X header 1500×500, LinkedIn banner 1584×396, avatars 400×400 |
| `stream/` | Transparent OBS overlays: practice-drill bar (1920×80 and full frame) and final-whistle scorecard; Twitch panel 320×100 |
| `fonts/` | Big Shoulders, Atkinson Hyperlegible Next (roman and italic) and Atkinson Hyperlegible Mono as variable woff2, with their SIL Open Font License files |
| `ModScrim-brand-sheet.png` | One-page overview |

## Colours

| Name | Hex | Use |
| --- | --- | --- |
| Wall green | #123D2E | Ground for hero, nav and closing band; ink colour on chalk |
| Dugout | #0B2A1F | Practice chat and notes panels |
| Chalk | #EEF1E8 | Light ground; text on green |
| Whistle orange | #FF6A1F | The mark and the one main button per view |
| Card yellow | #FFD23F | Practice labels and fouls |
| Moss | #4E6358 | Secondary text on chalk |

Text on orange or yellow is always deep green (#0B2A1F). Orange text on chalk uses #B33D00. No Twitch purple; ModScrim is not affiliated with Twitch.

## Web setup

1. Copy `web/favicon.svg`, `web/favicon.ico`, `web/site.webmanifest`, `web/icons/` and `social/og-image.png` to your site root, `web/css/` to `/css/`, and `fonts/` to `/fonts/` if you self-host.
2. Paste `web/head.html` into `<head>` and replace `YOUR-DOMAIN`.
3. Chalk is the default ground. Add `class="on-green"` (or `data-ground="green"`) to a section to switch it to wall green; the semantic variables (`--bg`, `--text`, `--text-muted`, `--line`, `--focus` …) follow.
4. Components: `.ms-btn` (+ `-orange`, `-line`, `-green`, `-sm`), `.ms-tag-practice`, `.ms-board` with `.ms-slot`, `.ms-slot-label`, `.ms-plate` (+ `-raid`, `-fouls`), `.ms-chat`, `.ms-msg` (+ `.is-caught`, `.is-foul`), `.ms-chip-caught | -foul | -slipped`, `.ms-rules`, `.ms-plan`, `.ms-linescore`.
5. Tailwind v4: `@import "tailwindcss"; @import "./tailwind-theme.css";` then `bg-green-700`, `text-chalk-100`, `bg-brand`, `font-display`, `rounded-plate`.

## The website

The pages follow the PRD and SRS: the tactics and tricks, `.invalid` links, the 9-second slip window, Twitch grading with a labelled local estimate, the real-chat check, the fresh-wave proof, push with undo, the 7-day chat log and the deletion flows. In the deployed product these static pages map to the app's routes:

| Page in `website/` | Product route |
| --- | --- |
| `index.html`, `how-it-works.html`, `mods.html`, `safety.html`, `setup.html`, `faq.html`, `terms.html` | Static pages on `/` |
| `privacy.html` | `/privacy` |
| `demo.html` | `/demo`, which creates a demo room and opens `/demo/:room` |
| `console.html` (hash per step) | `/console`; "Sign in with Twitch" goes to `/auth/login` |
| `mod.html` | `/mod/:channel` and `/demo/:room/mod` |
| `overlay.html` | `/overlay/:channel?key=…` (the real overlay is transparent, without the preview frame) |
| `report.html` | `/r/:reportId` |

The console, mod view, overlay and report use the sample channel `pixelpanda_tv` and say so. Before launch, replace the placeholders: `YOUR-DOMAIN`, `YOUR-ORG` (GitHub links), `[YOUR NAME OR TEAM]`, `[CONTACT EMAIL]`, `[POSTAL ADDRESS IF REQUIRED]` and `[JURISDICTION]`, and have the privacy policy and terms reviewed for where you operate.
