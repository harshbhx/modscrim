---
version: alpha
name: ModScrim
description: Raid drills for Twitch mod teams. A coach's whistle, a manual scoreboard, a chalk-lined practice field and a practice chat set in a hyperlegible face.
colors:
  primary: "#FF6A1F"
  primary-hover: "#FF844A"
  on-primary: "#0B2A1F"
  primary-text: "#B33D00"
  secondary: "#FFD23F"
  on-secondary: "#0B2A1F"
  neutral: "#123D2E"
  background: "#EEF1E8"
  background-green: "#123D2E"
  surface: "#FFFFFF"
  surface-green: "#0B2A1F"
  surface-green-raised: "#1A4C39"
  scoreboard: "#082319"
  scoreboard-edge: "#051A12"
  plate: "#103528"
  sunken: "#E2E7DB"
  text: "#123D2E"
  text-on-green: "#EEF1E8"
  text-muted: "#4E6358"
  text-muted-on-green: "#A9BDB2"
  border: "#C9D3C5"
  border-on-green: "#2A6149"
  border-strong: "#123D2E"
  caught: "#1E5A40"
  on-caught: "#C4F2D6"
  caught-count: "#8FE0AE"
  foul: "#FFD23F"
  on-foul: "#0B2A1F"
  slipped: "#FF6A1F"
  on-slipped: "#0B2A1F"
  focus: "#123D2E"
  focus-on-green: "#FFD23F"
typography:
  display-xl:
    fontFamily: "Big Shoulders"
    fontSize: 136px
    fontWeight: 800
    lineHeight: 125px
    letterSpacing: -0.005em
  display-l:
    fontFamily: "Big Shoulders"
    fontSize: 72px
    fontWeight: 800
    lineHeight: 68px
  display-m:
    fontFamily: "Big Shoulders"
    fontSize: 36px
    fontWeight: 800
    lineHeight: 36px
  score:
    fontFamily: "Big Shoulders"
    fontSize: 46px
    fontWeight: 800
    lineHeight: 46px
  board-label:
    fontFamily: "Big Shoulders"
    fontSize: 20px
    fontWeight: 700
    lineHeight: 20px
    letterSpacing: 0.06em
  time:
    fontFamily: "Big Shoulders"
    fontSize: 30px
    fontWeight: 800
    lineHeight: 30px
  title:
    fontFamily: "Atkinson Hyperlegible Next"
    fontSize: 21px
    fontWeight: 700
    lineHeight: 27px
  lead:
    fontFamily: "Atkinson Hyperlegible Next"
    fontSize: 21px
    fontWeight: 400
    lineHeight: 32px
  body:
    fontFamily: "Atkinson Hyperlegible Next"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-s:
    fontFamily: "Atkinson Hyperlegible Next"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  caption:
    fontFamily: "Atkinson Hyperlegible Next"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  button:
    fontFamily: "Atkinson Hyperlegible Next"
    fontSize: 17px
    fontWeight: 700
    lineHeight: 20px
  chat:
    fontFamily: "Atkinson Hyperlegible Mono"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 23px
  chat-user:
    fontFamily: "Atkinson Hyperlegible Mono"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 23px
  term:
    fontFamily: "Atkinson Hyperlegible Mono"
    fontSize: 17px
    fontWeight: 600
    lineHeight: 24px
