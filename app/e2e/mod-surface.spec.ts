import { expect, test } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockModDemo } from './lib/mock-api';
import { mockModRoom, type ModScenario } from './lib/mock-mod-room';
import { audit } from './lib/audit';

const ROOM = 'surface-test';

test.describe('mod view surface (demo join card)', () => {
  test.beforeEach(async ({ page }) => {
    await mockModDemo(page, ROOM);
  });

  test('renders the mod join card', async ({ page }) => {
    await page.goto(`/demo/${ROOM}/mod`);
    const heading = page.getByRole('heading');
    await expect(heading.first()).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const size of WIDTHS) {
      test(`renders at ${size.name}px in ${scheme}`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await mockModDemo(page, ROOM);
        await page.goto(`/demo/${ROOM}/mod`);
        const heading = page.getByRole('heading');
        await expect(heading.first()).toBeVisible();

        await page.screenshot({
          path: `${SHOTS}/mod-${size.name}-${scheme}.png`,
          fullPage: true
        });
        await audit(page, `mod-join-${size.name}-${scheme}`);
        await context.close();
      });
    }
  }
});

const SCENARIOS: ModScenario[] = ['waiting', 'practice', 'ended'];

test.describe('mod view surface (joined screens, mocked room)', () => {
  for (const scenario of SCENARIOS) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const size of WIDTHS) {
        test(`${scenario} at ${size.name}px in ${scheme}`, async ({ browser }) => {
          const context = await browser.newContext({ colorScheme: scheme, viewport: { width: size.width, height: size.height } });
          const page = await context.newPage();
          await mockModRoom(page, ROOM, scenario);
          await page.goto(`/demo/${ROOM}/mod`);
          await expect(page.getByRole('heading', { name: 'Practice room' })).toBeVisible();
          if (scenario === 'waiting') await expect(page.getByRole('heading', { name: /You're in/ })).toBeVisible();
          if (scenario === 'practice') {
            await expect(page.locator('.mod-line')).toHaveCount(6);
            await expect(page.getByText('Banned by you')).toBeVisible();
            await expect(page.getByText('False ban: that was a regular')).toBeVisible();
            await expect(page.getByText('Slipped through').first()).toBeVisible();
            await expect(page.getByText('Kai got it first')).toBeVisible();
          }
          if (scenario === 'ended') await expect(page.getByRole('heading', { name: 'What came through' })).toBeVisible();
          // let the 150 ms line entrance finish before the camera does
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${SHOTS}/mod-${scenario}-${size.name}-${scheme}.png`, fullPage: true });
          await audit(page, `mod-${scenario}-${size.name}-${scheme}`);
          await context.close();
        });
      }
    }
  }

  test('practice: every enabled action button is at least 44 px tall at 375 px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await mockModRoom(page, ROOM, 'practice');
    await page.goto(`/demo/${ROOM}/mod`);
    const buttons = page.locator('button[data-line-id]:not([disabled])');
    await expect(buttons).toHaveCount(6);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });

  test('practice: no horizontal scroll at 375 px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await mockModRoom(page, ROOM, 'practice');
    await page.goto(`/demo/${ROOM}/mod`);
    await expect(page.locator('.mod-line')).toHaveCount(6);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });

  test('practice: arrows move line focus, D T B act on it, focus ring is visible', async ({ page }) => {
    const sent = await mockModRoom(page, ROOM, 'practice');
    await page.goto(`/demo/${ROOM}/mod`);
    const first = page.locator('button[data-line-id="l5"]').first();
    await expect(first).toBeVisible();
    await first.focus();
    await expect(page.locator('.mod-line:focus-within')).toHaveCount(1);
    const ring = await page.locator('.mod-line:focus-within').evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe('none');
    const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-line-id'))).toBe('l6');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-line-id'))).toBe('l5');

    for (const [key, action] of [['d', 'delete'], ['t', 'timeout'], ['b', 'ban']] as const) {
      await page.locator('button[data-line-id="l5"]').first().focus();
      await page.keyboard.press(key);
      await expect.poll(() => sent.some((m) => JSON.stringify(m) === JSON.stringify({ type: 'mod.action', data: { lineId: 'l5', action } }))).toBe(true);
    }
  });

  test('practice: outcome is shown as text, not colour alone', async ({ page }) => {
    await mockModRoom(page, ROOM, 'practice');
    await page.goto(`/demo/${ROOM}/mod`);
    for (const selector of ['.mod-feedback-caught', '.mod-feedback-false', '.mod-feedback-slipped', '.mod-feedback-taken']) {
      const label = (await page.locator(selector).first().innerText()).trim();
      expect(label.length).toBeGreaterThan(3);
    }
  });

  test('practice: attack fixtures carry no real link and slurs are blocks', async ({ page }) => {
    await mockModRoom(page, ROOM, 'practice');
    await page.goto(`/demo/${ROOM}/mod`);
    await expect(page.locator('.mod-line')).toHaveCount(6);
    const links = await page.locator('.mod-link-segment').allInnerTexts();
    for (const link of links) expect(link).toMatch(/\.invalid(\/.*)?$/);
    await expect(page.locator('.mod-slur-segment').first()).toHaveText(/^▇+$/);
    // the bar is one labelled graphic, not a run of characters read out one by one
    await expect(page.locator('.mod-slur-segment').first()).toHaveAttribute('role', 'img');
    await expect(page.getByRole('img', { name: 'Redacted term' }).first()).toBeVisible();
    await expect(page.locator('.mod-chat-list')).not.toContainText('slurx');
  });
});

test.describe('mod view layout fixes (T-132)', () => {
  test('waiting: the welcome card starts right under the practice banner', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockModRoom(page, ROOM, 'waiting');
    await page.goto(`/demo/${ROOM}/mod`);
    const banner = await page.locator('.mod-practice-banner').boundingBox();
    const card = await page.locator('.mod-waiting').boundingBox();
    expect(card && banner && card.y - (banner.y + banner.height)).toBeLessThanOrEqual(40);
    await context.close();
  });

  test('ended: What came through spans the full width of the content', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockModRoom(page, ROOM, 'ended');
    await page.goto(`/demo/${ROOM}/mod`);
    const reveal = await page.locator('.mod-reveal').boundingBox();
    const banner = await page.locator('.mod-practice-banner').boundingBox();
    expect(reveal?.width).toBeCloseTo(banner?.width ?? 0, 0);
    await context.close();
  });
});
