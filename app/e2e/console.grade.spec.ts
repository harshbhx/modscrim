import { expect, test } from '@playwright/test';
import { runDrillToEnd } from './lib/console-flow.js';
import { createDemoRoom } from './lib/demo-room.js';

const COLUMNS = ['Attack line', 'Tactic', 'Trick', 'Result', 'Engine'];

test('demo grading uses the local estimate and labels every row "local estimate"', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const demo = await createDemoRoom(page.request, baseURL);
  await runDrillToEnd(page, demo.room);
  await page.getByRole('button', { name: 'Continue to local estimate' }).click();
  await expect(page.getByRole('heading', { name: 'Local filter estimate', exact: true })).toBeVisible();

  // Demo rooms render "Run local estimate"; the live console's "Use local estimate now" and
  // "Grade with Twitch" need a Twitch login and are not offered here.
  await expect(page.getByRole('button', { name: 'Grade with Twitch' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use local estimate now' })).toHaveCount(0);
  const run = page.getByRole('button', { name: 'Run local estimate' });
  await expect(run).toBeEnabled();
  await run.click();

  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(COLUMNS);

  // Every attack row is graded, and every Engine cell reads "local".
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  const engineCells = rows.locator('td:nth-child(5)');
  const resultCells = rows.locator('td:nth-child(4)');
  await expect(resultCells.filter({ hasText: 'Not graded yet' })).toHaveCount(0);
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  await expect(engineCells).toHaveCount(count);
  // The rendered label is the PRD §9.6 `grade.engine.local` string, "local estimate".
  await expect(engineCells.filter({ hasText: /^local estimate$/ })).toHaveCount(count);
  await expect(page.getByText(/\d+ of \d+ attack lines would get past your filters/)).toBeVisible();
});