rounded:
  none: 0px
  plate: 3px
  sm: 4px
  md: 6px
  lg: 10px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 56px
  3xl: 96px
  4xl: 128px
  gutter: 56px
  margin-desktop: 64px
  margin-phone: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 52px
    padding: 24px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-line-on-green:
    backgroundColor: "{colors.background-green}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 52px
    padding: 24px
  button-line-on-chalk:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 52px
    padding: 24px
  button-green:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 18px
  button-small:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 18px
  tag-practice:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    height: 28px
    padding: 10px
  scoreboard:
    backgroundColor: "{colors.scoreboard}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.board-label}"
    padding: 28px
  scoreboard-tag:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.board-label}"
    rounded: "{rounded.plate}"
    padding: 12px
  scoreboard-label:
    textColor: "{colors.text-muted-on-green}"
    typography: "{typography.board-label}"
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.score}"
    rounded: "{rounded.plate}"
    width: 44px
    height: 60px
  plate-raid:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.slipped}"
    typography: "{typography.score}"
    rounded: "{rounded.plate}"
    width: 44px
    height: 60px
  plate-fouls:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.foul}"
    typography: "{typography.score}"
    rounded: "{rounded.plate}"
    width: 44px
    height: 60px
  practice-chat:
    backgroundColor: "{colors.surface-green}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.chat}"
    rounded: "{rounded.lg}"
  chat-message:
    textColor: "{colors.text-on-green}"
    typography: "{typography.chat}"
    rounded: "{rounded.md}"
    padding: 12px
  chat-message-hover:
    backgroundColor: "{colors.surface-green-raised}"
    textColor: "{colors.text-on-green}"
  chat-username:
    typography: "{typography.chat-user}"
  chip-caught:
    backgroundColor: "{colors.caught}"
    textColor: "{colors.on-caught}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 8px
  chip-foul:
    backgroundColor: "{colors.foul}"
    textColor: "{colors.on-foul}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 8px
  chip-slipped:
    backgroundColor: "{colors.slipped}"
    textColor: "{colors.on-slipped}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 8px
  coach-notes:
    backgroundColor: "{colors.surface-green}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.body-s}"
    padding: 28px
  rule-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-s}"
    rounded: "{rounded.lg}"
  rule-term:
    textColor: "{colors.text}"
    typography: "{typography.term}"
  state-live:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 9px
  state-ready:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.text}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 9px
  plan-time:
    textColor: "{colors.primary-text}"
    typography: "{typography.time}"
  linescore:
    backgroundColor: "{colors.scoreboard}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.board-label}"
    rounded: "{rounded.lg}"
    padding: 28px
  nav:
    backgroundColor: "{colors.background-green}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.body-s}"
    height: 88px
  hero:
    backgroundColor: "{colors.background-green}"
    textColor: "{colors.text-on-green}"
    typography: "{typography.display-xl}"
  section-chalk:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: 128px
  section-heading:
    textColor: "{colors.text}"
    typography: "{typography.display-l}"
  footer:
    backgroundColor: "{colors.background-green}"
    textColor: "{colors.text-muted-on-green}"
    typography: "{typography.caption}"
    padding: 32px
  scoreboard-rail:
    backgroundColor: "{colors.scoreboard-edge}"
    height: 3px
  coach-count:
    textColor: "{colors.caught-count}"
    typography: "{typography.time}"
  house-rule:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-muted}"
    typography: "{typography.body}"
    padding: 24px
  house-rule-divider:
    backgroundColor: "{colors.border-strong}"
    height: 2px
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  divider-on-green:
    backgroundColor: "{colors.border-on-green}"
    height: 1px
  focus-ring:
    textColor: "{colors.focus}"
    width: 3px
  focus-ring-on-green:
    textColor: "{colors.focus-on-green}"
    width: 3px
  alarm-bar:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.display-m}"
    height: 80px
    padding: 36px
---
# ModScrim design system

## Overview

ModScrim runs raid drills for Twitch mod teams: a fake raid lands in a practice chat that only the team can see, the mods clear it against the clock, and the blocked terms and AutoMod settings that would have stopped it go live on the real channel with one-click undo.

The look comes from the practice ground, not from gaming UI. Three materials carry it:

