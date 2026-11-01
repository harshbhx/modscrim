import { expect, test } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockModDemo } from './lib/mock-api';

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
        await context.close();
      });
    }
  }
});
