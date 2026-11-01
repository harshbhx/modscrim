import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { z } from 'zod';
import { createDemoRoom, type DemoRoom } from './lib/demo-room.js';

/**
 * Mod keyboard shortcuts on /demo/:room/mod (the live /mod/:channel needs Twitch sign-in).
 * app/src/lib/keyboard.ts implements D, T, B, ArrowDown/ArrowUp, Home/End and "?"; there is no allow action.
 *
 * The drill is started over the demo API with Kai (sim) off, a 3 s interval and the longest slip window
 * (15 s), so several lines stay open at once and only this mod can act on them. The mod joins through
 * the real join card with the 6-digit code.
 */
const DraftZ = z.object({ drillId: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/) });
const SentZ = z.object({ type: z.literal('mod.action'), data: z.object({ lineId: z.string(), action: z.enum(['delete', 'timeout', 'ban']) }) });
const DRILL = {
  tactics: ['linkscam', 'spam', 'botwave'],
  primaryTactic: 'linkscam',
  attackCount: 30,
  banterCount: 10,
  intervalMs: 3_000,
  slipWindowMs: 15_000,
  seed: 7,
  simMod: false,
  chatVote: false,
  announce: false
};

let context: BrowserContext;
let page: Page;
let room: DemoRoom;
let drillId = '';
let origin = '';
const sentActions: Array<{ lineId: string; action: string }> = [];

async function api(path: string, data: unknown = {}, method: 'post' | 'patch' = 'post'): Promise<unknown> {
  const response = await context.request[method](new URL(`/api/demo/${encodeURIComponent(room.room)}${path}`, origin).toString(), {
    headers: { Origin: origin },
    data
  });
  const body = await response.text();
  expect(response.ok(), `${method.toUpperCase()} ${path} returned ${response.status()}: ${body}`).toBeTruthy();
  return JSON.parse(body) as unknown;
}

/** Enabled "Delete" buttons are the open lines; the three buttons of one line share data-line-id. */
function openDeleteButtons(): Locator {
  return page.getByRole('button', { name: /^Delete line from /, disabled: false });
}

async function openLineIds(): Promise<string[]> {
  return openDeleteButtons().evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-line-id') ?? ''));
}

async function focusedLineId(): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-line-id') ?? null);
}

