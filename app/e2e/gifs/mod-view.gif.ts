import { expect, test, type Page } from '@playwright/test';
import { glideTo, humanClick, humanType, sleep, startRecording, step } from './lib/stage';

/**
 * Flow 2: the moderator phone view (390x844) playing a drill with D, T and B.
 *
 * Uses the second (and last) POST /api/demo of the run. The room is created and its draft made
 * from an unrecorded page through the browser's own fetch, so the demo cookie is handled by the
 * browser exactly as in a real visit. The recorded phone page then joins through the real join
 * card and plays the real drill; Kai (sim) races it.
 */

const wait = { timeout: 25_000 };

async function api<T>(page: Page, path: string, body: unknown = {}): Promise<T> {
  const result = await page.evaluate(async ({ path: url, body: data }) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    return { ok: response.ok, status: response.status, text: await response.text() };
  }, { path, body });
  if (!result.ok) throw new Error(`POST ${path} failed with ${result.status}: ${result.text.slice(0, 200)}`);
  return JSON.parse(result.text) as T;
}

/** Looks like an attack to a moderator: a link, a promo, spaced-out letters, a block of hidden characters. */
const ATTACK_TEXT = /\.invalid|free\b|cheap|buy\b|promo|v1ewers|f\s+r\s+e\s+e|█|▇|slur/i;

test('record the mod phone view', async ({ browser, baseURL }) => {
  test.setTimeout(5 * 60_000);

  // ---- set up the room (not recorded) --------------------------------------------------------
  const setupContext = await browser.newContext({ baseURL });
  const setup = await setupContext.newPage();
  await setup.goto('/api/health');
  const room = await api<{ room: string; joinCode: string }>(setup, '/api/demo');
  const draft = await api<{ drillId: string; joinCode: string }>(setup, `/api/demo/${room.room}/drills`, {
    tactics: ['linkscam', 'spam', 'botwave'],
    primaryTactic: 'linkscam',
    attackCount: 10,
    banterCount: 6,
    intervalMs: 2600,
    slipWindowMs: 11_000,
    seed: 11,
    simMod: true,
    chatVote: false,
    announce: false
  });

  const rec = await startRecording(browser, baseURL, { name: 'mod', width: 390, height: 844 });
  const { page, timeline: tl, caption } = rec;
  try {
    await page.goto(`/demo/${room.room}/mod`);
    await expect(page.getByRole('heading').first()).toBeVisible(wait);
    await sleep(1200);
    tl.mark('mod_join_card');
    await caption('Mods join with a code');
    await step(page, 'mod-join', async () => {
      await humanType(page, page.getByLabel(/6-digit code/i), draft.joinCode);
      await humanType(page, page.getByLabel(/display name/i), 'Sam');
      await humanClick(page, page.getByRole('button', { name: /^join$/i }), { afterMs: 400 });
    }, { critical: true });
    await expect(page.getByText(/you.?re in|waiting/i).first()).toBeVisible(wait);
    tl.mark('mod_waiting');
    await sleep(1600);

    // the streamer starts the drill (from the console in a real session)
    await api(setup, `/api/demo/${room.room}/drills/${draft.drillId}/start`);
    await expect(page.locator('button[data-line-id]').first()).toBeVisible({ timeout: 40_000 });
    tl.mark('mod_drill_start');
    await caption('Spot the attack, then D, T or B');

    // ---- play: act on lines that look like attacks, keys d, t, b in turn ----------------------------
    const keys = ['d', 't', 'b', 'd', 't'] as const;
    const handled = new Set<string>();
    const deadline = Date.now() + 75_000;
    let acted = 0;
    while (acted < keys.length && Date.now() < deadline) {
      const candidates = await page.locator('button[data-line-id]:not([disabled])').all();
      let target: { id: string; button: (typeof candidates)[number] } | null = null;
      for (const button of candidates) {
        const id = (await button.getAttribute('data-line-id')) ?? '';
        if (!id || handled.has(id)) continue;
        const text = await button.evaluate((el) => (el.closest('.mod-line, li, article')?.textContent ?? ''));
        if (ATTACK_TEXT.test(text)) { target = { id, button }; break; }
      }
      if (!target) { await sleep(500); continue; }
      const chosen = target;
      handled.add(chosen.id);
      await sleep(900); // read it first
      const key = keys[acted] ?? 'd';
      const ok = await step(page, `mod-act-${acted}`, async () => {
        await glideTo(page, chosen.button, { steps: 18, settleMs: 200 });
        await chosen.button.focus();
        await page.keyboard.press(key);
        await sleep(1100);
      });
      if (ok) acted += 1;
    }
    tl.mark('mod_acted');
    await caption('');
    await step(page, 'mod-ended', async () => {
      await expect(page.getByRole('heading', { name: /what came through/i })).toBeVisible({ timeout: 60_000 });
    });
    await sleep(900);
    tl.mark('mod_end');
    await step(page, 'mod-scroll-end', async () => {
      await page.getByRole('heading', { name: /your result/i }).scrollIntoViewIfNeeded();
      await sleep(2200);
    });
    tl.mark('mod_result');
  } finally {
    await rec.finish();
    await setupContext.close();
  }
});
