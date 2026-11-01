import { expect, test } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockOverlay } from './lib/mock-api';

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
