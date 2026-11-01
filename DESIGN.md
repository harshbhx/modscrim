---
name: "ModScrim Practice Field"
description: "Palette-only seed from ModScrim brand kit (brand/DESIGN.md), colours supplied by the user; Impeccable's document command will fill the other sections."
colors:
  # acp:begin tokens (artistic-color-palettes; do not edit between markers)
  bg: "#F3F8F6"
  bg-subtle: "#E4ECE8"
  surface: "#F3F8F6"
  border: "#B7C5BE"
  border-strong: "#7E8D86"
  text: "#27302C"
  text-muted: "#4F5B55"
  accent: "#D96531"
  accent-hover: "#E25D1B"
  on-accent: "#1A211E"
  accent-text: "#8F3A11"
  accent-subtle: "#EFE8E5"
  focus: "#DE5A16"
  action: "#D96531"
  action-hover: "#E25D1B"
  on-action: "#1A211E"
  action-border: "#D96531"
  voice-1: "#FFD23F"
  voice-2: "#123D2E"
  voice-3: "#0B2A1F"
  success: "#1F6836"
  warning: "#BD8432"
  danger: "#C42E2B"
  info: "#3A8DDB"
  # acp:end tokens
---
<!-- acp:seed palette-only; Impeccable's document command will fill the other sections -->

## Colors
<!-- acp:begin colors v1 -->
Custom palette: 5 colours (Wall green, Chalk, Whistle orange, Dugout, Card yellow), composed as a Restrained palette for an Operate surface, with a separately composed dark mode.

Provenance: ModScrim brand kit (brand/DESIGN.md), colours supplied by the user. Credit: ModScrim brand kit (brand/DESIGN.md), colours supplied by the user. Licence: user-supplied.

### Primary

