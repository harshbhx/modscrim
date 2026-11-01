import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockOverlay, mockOverlaySocket, OVERLAY_KEY, OVERLAY_LONG, OVERLAY_SHORT, type OverlayFixture } from './lib/mock-api';

/**
 * The overlay returns null without a live WebSocket (role !== 'overlay'),
 * so we can only verify it loads without error and screenshot the empty
 * state. A full render test requires WebSocket mocking (Playwright
 * page.routeWebSocket) and belongs in an integration spec.
 */

const CHANNEL = 'pixelpanda_tv';

test.describe('overlay surface (no WebSocket)', () => {
  test.beforeEach(async ({ page }) => {
    await mockOverlay(page, CHANNEL);
  });

  test('loads without throwing', async ({ page }) => {
    await page.goto(`/overlay/${CHANNEL}?key=surface-test`);
    await page.waitForTimeout(500);
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    expect(errors).toHaveLength(0);
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const size of WIDTHS) {
      test(`captures at ${size.name}px in ${scheme}`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await mockOverlay(page, CHANNEL);
        await page.goto(`/overlay/${CHANNEL}?key=surface-test`);
        await page.waitForTimeout(500);

        await page.screenshot({
          path: `${SHOTS}/overlay-${size.name}-${scheme}.png`,
          fullPage: true
        });
        await context.close();
      });
    }
  }
});

const STAGE = { width: 1920, height: 1080 };

async function openOverlay(browser: import('@playwright/test').Browser, fixture: OverlayFixture, key: string = OVERLAY_KEY) {
  const context = await browser.newContext({ viewport: STAGE, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await context.newPage();
  await mockOverlay(page, CHANNEL);
  await mockOverlaySocket(page, fixture);
  await page.goto(`/overlay/${CHANNEL}?key=${key}`);
  return { page, context };
}

async function boxes(page: Page): Promise<Record<string, { x: number; y: number; width: number; height: number } | null>> {
  const out: Record<string, { x: number; y: number; width: number; height: number } | null> = {};
  for (const sel of ['.overlay-alarm', '.overlay-activity', '.overlay-chat', '.overlay-scoreboard']) {
    out[sel] = await page.locator(sel).first().boundingBox();
  }
  return out;
}

test.describe('overlay live render (redacted fixtures, 1920x1080)', () => {
  test('uses no hardcoded colour in overlay.css', () => {
    const css = readFileSync('app/src/styles/overlay.css', 'utf8');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
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
    await mockOverlaySocket(page, OVERLAY_SHORT);
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
    expect(html).not.toMatch(/\.invalid|slurx|slury|\u2587|segments|reveal/i);
    await context.close();
  });

  test('longer names and bigger numbers move no panel', async ({ browser }) => {
    const a = await openOverlay(browser, OVERLAY_SHORT);
    await expect(a.page.locator('.overlay-scoreboard')).toBeVisible();
    const before = await boxes(a.page);
    await a.context.close();
    const b = await openOverlay(browser, OVERLAY_LONG);
    await expect(b.page.locator('.overlay-scoreboard')).toBeVisible();
    const after = await boxes(b.page);
    await b.context.close();
    expect(after).toEqual(before);
    for (const box of Object.values(before)) expect(box).not.toBeNull();
  });

  test('the ground stays transparent and nothing draws outside the 64 px safe area', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, OVERLAY_SHORT);
    await expect(page.locator('.overlay-alarm')).toBeVisible();
    for (const sel of ['html', 'body', '#root', '.overlay-viewport', '.overlay-stage']) {
      const bg = await page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg, sel).toBe('rgba(0, 0, 0, 0)');
    }
    for (const sel of ['.overlay-alarm', '.overlay-activity', '.overlay-scoreboard']) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box!.x, sel).toBeGreaterThanOrEqual(64);
      expect(box!.y, sel).toBeGreaterThanOrEqual(64);
      expect(box!.x + box!.width, sel).toBeLessThanOrEqual(STAGE.width - 64);
      expect(box!.y + box!.height, sel).toBeLessThanOrEqual(STAGE.height - 64);
    }
    await context.close();
  });

  test('captures the overlay at 1920x1080, transparent and on a stream-like backdrop', async ({ browser }) => {
    const { page, context } = await openOverlay(browser, { ...OVERLAY_SHORT });
    await expect(page.locator('.overlay-chat-line').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/overlay-1920-transparent.png`, omitBackground: true });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('background', 'linear-gradient(120deg, #3a4a6b, #6b3a52 55%, #2a2a33)', 'important');
    });
    await page.screenshot({ path: `${SHOTS}/overlay-1920-on-backdrop.png` });
    await context.close();
  });

  test('captures the after-action card and the long-name stress layout', async ({ browser }) => {
    const withReport = await openOverlay(browser, {
      ...OVERLAY_SHORT,
      report: {
        attacksShown: 20, slipped: 3, mods: [], termsPushed: 4,
        grade: { passed: 7, total: 20, engine: 'twitch' }, fresh: { before: 14, after: 19, total: 20 }
      }
    });
    await expect(withReport.page.locator('.overlay-report')).toBeVisible();
    await expect(withReport.page.locator('.overlay-report')).toContainText('4 terms pushed to Twitch');
    await expect(withReport.page.locator('.overlay-report')).toContainText('Fresh wave: 14 blocked before, 19 after, out of 20');
    await withReport.page.evaluate(() => {
      document.documentElement.style.setProperty('background', 'linear-gradient(120deg, #3a4a6b, #6b3a52 55%, #2a2a33)', 'important');
    });
    await withReport.page.screenshot({ path: `${SHOTS}/overlay-1920-report.png` });
    await withReport.context.close();

    const long = await openOverlay(browser, OVERLAY_LONG);
    await expect(long.page.locator('.overlay-scoreboard')).toBeVisible();
    await long.page.evaluate(() => {
      document.documentElement.style.setProperty('background', 'linear-gradient(120deg, #3a4a6b, #6b3a52 55%, #2a2a33)', 'important');
    });
    await long.page.screenshot({ path: `${SHOTS}/overlay-1920-long.png` });
    await long.context.close();
  });
});
