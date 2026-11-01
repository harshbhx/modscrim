import { expect, type Page } from '@playwright/test';

/** Read the "N lines" counter of the live practice chat (step 3). */
export async function chatLineCount(page: Page): Promise<number> {
  const text = await page.getByText(/^\d+ lines$/).first().textContent();
  return Number.parseInt(text ?? '0', 10);
}

/**
 * Steps 1 to 3 of the demo console: Continue to configure, Start drill, let the
 * practice chat fill, Stop. Ends on the "Drill complete" panel. The room is the
 * shared one from setup.ts, so no extra POST /api/demo (rate limited) is needed.
 */
export async function runDrillToEnd(page: Page, room: string, minLines = 16): Promise<void> {
  await page.goto(`/demo/${encodeURIComponent(room)}`);
  await expect(page.getByRole('heading', { name: 'Read filters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to configure' }).click();
  await expect(page.getByRole('heading', { name: 'Configure', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start drill' }).click();
  await expect(page.getByRole('heading', { name: 'Run the drill', exact: true })).toBeVisible();
  await expect.poll(() => chatLineCount(page), { timeout: 45_000 }).toBeGreaterThanOrEqual(minLines);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drill complete', exact: true })).toBeVisible();
}
