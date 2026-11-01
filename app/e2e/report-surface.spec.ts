import { expect, test } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockSharedReport } from './lib/mock-api';

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
