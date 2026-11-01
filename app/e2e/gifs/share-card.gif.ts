import { expect, test } from '@playwright/test';
import { mockSharedReport, type SharedCard } from '../lib/mock-api';
import { glideTo, sleep, slowScroll, startRecording, step } from './lib/stage';

/**
 * Flow 4: the shared report card at /r/:id (1280x720).
 *
 * Demo rooms keep their report inside the room, so there is no public /r/:id to open from a demo.
 * Like app/e2e/report-surface.spec.ts, this serves the public report endpoint from a fixture built
 * with the app's own schema (SharedReportZ); the page and its rendering are the branch's real code.
 * The card is numbers only by design (S-06): counts, the grade and the fresh wave, no chat lines.
 */

const REPORT_ID = 'gif-report-001';
const CARD: SharedCard = {
  attacksShown: 18,
  slipped: 3,
  mods: [
    { name: 'Mod 1', isSim: false, caught: 12, falseBans: 1, avgReactionMs: 2400 },
    { name: 'Mod 2', isSim: false, caught: 3, falseBans: 0, avgReactionMs: 3100 },
    { name: 'Kai', isSim: true, caught: 0, falseBans: 0, avgReactionMs: null }
  ],
  grade: { passed: 7, total: 18, engine: 'twitch' },
  termsPushed: 2,
  fresh: { before: 14, after: 17, total: 18 }
};

test('record the share card', async ({ browser, baseURL }) => {
  test.setTimeout(2 * 60_000);
  const rec = await startRecording(browser, baseURL, { name: 'share', width: 1280, height: 720 });
  const { page, timeline: tl, caption } = rec;
  try {
    await mockSharedReport(page, REPORT_ID, CARD);
    await page.goto(`/r/${REPORT_ID}`);
    await expect(page.getByRole('heading', { name: 'Pixel Panda' })).toBeVisible({ timeout: 25_000 });
    await sleep(1200);
    tl.mark('share_start');
    await caption('The share card: numbers only, no chat');
    await step(page, 'share-grade', async () => {
      await glideTo(page, page.getByText(/attack lines would get past your filters/).first(), { settleMs: 1600 });
    });
    tl.mark('share_grade');
    await step(page, 'share-fresh', async () => {
      await glideTo(page, page.getByText(/Blocked \d+ of \d+ before/).first(), { settleMs: 1600 });
    });
    tl.mark('share_fresh');
    await step(page, 'share-mods', async () => {
      await glideTo(page, page.getByRole('rowheader', { name: 'Mod 1' }), { settleMs: 1500 });
      await slowScroll(page, 260, 10, 80);
      await sleep(1400);
    });
    tl.mark('share_end');
    await caption('');
  } finally {
    await rec.finish();
  }
});
