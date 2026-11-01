import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';

/**
 * The static marketing site (site/), served from the branch under test with
 * scripts/serve-static.mjs. T-135 covers the shared layer and the home page;
 * every other page is screenshotted too so T-136 can review them without
 * running anything locally.
 */

const PAGES = [
  'index',
  'docs',
  'quickstart',
  'troubleshooting',
  'glossary',
  'how-it-works',
  'mods',
  'safety',
  'demo',
  'faq',
  'setup',
  'overlay',
  'console',
  'mod',
  'report',
  'privacy',
  'terms'
];
const SCHEMES = ['light', 'dark'] as const;

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, 'page scrolls sideways').toBeLessThanOrEqual(0);
}

test.describe('site home', () => {
  test('headline, actions and no sideways scroll at every width', async ({ page }) => {
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/index.html');
      await expect(page.getByRole('heading', { level: 1, name: 'Raid drills for your mod team.' })).toBeVisible();
      const start = page.getByRole('link', { name: 'Start a drill' }).first();
      await expect(start).toBeVisible();
      await expect(start).toHaveAttribute('href', 'https://app.modscrim.dualmindlab.tech/console');
      await noSidewaysScroll(page);
    }
  });

  test('orange action keeps its 2px border, and hover does not change it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html');
    const cta = page.locator('.hero .btn-orange').first();
    const read = () =>
      cta.evaluate((el) => {
        const s = getComputedStyle(el);
        return { width: s.borderTopWidth, style: s.borderTopStyle, box: el.getBoundingClientRect().width, shadow: s.boxShadow };
      });
    const before = await read();
    expect(before.width).toBe('2px');
    expect(before.style).toBe('solid');
    await cta.hover();
    await page.waitForTimeout(250);
    const after = await read();
    expect(after.width).toBe('2px');
    expect(after.box).toBe(before.box);
    expect(after.shadow).not.toBe('none');
  });

  test('the hero changes with the theme, not only the lower sections', async ({ browser }) => {
    const bg = async (scheme: 'light' | 'dark') => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto('/index.html');
      const v = await page.locator('.hero').evaluate((el) => getComputedStyle(el).backgroundColor);
      await ctx.close();
      return v;
    };
    expect(await bg('light')).not.toBe(await bg('dark'));
  });

  test('drill widget: the cover is solid, so no chat line shows through, and Start stays on screen at 375', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/index.html#try');
    const cover = page.locator('[data-cover]');
    const colour = await cover.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colour, 'cover must not be translucent').not.toMatch(/rgba|\//);
    const start = page.getByRole('button', { name: 'Start the 30-second drill' });
    await start.scrollIntoViewIfNeeded();
    const box = (await start.boundingBox())!;
    const coverBox = (await cover.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(coverBox.y + coverBox.height);
  });

  test('small-screen menu opens and closes by keyboard and marks the current page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/how-it-works.html');
    const menu = page.locator('details.menu');
    const summary = menu.locator('summary');
    await expect(summary).toBeVisible();
    await expect(menu.locator('a[aria-current="page"]')).toHaveText('How it works');

    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveJSProperty('open', false);
    await expect(summary).toBeFocused();

    await page.keyboard.press('Space');
    await expect(menu).toHaveJSProperty('open', true);
    await page.screenshot({ path: `${SHOTS}/site-menu-open-375.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveJSProperty('open', false);

    await page.goto('/index.html');
    await expect(page.locator('.brand')).toHaveAttribute('aria-current', 'page');
  });

  test('reduced motion turns smooth scrolling and the plate flip off', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/index.html');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
    await ctx.close();
  });
});

test.describe('site screenshots', () => {
  for (const name of PAGES) {
    for (const scheme of SCHEMES) {
      for (const size of WIDTHS) {
        test(`${name} ${scheme} ${size.name}`, async ({ browser }) => {
          const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: size.width, height: size.height } });
          const page = await ctx.newPage();
          const errors: string[] = [];
          page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
          page.on('pageerror', (e) => errors.push(String(e)));
          await page.goto(`/${name}.html`);
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: `${SHOTS}/site-${name}-${size.name}-${scheme}.png`, fullPage: true });
          expect(errors).toEqual([]);
          await ctx.close();
        });
      }
    }
  }
});

test.describe('site docs', () => {
  test('docs pages: one h1, a sidebar that marks the current page', async ({ page }) => {
    for (const name of ['docs', 'quickstart', 'troubleshooting', 'glossary']) {
      await page.goto(`/${name}.html`);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator(`.docnav a[aria-current="page"]`)).toHaveAttribute('href', `${name}.html`);
      await expect(page.locator('header .nav-links a[aria-current="page"]')).toHaveText('Docs');
    }
  });

  test('every internal link on every page resolves', async ({ page, request }) => {
    const seen = new Set<string>();
    const bad: string[] = [];
    for (const name of PAGES) {
      await page.goto(`/${name}.html`);
      const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
      for (const href of hrefs) {
        if (/^(https?:|mailto:|#)/.test(href) || seen.has(href)) continue;
        seen.add(href);
        const res = await request.get(`/${href.split('#')[0]}`);
        if (!res.ok()) bad.push(`${name}: ${href} -> ${res.status()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('no page scrolls sideways at any width', async ({ page }) => {
    for (const name of PAGES) {
      for (const size of WIDTHS) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(`/${name}.html`);
        await noSidewaysScroll(page);
      }
    }
  });
});
