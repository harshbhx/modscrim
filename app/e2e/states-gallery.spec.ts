import { expect, test } from '@playwright/test';
import { enterState, GALLERY_STATES, openGallery } from './lib/gallery';
import { SHOTS, WIDTHS } from './lib/shots';

/**
 * States gallery: hover, focus, disabled, loading, empty and error, light and
 * dark, at 375, 768 and 1440 px. Screenshots are CI artifacts for human review
 * (no pixel diff), written as states-<state>-<width>-<scheme>.png.
 */
for (const scheme of ['light', 'dark'] as const) {
  for (const size of WIDTHS) {
    test(`states at ${size.name}px in ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: size.width, height: size.height }
      });
      const page = await context.newPage();
      await openGallery(page);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      for (const state of GALLERY_STATES) {
        await page.mouse.move(0, 0);
        await page.locator('body').click({ position: { x: 1, y: 1 } });
        await enterState(page, state);
        if (state === 'focus') {
          const outline = await page.locator('#state-focus .btn-orange').evaluate((el) => getComputedStyle(el).outlineStyle);
          expect(outline, 'focus ring is drawn').not.toBe('none');
        }
        await page.locator(`#state-${state}`).screenshot({ path: `${SHOTS}/states-${state}-${size.name}-${scheme}.png` });
      }
      await context.close();
    });
  }
}
