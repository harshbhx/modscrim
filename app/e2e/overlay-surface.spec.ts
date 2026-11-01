import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import {
  mockOverlay,
  mockOverlayFixtureSocket,
  mockOverlaySocket,
  overlayFrames,
  OVERLAY_KEY,
  OVERLAY_LONG,
  OVERLAY_SHORT,
  type OverlayFixture
} from './lib/mock-api';

/**
 * Two states. Without a socket the overlay renders nothing (role is never
 * 'overlay'), so that empty state is screenshotted as a baseline. With
 * `page.routeWebSocket` standing in for the Worker, the overlay renders the live
 * drill and the after-action card from validated redacted frames only: lines
 * carry a length, never text (AGENTS.md rule 2, SRS §8.3).
 */

const CHANNEL = 'pixelpanda_tv';
const OVERLAY_URL = `/overlay/${CHANNEL}?key=surface-test`;
type State = 'empty' | 'live' | 'report';

async function prepare(page: Page, state: State): Promise<void> {
  await mockOverlay(page, CHANNEL);
  if (state !== 'empty') await mockOverlaySocket(page, overlayFrames(state === 'report'));
}

test.describe('overlay surface, empty (no WebSocket)', () => {
  test('loads without throwing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await prepare(page, 'empty');
    await page.goto(OVERLAY_URL);
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});

test.describe('overlay surface, redacted payloads over a mocked socket', () => {
  test('renders redacted lines and numbers, never readable text', async ({ page }) => {
    await prepare(page, 'report');
    await page.goto(OVERLAY_URL);

    const stage = page.getByRole('main', { name: 'OBS practice overlay' });
    await expect(stage).toBeVisible();
    await expect(page.getByLabel('Hidden practice message')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Practice scoreboard' })).toContainText('Mod 1');
    await expect(page.getByRole('status')).toContainText('Drill complete');

    const text = (await stage.innerText()).toLowerCase();
    expect(text).not.toMatch(/https?:|\.invalid|slurx|slury|▇/);
  });
});

for (const state of ['empty', 'live', 'report'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    for (const size of WIDTHS) {
      test(`captures ${state} at ${size.name}px in ${scheme}`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await prepare(page, state);
        await page.goto(OVERLAY_URL);
        if (state === 'empty') await page.waitForTimeout(500);
        else await expect(page.getByLabel('Hidden practice message').first()).toBeVisible();

        // The empty state keeps its original file name so existing artifact links still match.
        const name = state === 'empty' ? 'overlay' : `overlay-${state}`;
        await page.screenshot({ path: `${SHOTS}/${name}-${size.name}-${scheme}.png`, fullPage: true });
        await context.close();
      });
    }
  }
}

const STAGE = { width: 1920, height: 1080 };

async function openOverlay(browser: import('@playwright/test').Browser, fixture: OverlayFixture, key: string = OVERLAY_KEY, size = STAGE) {
  const context = await browser.newContext({ viewport: size, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await context.newPage();
  await mockOverlay(page, CHANNEL);
  await mockOverlayFixtureSocket(page, fixture);
  await page.goto(`/overlay/${CHANNEL}?key=${key}`);
  return { page, context };
}

type Box = { x: number; y: number; width: number; height: number };

async function boxes(page: Page): Promise<Record<string, Box | null>> {
  const out: Record<string, Box | null> = {};
  for (const sel of ['.overlay-alarm', '.overlay-dock', '.overlay-chat', '.overlay-scoreboard']) {
    out[sel] = await page.locator(sel).first().boundingBox();
  }
  return out;
}

/** The same drill with long names and big numbers: same row counts, different text. */
const OVERLAY_SHORT_STRESS: OverlayFixture = {
  status: 'running',
  lines: OVERLAY_SHORT.lines.map((line, i) => ({ ...line, user: `a_streamer_with_a_very_long_viewer_name_${i}`, len: 190 })),
  mods: OVERLAY_SHORT.mods.map((mod, i) => ({
    ...mod, name: `A moderator with an extremely long display name number ${i + 1}`, caught: 1000 + i * 111, falseBans: 100 + i, avgReactionMs: 12_345
  })),
  slipped: 12_345
};

/** A busy drill: eight lines, three mods, two slipped. */
const OVERLAY_LIVE: OverlayFixture = {
  status: 'running',
  lines: [
    { user: 'ava_v', len: 24, state: 'acted' },
    { user: 'bot_17', len: 62, state: 'slipped' },
    { user: 'cleo', len: 31, state: 'acted' },
    { user: 'dax', len: 88, state: 'acted' },
    { user: 'eli', len: 40, state: 'acted' },
    { user: 'fern', len: 120, state: 'slipped' },
    { user: 'gus_tv', len: 54, state: 'open' },
    { user: 'hana', len: 72, state: 'open' }
  ],
  mods: [
    { name: 'Mod 1', isSim: false, caught: 9, falseBans: 1, avgReactionMs: 1800 },
    { name: 'Mod 2', isSim: false, caught: 6, falseBans: 0, avgReactionMs: 2400 },
    { name: 'Kai', isSim: true, caught: 4, falseBans: 2, avgReactionMs: 3100 }
  ],
  slipped: 2
};

/** Connected, no drill running yet: only the alarm bar and an empty scoreboard. */
const OVERLAY_IDLE: OverlayFixture = {
  status: 'ended',
  lines: [],
  mods: [{ name: 'Mod 1', isSim: false, caught: 0, falseBans: 0, avgReactionMs: null }],
  slipped: 0
};

const REPORT_CARD = {
  attacksShown: 20, slipped: 3, mods: [], termsPushed: 4,
  grade: { passed: 7, total: 20, engine: 'twitch' as const }, fresh: { before: 14, after: 19, total: 20 }
};

test.describe('overlay live render (redacted fixtures, 1920x1080)', () => {
  test('uses no hardcoded colour in overlay.css', () => {
    const css = readFileSync('app/src/styles/overlay.css', 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    // solid panels only: older OBS browsers lack colour-mix and alpha colours would break readability
    expect(css).not.toMatch(/color-mix|rgba?\(|hsla?\(/);
  });

  test('a wrong key renders nothing at all', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, OVERLAY_SHORT, 'not-the-key');
    await page.waitForTimeout(1500);
    await expect(page.locator('.overlay-viewport')).toHaveCount(0);
    expect((await page.locator('body').innerText()).trim()).toBe('');
    await context.close();
  });

  test('a missing key renders nothing at all', async ({ browser }) => {
    const context = await browser.newContext({ viewport: STAGE });
    const page = await context.newPage();
    await mockOverlay(page, CHANNEL);
    await mockOverlayFixtureSocket(page, OVERLAY_SHORT);
    await page.goto(`/overlay/${CHANNEL}`);
    await page.waitForTimeout(1000);
    await expect(page.locator('.overlay-viewport')).toHaveCount(0);
    expect((await page.locator('body').innerText()).trim()).toBe('');
    await context.close();
  });

  test('the overlay DOM holds no readable attack text and no terms (S-05)', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, OVERLAY_SHORT);
    await expect(page.locator('.overlay-chat-line')).toHaveCount(OVERLAY_SHORT.lines.length);
    // every hidden message is an empty bar: no text node, no child element carrying text
    for (const bar of await page.locator('.overlay-redacted').all()) {
      expect((await bar.textContent())?.trim() ?? '').toBe('');
    }
    // a chat line is the user name plus an outcome glyph, nothing else
    for (const [i, line] of OVERLAY_SHORT.lines.entries()) {
      const text = ((await page.locator('.overlay-chat-line').nth(i).textContent()) ?? '').replace(/\s+/g, '');
      expect(text.startsWith(line.user)).toBe(true);
      expect(text.length - line.user.length).toBeLessThanOrEqual(1);
    }
    const html = await page.content();
    expect(html).not.toMatch(/\.invalid|slurx|slury|▇|segments|reveal/i);
    await context.close();
  });

  test('the dock is content-sized: no dead area, chat stacked on the scoreboard', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, OVERLAY_LIVE);
    await expect(page.locator('.overlay-chat-line').first()).toBeVisible();
    const b = await boxes(page);
    const dock = b['.overlay-dock']!;
    const chat = b['.overlay-chat']!;
    const board = b['.overlay-scoreboard']!;
    // the dock hugs its two panels: the chat starts at the top, the scoreboard ends at the bottom
    expect(Math.abs(chat.y - dock.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(board.y + board.height - (dock.y + dock.height))).toBeLessThanOrEqual(1);
    // and the gap between the panels is the 12 px stack gap, so nothing floats far from the scoreboard
    expect(Math.abs(board.y - (chat.y + chat.height) - 12)).toBeLessThanOrEqual(1);
    // the chat is wide enough to read and starts well above y=600
    expect(chat.width).toBeGreaterThanOrEqual(560);
    expect(chat.y).toBeLessThan(600);
    // the dock never reaches up into the alarm bar
    const alarm = b['.overlay-alarm']!;
    expect(dock.y).toBeGreaterThanOrEqual(alarm.y + alarm.height);
    await context.close();
  });

  test('the scoreboard stays put while chat lines arrive, and the busiest drill clears the alarm bar', async ({ browser }) => {
    const idle = await openOverlay(browser, { ...OVERLAY_LIVE, lines: OVERLAY_LIVE.lines.slice(0, 1) });
    await expect(idle.page.locator('.overlay-scoreboard')).toBeVisible();
    const few = (await boxes(idle.page))['.overlay-scoreboard'];
    await idle.context.close();
    const busy = await openOverlay(browser, OVERLAY_LONG);
    await expect(busy.page.locator('.overlay-scoreboard')).toBeVisible();
    const b = await boxes(busy.page);
    await busy.context.close();
    // same mods in both fixtures? no: only the bottom edge and left edge are fixed by design
    expect(b['.overlay-scoreboard']!.y + b['.overlay-scoreboard']!.height).toBe(few!.y + few!.height);
    expect(b['.overlay-scoreboard']!.x).toBe(few!.x);
    expect(b['.overlay-dock']!.y).toBeGreaterThanOrEqual(b['.overlay-alarm']!.y + b['.overlay-alarm']!.height);
  });

  test('longer names and bigger numbers move no panel', async ({ browser }) => {
    const a = await openOverlay(browser, OVERLAY_SHORT);
    await expect(a.page.locator('.overlay-scoreboard')).toBeVisible();
    const before = await boxes(a.page);
    await a.context.close();
    const b = await openOverlay(browser, OVERLAY_SHORT_STRESS);
    await expect(b.page.locator('.overlay-scoreboard')).toBeVisible();
    const after = await boxes(b.page);
    await b.context.close();
    expect(after).toEqual(before);
    for (const box of Object.values(before)) expect(box).not.toBeNull();
  });

  test('the ground stays transparent and nothing draws outside the 64 px safe area', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, { ...OVERLAY_LONG, report: REPORT_CARD });
    await expect(page.locator('.overlay-alarm')).toBeVisible();
    await expect(page.locator('.overlay-report')).toBeVisible();
    for (const sel of ['html', 'body', '#root', '.overlay-viewport', '.overlay-stage']) {
      const bg = await page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg, sel).toBe('rgba(0, 0, 0, 0)');
    }
    for (const sel of ['.overlay-alarm', '.overlay-dock', '.overlay-scoreboard', '.overlay-chat', '.overlay-report']) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box!.x, sel).toBeGreaterThanOrEqual(64);
      expect(box!.y, sel).toBeGreaterThanOrEqual(64);
      expect(box!.x + box!.width, sel).toBeLessThanOrEqual(STAGE.width - 64);
      expect(box!.y + box!.height, sel).toBeLessThanOrEqual(STAGE.height - 64);
    }
    await context.close();
  });

  test('the after-action poster shows the grade as the hero and the fresh-wave proof', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, { ...OVERLAY_SHORT, report: REPORT_CARD });
    const report = page.locator('.overlay-report');
    await expect(report).toBeVisible();
    await expect(report).toContainText('Drill complete');
    await expect(report).toContainText('7 of 20 attack lines would get past your filters');
    await expect(report).toContainText('Terms pushed to Twitch');
    await expect(report).toContainText('Attacks slipped through');
    await expect(report).toContainText('14 / 20');
    await expect(report).toContainText('19 / 20');
    // the poster sits in the free area, never on top of the dock
    const rb = (await report.boundingBox())!;
    const db = (await page.locator('.overlay-dock').boundingBox())!;
    expect(rb.x).toBeGreaterThanOrEqual(db.x + db.width);
    await context.close();
  });

  test('readable on a dark and on a bright backdrop: every panel is solid', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, OVERLAY_LIVE);
    await expect(page.locator('.overlay-chat-line').first()).toBeVisible();
    for (const sel of ['.overlay-chat', '.overlay-scoreboard', '.overlay-alarm', '.overlay-chat-line']) {
      const bg = await page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);
      // fully opaque rgb(), never rgba()
      expect(bg, sel).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    }
    await context.close();
  });
});

