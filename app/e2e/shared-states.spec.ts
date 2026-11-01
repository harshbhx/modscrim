import { expect, test } from '@playwright/test';
import { openGallery } from './lib/gallery';

/**
 * T-129 behavioural checks on the shared primitives in base.css and
 * animations.css, run on the spec-only gallery page.
 */

test.describe('orange fill hover', () => {
  test('uses box-shadow and causes no layout change', async ({ page }) => {
    await openGallery(page);
    const button = page.locator('#state-hover .btn-orange');

    const measure = () =>
      button.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          width: box.width,
          height: box.height,
          x: box.x,
          y: box.y,
          border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
          boxShadow: style.boxShadow
        };
      });

    await page.mouse.move(0, 0);
    const before = await measure();
    expect(before.boxShadow).toBe('none');

    await button.hover();
    await expect.poll(async () => (await measure()).boxShadow, { message: 'hover adds a box-shadow' }).not.toBe('none');
    const after = await measure();

    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.border).toEqual(before.border);
  });
});

test.describe('reduced motion', () => {
  const PRIMITIVES = '#state-loading .skeleton, #state-loading .anim-pulse, #state-hover .btn, #state-focus .btn';

  test('control: with motion allowed the pulse primitive animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openGallery(page);
    const name = await page.locator('#state-loading .anim-pulse').evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('pulse');
  });

  test('no animation or transition runs on shared primitives', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGallery(page);

    // Let any animation that the media query shortened run to completion.
    await page.waitForTimeout(300);

    const report = await page.evaluate((selector) => {
      const running = document
        .getAnimations()
        .filter((animation) => animation.playState === 'running')
        .map((animation) => ('animationName' in animation ? String(animation.animationName) : 'transition'));
      const styles = Array.from(document.querySelectorAll(selector)).map((el) => {
        const style = getComputedStyle(el);
        return {
          cls: el.className,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          iterations: style.animationIterationCount,
          transitionDuration: style.transitionDuration
        };
      });
      return { running, styles };
    }, PRIMITIVES);

    expect(report.styles.length).toBeGreaterThan(0);
    expect(report.running).toEqual([]);
    for (const style of report.styles) {
      const infinite = style.animationName !== 'none' && style.iterations === 'infinite';
      expect(infinite, `${style.cls} must not loop`).toBe(false);
      for (const duration of style.animationDuration.split(',')) {
        expect(Number.parseFloat(duration) * (duration.trim().endsWith('ms') ? 1 : 1000)).toBeLessThanOrEqual(1);
      }
      for (const duration of style.transitionDuration.split(',')) {
        expect(Number.parseFloat(duration) * (duration.trim().endsWith('ms') ? 1 : 1000)).toBeLessThanOrEqual(1);
      }
    }
  });
});
