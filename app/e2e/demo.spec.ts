import { expect, test } from './fixtures.js';
import { z } from 'zod';

const DraftZ = z.object({ drillId: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/) });
const ModJoinZ = z.object({ participantId: z.string().min(1), participantToken: z.string().min(1), ticket: z.string().min(1) });
const TicketZ = z.object({ ticket: z.string().min(1), wsUrl: z.string().url() });

test('runs the complete shared demo loop', async ({ page, request, demo, baseURL }) => {
  test.setTimeout(120_000);
  const startedAt = Date.now();
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const apiBase = new URL(`/api/demo/${encodeURIComponent(demo.room)}`, origin).toString();

  async function postJson(path: string, data: unknown = {}): Promise<unknown> {
    const response = await request.post(`${apiBase}${path}`, {
      headers: { Origin: origin },
      data
    });
    const body = await response.text();
    expect(response.ok(), `POST ${path} returned ${response.status()}: ${body}`).toBeTruthy();
    return JSON.parse(body) as unknown;
  }

  const draft = DraftZ.parse(await postJson('/drills', {
    tactics: ['linkscam', 'spam', 'botwave'],
    primaryTactic: 'linkscam',
    attackCount: 14,
    banterCount: 8,
    intervalMs: 1_500,
    slipWindowMs: 9_000,
    seed: 7,
    simMod: true,
    chatVote: false,
    announce: false
  }));
  const mod = ModJoinZ.parse(await postJson('/mod/join', { code: draft.joinCode, displayName: 'Playwright mod' }));
  const reconnect = TicketZ.parse(await postJson('/mod/ticket', { participantToken: mod.participantToken }));
  expect(new URL(reconnect.wsUrl).pathname).toBe(`/ws/demo/${demo.room}`);
  const consoleTicket = TicketZ.parse(await postJson('/ws-ticket'));
  expect(new URL(consoleTicket.wsUrl).pathname).toBe(`/ws/demo/${demo.room}`);

  await page.goto(`/demo/${encodeURIComponent(demo.room)}`);
  await expect(page.getByRole('heading', { name: 'Pixel Panda' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to configure' }).click();
  await expect(page.getByRole('heading', { name: 'Configure' })).toBeVisible();
  await page.getByRole('button', { name: 'Start drill' }).click();
  await expect(page.getByRole('heading', { name: 'Run the drill' })).toBeVisible();
  await expect(page.getByText(/Kai \(sim\)/).first()).toBeVisible();

  const modPage = await page.context().newPage();
  await modPage.addInitScript(({ storageKey, session }) => {
    sessionStorage.setItem(storageKey, JSON.stringify(session));
  }, {
    storageKey: `mfd_mod_demo:${demo.room}`,
    session: { participantId: mod.participantId, participantToken: mod.participantToken, displayName: 'Playwright mod' }
  });
  await modPage.goto(`/demo/${encodeURIComponent(demo.room)}/mod`);
  await expect(modPage.getByRole('heading', { name: 'Practice room' })).toBeVisible();
  await expect.poll(() => modPage.locator('button[data-line-id]:not([disabled])').count(), { timeout: 40_000 }).toBeGreaterThan(0);
  const deleteButton = modPage.locator('button[data-line-id]:not([disabled])').first();
  await deleteButton.focus();
  await deleteButton.press('d');
  await expect.poll(() => modPage.locator('.mod-line-acted').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('heading', { name: 'Drill complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to local estimate' }).click();
  await expect(page.getByRole('heading', { name: 'Local filter estimate' })).toBeVisible();
  await page.getByRole('button', { name: 'Run local estimate' }).click();
  await expect(page.getByRole('button', { name: 'Find better rules' })).toBeEnabled();
  await page.getByRole('button', { name: 'Find better rules' }).click();
  await expect(page.getByRole('heading', { name: /Selected terms \([1-9]\d*\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test on a fresh wave' })).toBeEnabled();
  await page.getByRole('button', { name: 'Test on a fresh wave' }).click();
  await expect(page.getByRole('heading', { name: 'Fresh wave and simulated push' })).toBeVisible();
  await expect.poll(() => page.locator('.console-proof-safe').count()).toBeGreaterThan(0);
  await expect(page.getByText(/0 real-chat matches/).first()).toBeVisible();
  await expect.poll(() => page.locator('.console-proof-unsafe').count()).toBe(0);

  await page.getByRole('button', { name: /Simulate push of \d+ terms/ }).click();
  await expect(page.getByText('Added to this demo only', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo simulated push' }).click();
  await expect(page.getByText('Removed from this demo', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Drill summary' })).toBeVisible();
  await expect(page.getByText('removed', { exact: true }).first()).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(120_000);
  await modPage.close();
});