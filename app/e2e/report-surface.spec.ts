import { expect, test } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockSharedReport, type SharedCard } from './lib/mock-api';

const REPORT_ID = 'surface-rpt-001';

test.describe('shared report surface', () => {
  test.beforeEach(async ({ page }) => {
    await mockSharedReport(page, REPORT_ID);
  });

  test('renders the report card with channel name and grade', async ({ page }) => {
    await page.goto(`/r/${REPORT_ID}`);
    await expect(page.getByText('Pixel Panda')).toBeVisible();
    await expect(page.getByText('Fire drill report')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const size of WIDTHS) {
      test(`renders at ${size.name}px in ${scheme}`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await mockSharedReport(page, REPORT_ID);
        await page.goto(`/r/${REPORT_ID}`);
        await expect(page.getByText('Pixel Panda')).toBeVisible();

        await page.screenshot({
          path: `${SHOTS}/report-${size.name}-${scheme}.png`,
          fullPage: true
        });
        await context.close();
      });
    }
  }
});

test.describe('shared report card is numbers only (S-06)', () => {
  const card: SharedCard = {
    attacksShown: 18,
    slipped: 3,
    mods: [
      { name: 'Mod 1', isSim: false, caught: 12, falseBans: 1, avgReactionMs: 2400 },
      { name: 'Mod 2', isSim: false, caught: 3, falseBans: 0, avgReactionMs: 3100 }
    ],
    grade: { passed: 7, total: 18, engine: 'twitch' },
    termsPushed: 2,
    fresh: { before: 14, after: 17, total: 18 }
  };

  test('shows counts, the grade and the fresh wave; no chat lines, no attack text', async ({ page }) => {
    await mockSharedReport(page, REPORT_ID, card);
    await page.goto(`/r/${REPORT_ID}`);
    await expect(page.getByRole('heading', { name: 'Pixel Panda' })).toBeVisible();
    await expect(page.getByText('7 of 18 attack lines would get past your filters')).toBeVisible();
    await expect(page.getByText('Blocked 14 of 18 before the new terms, 17 of 18 after.')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Mod 1' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Mod 2' })).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/\.invalid|slurx|slury|\u2587|segments|reveal/i);
    expect(await page.locator('.share-card').locator('[class*="chat"], [class*="line"]').count()).toBe(0);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`captures an ungraded, unproven report at 375px in ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await mockSharedReport(page, REPORT_ID, { ...card, mods: [], grade: null, fresh: null });
      await page.goto(`/r/${REPORT_ID}`);
      await expect(page.getByText('Not graded yet.')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/report-empty-375-${scheme}.png`, fullPage: true });
      await context.close();
    });
  }

  test('no horizontal scroll at 375px', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await mockSharedReport(page, REPORT_ID, card);
    await page.goto(`/r/${REPORT_ID}`);
    await expect(page.getByRole('heading', { name: 'Pixel Panda' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
