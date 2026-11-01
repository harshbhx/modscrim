import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockConsoleDemo } from './lib/mock-api';

/**
 * App shell and its pages (T-133): header and footer bands, /demo, /privacy and
 * the not-found page. Checks what a screenshot cannot (copy, keyboard reach,
 * the border the orange exemption rests on, no sideways scroll) and writes
 * light and dark screenshots at three widths as CI artifacts.
 */

const PAGES = [
  { name: 'demo', path: '/demo', heading: 'Try a fire drill with your mod team' },
  { name: 'privacy', path: '/privacy', heading: 'Privacy' },
  { name: 'notfound', path: '/no-such-page', heading: '404' }
] as const;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('shell', () => {
  test('header and footer bands render around every page', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(page.getByText('ModScrim is not affiliated with or endorsed by Twitch.')).toBeVisible();
  });

  test('footer links are keyboard reachable with a visible yellow ring', async ({ page }) => {
    await page.goto('/privacy');
    const link = page.getByRole('navigation', { name: 'More about ModScrim' }).getByRole('link').first();
    await link.focus();
    await expect(link).toBeFocused();
    const ring = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: Number.parseFloat(s.outlineWidth), style: s.outlineStyle, color: s.outlineColor };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color).toBe('rgb(255, 210, 63)');
  });
});

test.describe('/demo', () => {
  test('keeps the copy deck text and a keyboard reachable orange action', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.getByRole('heading', { level: 1, name: PAGES[0].heading })).toBeVisible();
    const start = page.getByRole('button', { name: 'Start a demo drill' });
    await expect(start).toBeVisible();

    for (let i = 0; i < 12 && !(await start.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(start).toBeFocused();
    const ring = await start.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: Number.parseFloat(s.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test('the orange fill keeps its outline and hover does not move the layout', async ({ page }) => {
    await page.goto('/demo');
    const start = page.getByRole('button', { name: 'Start a demo drill' });
    const border = () => start.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopWidth));
    expect(await border()).toBeGreaterThanOrEqual(2);
    const before = await start.boundingBox();
    await start.hover();
    const after = await start.boundingBox();
    expect(await border()).toBeGreaterThanOrEqual(2);
    expect(after?.width).toBeCloseTo(before?.width ?? 0, 1);
    expect(after?.height).toBeCloseTo(before?.height ?? 0, 1);
  });

  test('uses the brand mark image, not a letter in a circle', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.locator('.demo-card-mark img')).toHaveAttribute('src', /modscrim-mark/);
  });
});

test.describe('console page inside the shell', () => {
  test('still renders its stepper under the new header band', async ({ page }) => {
    await mockConsoleDemo(page, 'shell-test');
    await page.goto('/demo/shell-test');
    await expect(page.locator('.console-stepper, [class*="stepper"]')).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();
  });
});

for (const scheme of ['light', 'dark'] as const) {
  for (const size of WIDTHS) {
    for (const route of PAGES) {
      test(`${route.name} at ${size.name}px in ${scheme}: no sideways scroll`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await page.goto(route.path);
        await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `${SHOTS}/${route.name}-${size.name}-${scheme}.png`, fullPage: true });
        await context.close();
      });
    }

    test(`console under the shell at ${size.name}px in ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: size.width, height: size.height }
      });
      const page = await context.newPage();
      await mockConsoleDemo(page, 'shell-test');
      await page.goto('/demo/shell-test');
      await expect(page.locator('.console-stepper, [class*="stepper"]')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/shell-console-${size.name}-${scheme}.png`, fullPage: true });
      await context.close();
    });
  }
}