- **The practice field.** Wall green (#123D2E) is the ground, with chalk (#EEF1E8) for type and the occasional pitch marking: a halfway line, a centre circle. Explanations live on chalk pages that read like a coach's tactics board.
- **The manual scoreboard.** Results sit on dark green boards with hand-hung plates, the kind ballparks still turn by hand. Numbers are big and condensed (Big Shoulders). Leading zeros are blank plates, not zeros.
- **The whistle.** The mark is a Thunderer-style coach's whistle with chat's typing dots inside, hung on a lanyard ring. Whistle orange (#FF6A1F) is the one action colour.

Practice is always labelled. Card yellow (#FFD23F) marks anything that is practice: the practice chat tag, the scoreboard's Practice plate, the stream alarm bar. Attack text never appears without that label nearby.

The boldness is spent in one place: the scoreboard and the practice chat. Everything around them stays quiet: chalk pages, plain headings, real copy.

## Colors

Two grounds, one action colour, one label colour, three outcome colours.

| Role | Token | Hex | Use |
| --- | --- | --- | --- |
| Wall green | `neutral`, `background-green`, `text` | #123D2E | Hero, nav, closing band; also the ink colour on chalk |
| Dugout | `surface-green` | #0B2A1F | Practice chat and coach's notes panels |
| Scoreboard | `scoreboard` | #082319 | Scoreboards and linescores |
| Plate | `plate` | #103528 | Number plates |
| Chalk | `background`, `text-on-green` | #EEF1E8 | Light ground; text on green |
| Paper | `surface` | #FFFFFF | Cards on chalk (rule card, play diagram) |
| Whistle orange | `primary` | #FF6A1F | The mark, the main button, raid numbers, Slipped chips |
| Orange text | `primary-text` | #B33D00 | Orange as text on chalk (drill-plan times) |
| Card yellow | `secondary` | #FFD23F | Practice labels, Foul chips, foul numbers, focus ring on green |
| Moss | `text-muted` | #4E6358 | Secondary text on chalk |
| Muted on green | `text-muted-on-green` | #A9BDB2 | Secondary text and scoreboard labels on green |

Contrast (WCAG 2.2): chalk on wall green 10.6:1; moss on chalk 5.7:1; deep green on whistle orange 5.4:1 (button labels); orange-700 on chalk 5.1:1; orange numbers on plates 4.7:1; deep green on card yellow 10.7:1. Whistle orange on chalk is only 2.5:1, so on chalk it is used for the mark and large shapes, never for text or thin lines.

Outcome colours each have one meaning and always come with a word:

- **Caught** (#1E5A40 with #C4F2D6): spam your team removed.
- **Slipped** (whistle orange with deep green): spam still up at the final whistle.
- **Foul** (card yellow with deep green): a regular removed by mistake. It is literally the yellow card.

No Twitch purple anywhere, including hover states and illustrations.

## Typography

- **Big Shoulders** (Patric King, Chicago Design System; variable `wght` 100–900, `opsz` 10–72). Headlines, scoreboard numbers, drill-plan times. Use weight 800 at `opsz` 72. Sentence case for headlines. All caps only on scoreboard labels (Mods, Raid, Fouls, Clock, Practice), where it is the object's own lettering.
- **Atkinson Hyperlegible Next** (Braille Institute, 2025; `wght` 200–800). Body text, buttons, navigation, labels.
- **Atkinson Hyperlegible Mono** (Braille Institute, 2025). The practice chat and blocked terms only. It was drawn so that look-alike characters stay distinct, which is exactly the trick raid spam relies on: `v1ews`, `f0ll0w`, `0O 1lI` read as different characters at a glance. Do not use it for decorative labels.

Scale (px): 136 / 72 / 36 for display, 46 for plates, 30 for times, 21 / 18 / 16 / 14 for text. Headlines run at 0.92–0.95 line height and use `text-wrap: balance`. Body text stays under 80 characters per line (about 34em at 18px).

## Layout

- 12-column grid, 1440px max width, 64px side margins on desktop, 32px on tablet, 16px on phone; 56px gutters between major columns.
- Left aligned throughout. Nothing is centred except the devpost and stacked-logo compositions.
- Page order on the home page: green hero with the playable drill → chalk pages (how a drill runs, Twitch grading and rules, house rules) → green closing band with footer. Inner pages open with a green header band (title and lead) and continue on chalk; product screens (console, mod view, overlay, report) sit on dugout green throughout.
- Section headings sit beside or above their content without eyebrow labels. Vary the arrangement per section: heading beside a lead paragraph, heading above a timeline, heading as a sticky sidebar for the house rules.
- Spacing scale: 4, 8, 12, 16, 24, 32, 40, 56, 64, 96, 128. Sections on chalk are 128px apart on desktop, 88px on phone.

## Elevation & Depth

Flat by default. Depth comes from material, not blur:

- Plates have a 2px inner bottom shadow and two small hanger holes, like hung tin numbers.
- The drill board on green has a 1px dark outline and one long soft shadow (`0 24px 48px -24px rgba(0,0,0,.5)`), so it reads as an object on the wall.
- Cards on chalk use a 1px #C9D3C5 outline and no shadow.

## Shapes

- Plates 3px, chips and tags 4px, buttons and message rows 6px, panels 10px. No pills, no fully rounded buttons.
- The whistle is the only round shape in the system, which keeps it recognisable.
- Diagrams use football notation: circles for raid accounts, crosses for your mods, dotted routes for messages, a short bar where a route is blocked, an arrowhead where one gets through.

## Components

- **Buttons.** Orange primary (52px, 24px padding) for the one main action in a view: "Start a drill", "Start the 30-second drill", "Run it again". Outline buttons in chalk on green or wall green on chalk for the second action. Wall-green filled buttons for in-card actions on chalk ("Push to channel"). Labels say exactly what happens and keep their name through the flow: "Push to channel" leads to a Live state, "Undo" leads to Undone.
- **Scoreboard.** Practice plate in card yellow, then Mods, Raid, Fouls and the clock pushed right. Raid numbers in orange, fouls in yellow. On phones the clock moves up beside the Practice plate and the three scores sit in a row below.
- **Practice chat.** Dugout panel with a Practice chat tag and the line "Nothing here is posted to Twitch." Messages are real buttons (click or Enter to delete). Removed spam is struck through at 50% with a Caught chip; removed regulars dim with a "Foul: regular" chip; spam still up at the final whistle gets Slipped. Scrolling up pauses the feed and shows "Chat paused. Jump to newest".
- **Coach's notes.** Beside the chat: what to watch for before and during the drill (with live counts like 3/5), then the result and the blocked terms that would have caught what slipped.
- **Drill plan.** A vertical line with real clock times (0:00, 0:10, 0:15, 1:45, 2:00) in orange-700 Big Shoulders. Only use times when the content really is a sequence.
- **Linescore.** One column per drill, rows for Slipped, Fouls and Clear time, Friday's column on a lighter plate. Mark sample numbers as sample.
- **Rule card.** White card with each drafted rule, its kind, a Live or Ready state, and Undo or Push to channel.
- **Console stepper.** Six steps across the top in order (Read filters, Configure, Run the drill, Twitch grades, Fix the rules, Fresh wave and push), numbered because they are a sequence; the current step has an orange number and underline. A status strip shows the Twitch connection, chat-log size and grading quota.
- **Engine label.** Every grade names its engine: "graded by Twitch" (filled) or "local estimate" (outline).
- **Alarm bar.** 80px card-yellow OBS bar: "Mod practice drill in progress", a note that the spam on screen is fake, the clock and the wordmark.

## Do's and Don'ts

Do:
- Label every screen that shows attack text as practice, in card yellow.
- Let the scoreboard and the practice chat be the loud parts; keep chalk pages calm.
- Write plain, specific copy from the moderator's side: "Click a message to delete it", "Push to channel", "Chat paused".
- Use Atkinson Hyperlegible Mono wherever someone has to tell look-alike characters apart.
- Keep at least one mark-height of clear space around the logo, and use the small cut (no ring, no window) below 48px.

Don't:
- Use Twitch purple, Twitch's glitch logo, or wording that suggests ModScrim is made or endorsed by Twitch.
- Post or render attack text anywhere outside a labelled practice chat, including marketing screenshots.
- Add eyebrow labels, middle-dot meta strings, arrows on buttons, or a coloured single word in a headline.
- Use LED dot-matrix, glitch or neon effects. The scoreboard is hand-hung, not electronic.
- Put orange text on chalk (use orange-700), or caps outside the scoreboard.
- Fade in every section on scroll. Motion answers actions: plates flip when a number changes, messages slide in when they post.

## Responsive Behavior

- ≥1100px: hero headline beside the lead (8/4 columns); drill board with chat (7) and coach's notes (5).
- 900–1100px: single-column headers; drill board keeps its two panels.
- ≤900px: nav links hide behind the single Start a drill button; scoreboard becomes a 3-column grid; coach's notes stack under the chat.
- ≤640px: 16px margins; hero headline 60px in two balanced lines; full-width buttons; chat messages wrap inline; linescore scrolls sideways inside its board.
- Respect `prefers-reduced-motion`: no plate flips, no message slide-in, no smooth scrolling.

## Motion

- Plate flip: 220ms rotateX from −70° when a number changes.
- Message in: 180ms, 8px rise and fade, only for new messages during a drill.
- Buttons: 120ms colour change, 1px press. Nothing moves on page load or on scroll.

## Voice and copy

A calm coach. Short sentences, active verbs, the moderator's vocabulary (delete, time out, ban, blocked terms, AutoMod). Name the thing on screen: "practice chat", "final whistle", "slipped through", "foul". Results state what happened and what to do next: "4 slipped through. These rules would have caught them." Never make light of real harassment, and never use slurs, even in fake raids.

## Logo

- **Mark:** whistle barrel, flat mouthpiece, bevelled sound window, lanyard ring, three typing dots knocked out.
- **Wordmark:** "ModScrim" in Big Shoulders 800, outlined, tracking +4/1000.
- **Lockups:** horizontal, horizontal with tagline ("Raid drills for your mod team"), stacked, mark, small mark, wordmark.
- **Tones:** `color` (orange mark, green wordmark) on chalk or white; `reverse` (orange mark, chalk wordmark) on green; `green` one-colour on light; `white` one-colour on green or orange; `black` for print.
- **Small cut:** below 48px drop the ring and window and enlarge the dots; at 16px drop the dots too.
- **App icons:** orange whistle on wall green (primary), deep green whistle on orange (alternate).

## Inspirations

- **Hand-turned ballpark scoreboards**, such as the one at Wrigley Field in Chicago: dark green boards, hung number plates, blank plates for empty digits. Big Shoulders comes from the same city's design system.
- **Coaches' tactics boards and play diagrams**: circles and crosses, dotted routes, bars for blocks. The drill explainer is drawn as a play.
- **The Acme Thunderer whistle**: barrel, mouthpiece, window and ring, simplified into the mark.
- **Braille Institute's Atkinson Hyperlegible** family: legibility as a feature, which is the moderator's job too.
- **Twitch's 2019 rebrand by Collins**: the platform plays a support role and lets its communities be the colour. ModScrim borrows the idea, not the purple.

## Agent Prompt Guide

When building ModScrim UI:

1. Load `web/css/tokens.css` and `web/css/components.css`; use `.on-green` for green sections and the default chalk ground elsewhere.
2. Fonts: Big Shoulders (800, `opsz` 72) for headlines and numbers; Atkinson Hyperlegible Next for everything else; Atkinson Hyperlegible Mono only for chat and terms.
3. One orange button per view. Second actions use outline buttons.
4. Any screen with attack text gets a card-yellow Practice tag and the line "Nothing here is posted to Twitch."
5. Scores go on plates (`.ms-plate`), with blank plates for leading zeros. Raid numbers orange, fouls yellow.
6. Outcomes: Caught (mint chip), Slipped (orange chip), Foul (yellow chip). Always show the word, not only the colour.
7. No purple, no gradients, no eyebrow labels, no middle dots in meta lines, no arrows in button labels, no scroll-triggered fades.
8. Copy: sentence case, plain verbs, the moderator's point of view.
