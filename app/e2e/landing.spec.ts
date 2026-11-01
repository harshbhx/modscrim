import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';

/**
 * Landing page (/). Checks the things a screenshot cannot: the copy is the
 * copy deck's, both actions are reachable and visibly focusable by keyboard,
 * nothing scrolls sideways at phone width, and the orange action still carries
 * the border its contrast exemption depends on.
 *
 * Screenshots are written as CI artifacts, light and dark, at three widths.
 */

const TITLE = 'Raid drills for your mod team.';
const PITCH =
  "ModScrim floods a practice chat that only your team can see with spam built to slip past your channel's own filters. Your mods race to clear it. Then Twitch grades your filters, and the blocked terms that close the gaps go live when you approve them, with one-click undo.";
const SIGN_IN = 'Sign in with Twitch';
const DEMO = 'Try the demo';

/** The computed border width of the primary action, in px. */
async function primaryBorderWidth(page: Page): Promise<number> {
  return page.locator('.landing-action-primary').evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).borderTopWidth)
  );
}

test.describe('landing page', () => {
  test('shows the copy deck text and both actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(page.getByText(PITCH)).toBeVisible();

    const signIn = page.getByRole('link', { name: SIGN_IN });
    const demo = page.getByRole('link', { name: DEMO });
    await expect(signIn).toBeVisible();
    await expect(demo).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/auth/login');
    await expect(demo).toHaveAttribute('href', '/demo');
  });

  test('both actions are keyboard reachable with a visible focus ring', async ({ page }) => {
    await page.goto('/');
    const signIn = page.getByRole('link', { name: SIGN_IN });
    const demo = page.getByRole('link', { name: DEMO });

    // Tab forward until the primary action takes focus, rather than assuming
    // how many focusable things the header puts in front of it.
    for (let i = 0; i < 12 && !(await signIn.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }
    await expect(signIn).toBeFocused();

    const ring = await signIn.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: Number.parseFloat(s.outlineWidth),
        style: s.outlineStyle,
        color: s.outlineColor
      };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    // Card yellow, per brand/DESIGN.md focus-on-green. It measures 8.39:1 on
    // the wall-green band; the default green focus ring would be 1.3:1 there.
    expect(ring.color).toBe('rgb(255, 210, 63)');

    await page.keyboard.press('Tab');
    await expect(demo).toBeFocused();
  });

  test('the action fill keeps the border its contrast exemption rests on', async ({ page }) => {
    await page.goto('/');
    // #ff6a1f measures 2.51:1 on chalk and 4.23:1 on the green band; the
    // exemption holds only while the border identifies the control.
    expect(await primaryBorderWidth(page)).toBeGreaterThanOrEqual(2);
  });

  test('hover does not move the layout', async ({ page }) => {
    await page.goto('/');
    const primary = page.locator('.landing-action-primary');
    // At rest the fill is whistle orange itself, not a ramp step. The
    // --color-action-* aliases resolve at :root, so a scope that redefines
    // only --color-accent silently keeps the light ramp's #d96531.
    await expect(primary).toHaveCSS('background-color', 'rgb(255, 106, 31)'); // #ff6a1f

    const before = await primary.boundingBox();
    const borderBefore = await primaryBorderWidth(page);

    await primary.hover();
    await expect(primary).toHaveCSS('background-color', 'rgb(255, 153, 112)'); // --accent-hover-on-dark

    const after = await primary.boundingBox();
    expect(await primaryBorderWidth(page)).toBe(borderBefore);
    expect(after?.width).toBeCloseTo(before?.width ?? 0, 1);
    expect(after?.height).toBeCloseTo(before?.height ?? 0, 1);
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const size of WIDTHS) {
      test(`renders at ${size.name}px in ${scheme} with no sideways scroll`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);

        await page.screenshot({
          path: `${SHOTS}/landing-${size.name}-${scheme}.png`,
          fullPage: true
        });
        await context.close();
      });
    }
  }
});