async function waitForOpenLines(count: number): Promise<void> {
  await expect.poll(async () => (await openLineIds()).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(count);
}

async function ownTotal(): Promise<number> {
  const caught = await page.getByRole('heading', { name: /^\d+ caught$/ }).textContent();
  const falseBans = await page.getByText(/^\d+ false bans/).first().textContent();
  return Number.parseInt(caught ?? '0', 10) + Number.parseInt(falseBans ?? '0', 10);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

test.beforeAll(async ({ browser, baseURL }) => {
  origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  context = await browser.newContext({ baseURL: origin });
  page = await context.newPage();
  room = await createDemoRoom(context.request, baseURL);
  const draft = DraftZ.parse(await api('/drills', DRILL));
  drillId = draft.drillId;
  // The room starts with a draft; PATCH makes sure it carries this spec's settings.
  await api(`/drills/${encodeURIComponent(drillId)}`, DRILL, 'patch');
  page.on('websocket', (socket) => {
    socket.on('framesent', (frame) => {
      if (typeof frame.payload !== 'string') return;
      try {
        const parsed = SentZ.safeParse(JSON.parse(frame.payload));
        if (parsed.success) sentActions.push(parsed.data.data);
      } catch { /* not JSON */ }
    });
  });
  await page.goto(`/demo/${encodeURIComponent(room.room)}/mod`);
});

test.afterAll(async () => {
  try { if (drillId) await api(`/drills/${encodeURIComponent(drillId)}/stop`); } catch { /* already ended */ }
  await context.close();
});

test('joins through the join card and sees the practice chat when the drill starts', async () => {
  await expect(page.getByRole('heading', { name: 'Practice room', exact: true })).toBeVisible();
  await page.getByLabel('6-digit code').fill(room.joinCode);
  await page.getByLabel('Display name').fill('Playwright mod');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('heading', { name: "You're in. Remove attacks, leave regulars alone." })).toBeVisible();
  await expect(page.getByText('Practice chat only. Nothing here is posted to Twitch.').first()).toBeVisible();

  await api(`/drills/${encodeURIComponent(drillId)}/start`);
  await expect(page.getByRole('heading', { name: 'Every line stays in this room', exact: true })).toBeVisible();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await waitForOpenLines(3);
  // No "allow" action exists, and each open line offers exactly Delete, Timeout and Ban.
  await expect(page.getByRole('button', { name: /allow/i })).toHaveCount(0);
  const first = (await openLineIds())[0] ?? '';
  const line = page.getByRole('listitem').filter({ has: page.locator(`[data-line-id="${first}"]`) });
  for (const label of ['Delete', 'Timeout', 'Ban']) {
    await expect(line.getByRole('button', { name: new RegExp(`^${label} line from `) })).toBeEnabled();
  }
  await expect(line.getByRole('button')).toHaveCount(3);
});

test('"?" opens and closes the keyboard help', async () => {
  await waitForOpenLines(1);
  const help = page.getByRole('button', { name: /^Keyboard help/ });
  const text = page.getByText(/Press D to delete, T to timeout, or B to ban\./);
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(text).toHaveCount(0);

  await openDeleteButtons().last().focus();
  await page.keyboard.press('?');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(text).toBeVisible();
  await expect(text).toContainText('Home and End move to the first or latest open line');

  await page.keyboard.press('?');
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(text).toHaveCount(0);
});

test('ArrowDown, ArrowUp, Home and End move focus between open lines', async () => {
  await waitForOpenLines(3);
  // Lines slip away every few seconds, so read the order and press in one retried block.
  await expect(async () => {
    const ids = await openLineIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    await openDeleteButtons().first().focus();
    expect(await focusedLineId()).toBe(ids[0]);

    await page.keyboard.press('ArrowDown');
    expect(await focusedLineId()).toBe(ids[1]);
    await page.keyboard.press('ArrowDown');
    expect(await focusedLineId()).toBe(ids[2]);
    await page.keyboard.press('ArrowUp');
    expect(await focusedLineId()).toBe(ids[1]);

    await page.keyboard.press('End');
    expect(await focusedLineId()).toBe(ids[ids.length - 1]);
    await page.keyboard.press('Home');
    expect(await focusedLineId()).toBe(ids[0]);
    expect(await openLineIds()).toEqual(ids);
  }).toPass({ timeout: 30_000 });
});

const SHORTCUTS = [
  { key: 'd', action: 'delete', done: /^Deleted by you|^False ban: that was a regular$/ },
  { key: 't', action: 'timeout', done: /^Timed out by you|^False ban: that was a regular$/ },
  { key: 'b', action: 'ban', done: /^Banned by you|^False ban: that was a regular$/ }
] as const;

for (const { key, action, done } of SHORTCUTS) {
  test(`"${key.toUpperCase()}" sends ${action} for the focused line and updates the score`, async () => {
    await waitForOpenLines(1);
    // The newest open line has the most time left before it slips.
    const lineId = (await openLineIds()).at(-1) ?? '';
    const before = await ownTotal();
    await page.locator(`button[data-line-id="${lineId}"]`).first().focus();
    await page.keyboard.press(key);

    await expect.poll(() => sentActions.filter((item) => item.lineId === lineId)).toEqual([{ lineId, action }]);
    const line = page.getByRole('listitem').filter({ has: page.locator(`[data-line-id="${lineId}"]`) });
    await expect(line.getByText(done)).toBeVisible();
    // The line leaves the open queue: its three buttons are disabled.
    await expect(line.getByRole('button', { name: /^Delete line from / })).toBeDisabled();
    await expect(line.getByRole('button', { name: /^Timeout line from / })).toBeDisabled();
    await expect(line.getByRole('button', { name: /^Ban line from / })).toBeDisabled();
    expect(await openLineIds()).not.toContain(lineId);
    // Caught or false bans goes up by one (the line may have been banter).
    await expect.poll(ownTotal).toBe(before + 1);
  });
}