- **Whistle orange Accent** (#D96531 / oklch(0.640 0.160 42.7)): the one solid action colour (light mode); text on it is the near-black neutral.
- **Whistle orange Accent Text** (#8F3A11 / oklch(0.459 0.126 42.5)): links and accent-coloured text on the page.
- **Whistle orange Accent Tint** (#EFE8E5 / oklch(0.936 0.009 44.9)): selected and hover backgrounds, quiet badges.

### Secondary

- **Card yellow Voice** (#FFD23F / oklch(0.879 0.162 90.9)): voice colour 1: the exact plate colour as a region fill (bands, sections, tags); chart marks and icons use voice-1-mark; never the call to action.
- **Wall green Voice** (#123D2E / oklch(0.325 0.055 166.6)): voice colour 2: the exact plate colour as a region fill (bands, sections, tags); chart marks and icons use voice-2-mark; never the call to action.

### Tertiary

- **Dugout Voice** (#0B2A1F / oklch(0.258 0.042 166.6)): voice colour 3.
- **Success** (#1F6836 / oklch(0.459 0.107 150.2)): status colour, from the default seeds (no palette colour fits this meaning).
- **Warning** (#BD8432 / oklch(0.656 0.119 72.4)): status colour, from the default seeds (no palette colour fits this meaning).
- **Danger** (#C42E2B / oklch(0.540 0.187 27.0)): status colour, from the default seeds (no palette colour fits this meaning).
- **Info** (#3A8DDB / oklch(0.630 0.142 250.0)): status colour, from the default seeds (no palette colour fits this meaning).

### Neutral

The neutral ramp is tinted with Wall green (chroma capped at 0.03), never plain grey.

- **Page** (#F3F8F6 / oklch(0.975 0.006 170.4)): the page background
- **Surface** (#F3F8F6 / oklch(0.975 0.006 170.4)): cards and panels
- **Subtle Surface** (#E4ECE8 / oklch(0.936 0.010 164.9)): wells, table stripes
- **Divider** (#B7C5BE / oklch(0.811 0.018 164.5)): dividers and quiet borders
- **Control Border** (#7E8D86 / oklch(0.629 0.020 166.0)): borders that carry meaning (inputs, 3:1 against the page)
- **Text** (#27302C / oklch(0.299 0.014 166.7)): body text
- **Muted Text** (#4F5B55 / oklch(0.459 0.018 164.1)): secondary text

### Named Rules

- **The Restrained Rule.** Colour strategy Restrained, mode Operate. Do not mix strategies on one surface.
- **The Proportion Rule.** Screen share: ground and neutrals 85-95%; voice colours 0-5%; accent 2-5%. Proportion targets are this skill's own convention (Impeccable's strategy names, numbers from the skill's shared constants); Wada's plates show equal-area swatches for convenience only.
- **The Accent Restraint Rule.** Accent chroma >= 0.15: accent capped at 5% (Albers 9).
- **The Contrast Floor Rule.** Body and label text 4.5:1, large text 3:1, non-text UI (focus ring, control borders, icons, chart marks) 3:1, measured with WCAG 2 for every pair in both modes; APCA Lc is reported against 75 body, 60 labels, 45 large text and fine detail, 30 solid UI. Region fills (voice and brand colours) keep the exact plate colour: only text placed on them is gated, and each has a -mark step for chart marks and icons.
- **The Action Style Rule.** Primary actions are a solid accent fill with a measured label. The label is forced dark; the fill moves to the nearest step that passes. Use --color-action, --color-action-hover, --color-on-action and --color-action-border.
- **The Composed Dark Rule.** Dark mode is a separately composed ramp (lower chroma, wider dark-end steps), never the light ramp inverted; every pair is re-measured.

#### Token tables

| Token | Light | Dark | Light source | Dark source |
|---|---|---|---|---|
| `--color-bg` | #F3F8F6 | #080F0C | neutral-50 | neutral-950 |
| `--color-bg-subtle` | #E4ECE8 | #121A17 | neutral-100 | neutral-900 |
| `--color-surface` | #F3F8F6 | #121A17 | neutral-50 | neutral-900 |
| `--color-surface-hover` | #D1DCD7 | #1F2925 | neutral-200 | neutral-800 |
| `--color-border-subtle` | #D1DCD7 | #1F2925 | neutral-200 | neutral-800 |
| `--color-border` | #B7C5BE | #2F3B36 | neutral-300 | neutral-700 |
| `--color-border-strong` | #7E8D86 | #5C6A64 | neutral-500 | neutral-500 |
| `--color-text` | #27302C | #EEF3F1 | neutral-900 | neutral-50 |
| `--color-text-muted` | #4F5B55 | #B9C4BF | neutral-700 | neutral-200 |
| `--color-accent` | #D96531 | #FF6A1F | adjusted from accent-600 | accent-300 |
| `--color-on-accent` | #1A211E | #080F0C | neutral-950 | neutral-950 |
| `--color-accent-hover` | #E25D1B | #D8B9AD | adjusted from accent-500 | accent-200 |
| `--color-accent-text` | #8F3A11 | #FF6A1F | accent-700 | accent-300 |
| `--color-accent-subtle` | #EFE8E5 | #26130B | accent-100 | accent-900 |
| `--color-focus` | #DE5A16 | #FF6A1F | accent-500 | accent-300 |
| `--color-voice-1` | #FFD23F | #FFD23F | voice-1-200 | voice-1-100 |
| `--color-voice-1-mark` | #A58517 | #FFD23F | voice-1-500 | voice-1-100 |
| `--color-voice-1-subtle` | #EFE9DA | #1C180B | voice-1-100 | voice-1-900 |
| `--color-voice-1-text` | #6A5612 | #B3A06B | voice-1-700 | voice-1-300 |
| `--color-on-voice-1` | #1A211E | #080F0C | neutral-950 | neutral-950 |
| `--color-voice-2` | #123D2E | #123D2E | voice-2-900 | voice-2-700 |
| `--color-voice-2-mark` | #123D2E | #3B735D | voice-2-900 | voice-2-500 |
| `--color-voice-2-subtle` | #DEEEE6 | #101B16 | voice-2-100 | voice-2-900 |
| `--color-voice-2-text` | #2A6550 | #7DAE99 | voice-2-700 | voice-2-300 |
| `--color-on-voice-2` | #FFFFFF | #FFFFFF | white | white |
| `--color-voice-3` | #0B2A1F | #0B2A1F | voice-3-950 | voice-3-800 |
| `--color-voice-3-mark` | #0B2A1F | #3C735E | voice-3-950 | voice-3-500 |
| `--color-voice-3-subtle` | #DEEEE7 | #101B16 | voice-3-100 | voice-3-900 |
| `--color-voice-3-text` | #2C644F | #7EAE99 | voice-3-700 | voice-3-300 |
| `--color-on-voice-3` | #FFFFFF | #FFFFFF | white | white |
| `--color-success` | #1F6836 | #367147 | success-700 | adjusted from success-600 |
| `--color-success-subtle` | #DEEFE1 | #0E1C11 | success-100 | success-900 |
| `--color-success-text` | #1F6836 | #77B283 | success-700 | success-300 |
| `--color-on-success` | #FFFFFF | #FFFFFF | white | white |
| `--color-warning` | #BD8432 | #BF9A6C | adjusted from warning-400 | warning-300 |
| `--color-warning-subtle` | #EFE8E1 | #1F170C | warning-100 | warning-900 |
| `--color-warning-text` | #764F15 | #BF9A6C | warning-700 | warning-300 |
| `--color-on-warning` | #1A211E | #080F0C | neutral-950 | neutral-950 |
| `--color-danger` | #C42E2B | #CB5C53 | danger-600 | danger-400 |
| `--color-danger-subtle` | #EEE8E7 | #28100E | danger-100 | danger-900 |
| `--color-danger-text` | #992B27 | #CE8F87 | danger-700 | danger-300 |
| `--color-on-danger` | #FFFFFF | #080F0C | white | neutral-950 |
| `--color-info` | #3A8DDB | #36699B | info-500 | info-500 |
| `--color-info-subtle` | #E6EAEE | #0E1924 | info-100 | info-900 |
| `--color-info-text` | #255B8D | #82A5CA | info-700 | info-300 |
| `--color-on-info` | #1A211E | #FFFFFF | neutral-950 | white |
| `--color-action` | #D96531 | #FF6A1F | same as accent | same as accent |
| `--color-action-hover` | #E25D1B | #D8B9AD | same as accent-hover | same as accent-hover |
| `--color-on-action` | #1A211E | #080F0C | same as on-accent | same as on-accent |
| `--color-action-border` | #D96531 | #FF6A1F | same as accent | same as accent |

#### Measured contrast

128 pairs measured in light and dark; 124 are gated and all pass (tightest: warning on bg, light, 3.01:1 against 3.0:1). APCA Lc is below its target on 37 pairs; WCAG 2 is the gate.

| Pair | Mode | WCAG 2 | APCA Lc |
|---|---|---|---|
| `text` on `bg` | light | 12.66:1 | 95 |
| `text` on `bg` | dark | 17.28:1 | 99 |
| `text` on `surface` | light | 12.66:1 | 95 |
| `text` on `surface` | dark | 15.79:1 | 98 |
| `text-muted` on `bg` | light | 6.61:1 | 80 |
| `text-muted` on `bg` | dark | 10.8:1 | 69 |
| `text-muted` on `surface` | light | 6.61:1 | 80 |
| `text-muted` on `surface` | dark | 9.88:1 | 68 |
| `accent-text` on `bg` | light | 7.04:1 | 81 |
| `accent-text` on `bg` | dark | 6.77:1 | 48 |
| `on-accent` on `accent` | light | 4.57:1 | 39 |
| `on-accent` on `accent` | dark | 6.77:1 | 50 |
| `accent` on `bg` | light | 3.34:1 | 58 |
| `accent` on `bg` | dark | 6.77:1 | 48 |
| `focus` on `bg` | light | 3.51:1 | 59 |
| `focus` on `bg` | dark | 6.77:1 | 48 |
| `border-strong` on `bg` | light | 3.24:1 | 57 |
| `border-strong` on `bg` | dark | 3.41:1 | 23 |

Flags to design around (see design/palette.json): cvd, state_sibling, vanishing, vibrating (12 findings). Do not rely on colour alone to tell the accent from status colours.

#### Adjustments

Lightness-only changes made to pass the gate (hue kept):

- `accent-hover` (light): #DE5A16 to #E25D1B, L 0.6302 to 0.6406, ratio 4.36:1 to 4.54:1 against `on-accent`; reason: WCAG gate.
- `warning` (light): #D29848 to #BD8432, L 0.7206 to 0.656, ratio 2.35:1 to 3.01:1 against `bg`; reason: WCAG gate.
- `success` (dark): #205B32 to #367147, L 0.4212 to 0.497, ratio 2.4:1 to 3.33:1 against `bg`; reason: WCAG gate.
- `accent` (light): #B74501 to #D96531, L 0.5398 to 0.6398, ratio 5.06:1 to 3.34:1 against `bg`; reason: WCAG gate.

#### Keep in sync

Do not change a colour here without re-validating: edit nothing between the acp markers by hand. Change the palette or strategy, then re-run `scripts/handoff.py` (idempotent). If Impeccable's document step asks refresh, overwrite or merge, choose merge and re-run it.

#### Hand-off files

- Tokens: `design/tokens.css` (primitives, then semantic `--color-*`, light, dark and `[data-theme=dark]`).
- Source of truth: `design/palette.json` (provenance, ramps, contrast, adjustments).

#### Neighbour map

- Taste: `--bg` #F3F8F6, `--surface` #E4ECE8, `--ink` #27302C, `--muted` #4F5B55, `--accent` #D96531 (the one accent), `--accent-ink` #1A211E. Run Taste with `--keep palette`; pass `--allow palette-purple` if the palette has violet or indigo, and expect its inspector to question a cream plus terracotta ground. With Taste loaded the stricter numbers win: accent < 5%, ground <= 90%, separate surfaces by lightness, not lines.
- UI/UX Pro Max: `--color-primary` and `--color-accent` #D96531, `--color-background` #F3F8F6, `--color-foreground` #27302C, `--color-card` #F3F8F6, `--color-muted-foreground` #4F5B55, `--color-border` #B7C5BE, `--color-destructive` #C42E2B, `--color-ring` #DE5A16. Keep its pattern and type output, take colours from `design/tokens.css`; never edit its MASTER.md without consent.
- interface-design: `--foreground`, `--secondary`, `--muted`, `--faint`, `--accent` resolve to the semantic tokens in the alias block of the CSS file.
- Theme Factory custom theme, colour bullets: Whistle orange #D96531 (accent); Card yellow #FFD23F (voice); Wall green #123D2E (voice); Dugout #0B2A1F (voice); Wall green-tinted neutrals #F3F8F6 to #27302C.
<!-- acp:end colors -->
