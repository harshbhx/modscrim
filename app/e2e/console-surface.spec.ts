import { expect, test } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockConsoleDemo } from './lib/mock-api';

const ROOM = 'surface-test';

test.describe('console surface (demo mode)', () => {
  test.beforeEach(async ({ page }) => {
    await mockConsoleDemo(page, ROOM);
  });

  test('renders the console shell with stepper and heading', async ({ page }) => {
    await page.goto(`/demo/${ROOM}`);
    await expect(page.locator('.console-stepper, [class*="stepper"]')).toBeVisible();
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
        await mockConsoleDemo(page, ROOM);
        await page.goto(`/demo/${ROOM}`);
        await expect(page.locator('.console-stepper, [class*="stepper"]')).toBeVisible();

        await page.screenshot({
          path: `${SHOTS}/console-${size.name}-${scheme}.png`,
          fullPage: true
        });
        await context.close();
      });
    }
  }
});