const BACKDROPS = {
  // a dark game scene: moody gradient, a bright light source and a lit horizon
  dark: 'radial-gradient(circle at 78% 30%, #8fb8ff 0 6%, transparent 22%), linear-gradient(180deg, #2a3350 0%, #3c3250 55%, #1b1b24 100%)',
  // a bright scene: sky, snow and a washed-out sun, the worst case for light text on glass
  bright: 'radial-gradient(circle at 30% 20%, #ffffff 0 12%, transparent 40%), linear-gradient(180deg, #cfe6ff 0%, #f6f1d8 60%, #ffffff 100%)'
} as const;

const OBS_SIZES = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1280', width: 1280, height: 720 }
] as const;

const SHOT_SETS: Array<{ name: string; fixture: OverlayFixture }> = [
  { name: 'idle', fixture: OVERLAY_IDLE },
  { name: 'live', fixture: OVERLAY_LIVE },
  { name: 'report', fixture: { ...OVERLAY_LIVE, status: 'ended', report: REPORT_CARD } },
  { name: 'long', fixture: OVERLAY_LONG }
];

test.describe('overlay captures on stream-like and bright backdrops', () => {
  for (const size of OBS_SIZES) {
    for (const [backdrop, css] of Object.entries(BACKDROPS)) {
      for (const set of SHOT_SETS) {
        test(`captures ${set.name} at ${size.name} on ${backdrop}`, async ({ browser }) => {
          const { page, context } = await openOverlay(browser, set.fixture, OVERLAY_KEY, size);
          await expect(page.locator('.overlay-alarm')).toBeVisible();
          await page.evaluate((bg) => document.documentElement.style.setProperty('background', bg, 'important'), css);
          await page.screenshot({ path: `${SHOTS}/overlay-v2-${set.name}-${size.name}-${backdrop}.png` });
          await context.close();
        });
      }
    }
  }

  test('captures the transparent ground and a slipped line close up', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, OVERLAY_LIVE);
    await expect(page.locator('.overlay-chat-line').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/overlay-v2-transparent-1920.png`, omitBackground: true });
    await page.evaluate((bg) => document.documentElement.style.setProperty('background', bg, 'important'), BACKDROPS.dark);
    await page.locator('.overlay-dock').screenshot({ path: `${SHOTS}/overlay-v2-dock-1920-dark.png` });
    await context.close();
  });
});
