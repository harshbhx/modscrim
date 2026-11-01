import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { mockOverlay, mockOverlaySocket, overlayFrames } from './lib/mock-api';

/**
 * Two states. Without a socket the overlay renders nothing (role is never
 * 'overlay'), so that empty state is screenshotted as a baseline. With
 * `page.routeWebSocket` standing in for the Worker, the overlay renders the live
 * drill and the after-action card from validated redacted frames only: lines
 * carry a length, never text (AGENTS.md rule 2, SRS §8.3).
 */

const CHANNEL = 'pixelpanda_tv';
const OVERLAY_URL = `/overlay/${CHANNEL}?key=surface-test`;
type State = 'empty' | 'live' | 'report';

async function prepare(page: Page, state: State): Promise<void> {
  await mockOverlay(page, CHANNEL);
  if (state !== 'empty') await mockOverlaySocket(page, overlayFrames(state === 'report'));
}

test.describe('overlay surface, empty (no WebSocket)', () => {
  test('loads without throwing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await prepare(page, 'empty');
    await page.goto(OVERLAY_URL);
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});

test.describe('overlay surface, redacted payloads over a mocked socket', () => {
  test('renders redacted lines and numbers, never readable text', async ({ page }) => {
    await prepare(page, 'report');
    await page.goto(OVERLAY_URL);

    const stage = page.getByRole('main', { name: 'OBS practice overlay' });
    await expect(stage).toBeVisible();
    await expect(page.getByLabel('Hidden practice message')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Practice scoreboard' })).toContainText('Mod 1');
    await expect(page.getByRole('status')).toContainText('Drill complete');

    const text = (await stage.innerText()).toLowerCase();
    expect(text).not.toMatch(/https?:|\.invalid|slurx|slury|▇/);
  });
});

for (const state of ['empty', 'live', 'report'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    for (const size of WIDTHS) {
      test(`captures ${state} at ${size.name}px in ${scheme}`, async ({ browser }) => {
        const context = await browser.newContext({
          colorScheme: scheme,
          viewport: { width: size.width, height: size.height }
        });
        const page = await context.newPage();
        await prepare(page, state);
        await page.goto(OVERLAY_URL);
        if (state === 'empty') await page.waitForTimeout(500);
        else await expect(page.getByLabel('Hidden practice message').first()).toBeVisible();

        // The empty state keeps its original file name so existing artifact links still match.
        const name = state === 'empty' ? 'overlay' : `overlay-${state}`;
        await page.screenshot({ path: `${SHOTS}/${name}-${size.name}-${scheme}.png`, fullPage: true });
        await context.close();
      });
    }
  }
}
