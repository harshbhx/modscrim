import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chatLineCount } from './lib/console-flow.js';
import { createDemoRoom } from './lib/demo-room.js';

const STEPS = [
  'Read filters',
  'Configure',
  'Run the drill',
  'Twitch grades',
  'Fix the rules',
  'Fresh wave and push'
] as const;

/**
 * Stepper state: which step is current (aria-current) and which are locked (name suffix, disabled).
 * A few unlocks happen asynchronously (the draft loading unlocks step 2; the fresh-wave proof unlocks
 * step 6 while step 5 is open), so a step in (unlockedMin, unlockedMax] may be either; the rest is exact.
 */
async function expectStepper(page: Page, current: number, unlockedMin: number, unlockedMax = unlockedMin): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Drill steps' });
  for (const [index, label] of STEPS.entries()) {
    const step = index + 1;
    if (step > unlockedMin && step <= unlockedMax) {
      if (step === current) await expect(nav.getByRole('button', { name: `Step ${step}: ${label}`, exact: true })).toHaveAttribute('aria-current', 'step');
      continue;
    }
    const locked = step > unlockedMax;
    const button = nav.getByRole('button', { name: `Step ${step}: ${label}${locked ? ', locked' : ''}`, exact: true });
    await expect(button, `step ${step} button`).toBeVisible();
    if (locked) await expect(button).toBeDisabled();
    else await expect(button).toBeEnabled();
    if (step === current) await expect(button).toHaveAttribute('aria-current', 'step');
    else await expect(button).not.toHaveAttribute('aria-current', /.*/);
  }
}

test('walks the six console steps on the demo path', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const demo = await createDemoRoom(page.request, baseURL);
  await page.goto(`/demo/${encodeURIComponent(demo.room)}`);

  // 1. Read filters
  await expect(page.getByRole('heading', { name: 'Read filters', exact: true })).toBeVisible();
  await expectStepper(page, 1, 1, 2);
  await page.getByRole('button', { name: 'Continue to configure' }).click();

  // 2. Configure
  await expect(page.getByRole('heading', { name: 'Configure', exact: true })).toBeVisible();
  await expectStepper(page, 2, 2);
  await page.getByRole('button', { name: 'Start drill' }).click();

  // 3. Run the drill
  await expect(page.getByRole('heading', { name: 'Run the drill', exact: true })).toBeVisible();
  await expectStepper(page, 3, 3);
  await expect(page.getByText('Practice chat only. Nothing here is posted to Twitch.').first()).toBeVisible();
  await expect.poll(() => chatLineCount(page), { timeout: 45_000 }).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drill complete', exact: true })).toBeVisible();
  await expectStepper(page, 3, 4);
  await page.getByRole('button', { name: 'Continue to local estimate' }).click();

  // 4. Twitch grades (demo rooms title it "Local filter estimate"; the stepper label is unchanged)
  await expect(page.getByRole('heading', { name: 'Local filter estimate', exact: true })).toBeVisible();
  await expectStepper(page, 4, 4);
  await page.getByRole('button', { name: 'Run local estimate' }).click();
  const findRules = page.getByRole('button', { name: 'Find better rules' });
  await expect(findRules).toBeEnabled();
  await findRules.click();

  // 5. Fix the rules
  await expect(page.getByRole('heading', { name: 'Fix the rules', exact: true })).toBeVisible();
  await expectStepper(page, 5, 5, 6);
  await expect(page.getByRole('heading', { name: /^Selected terms \([1-9]\d*\)$/ })).toBeVisible();
  const freshWave = page.getByRole('button', { name: 'Test on a fresh wave' });
  await expect(freshWave).toBeEnabled();
  await freshWave.click();

  // 6. Fresh wave and push (simulated in demo rooms)
  await expect(page.getByRole('heading', { name: 'Fresh wave and simulated push', exact: true })).toBeVisible();
  await expectStepper(page, 6, 6);
  await expect(page.getByText('0 real-chat matches').first()).toBeVisible();
  const push = page.getByRole('button', { name: /^Simulate push of \d+ terms$/ });
  await expect(push).toBeEnabled();
  await push.click();
  await expect(page.getByText('Added to this demo only', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo simulated push' }).click();
  await expect(page.getByText('Removed from this demo', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Drill summary', exact: true })).toBeVisible();

  // Going back is allowed once a step is unlocked, and the stepper follows.
  await page.getByRole('navigation', { name: 'Drill steps' }).getByRole('button', { name: 'Step 3: Run the drill', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drill complete', exact: true })).toBeVisible();
  await expectStepper(page, 3, 6);
});
