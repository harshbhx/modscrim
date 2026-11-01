import { expect, test } from '@playwright/test';
import { mockOverlay, OVERLAY_KEY } from '../lib/mock-api';
import { sleep, startRecording } from './lib/stage';

/**
 * Flow 3: the OBS overlay at 1920x1080 on a neutral stream-like backdrop.
 *
 * A demo room's overlay cannot be opened in a browser (the overlay key goes to the room's creator only),
 * so this is the one flow that does not use the live product. It uses the same mocked-socket approach
 * as app/e2e/overlay-surface.spec.ts: page.routeWebSocket plays the frames the Worker's overlay role
 * sends, which are redacted by construction (a line is a user name and a length, never text, SRS 8.3).
 * The page code is the real overlay of this branch; only the frames come from here.
 * Frames are replayed over time so the alarm, the redacted chat, the scoreboard and the after-action card all move.
 */

const CHANNEL = 'pixelpanda_tv';
const T0 = 1_730_000_000_000;
const USERS = ['ava_v', 'bot_17', 'cleo', 'dax', 'eli', 'fern', 'gus_tv', 'hana', 'iris_k', 'jules', 'kit_9', 'lena'];
const LENS = [64, 120, 36, 88, 52, 140, 44, 96, 72, 30, 110, 58];
/** What happens to each line: caught by a mod, caught by Kai, or slipped through. */
const OUTCOME = ['acted', 'acted', 'slipped', 'acted', 'acted', 'slipped', 'acted', 'acted', 'acted', 'slipped', 'acted', 'acted'] as const;

type Frame = { type: string; data: unknown };

function drillState(shown: number, resolved: number, status: 'running' | 'ended'): Frame {
  const lines = Array.from({ length: shown }, (_, i) => ({
    line: { lineId: `l${i}`, user: USERS[i] ?? `viewer_${i}`, len: LENS[i] ?? 48 },
    shownAt: T0 + i * 1500,
    state: i < resolved ? OUTCOME[i] ?? 'acted' : 'open'
  }));
  const done = OUTCOME.slice(0, resolved);
  const caught = done.filter((x) => x === 'acted').length;
  const slipped = done.filter((x) => x === 'slipped').length;
  const mine = Math.ceil(caught * 0.65);
  return {
    type: 'drill.state',
    data: {
      drill: {
        drillId: 'drill-gif',
        status,
        startedAt: T0,
        total: 12,
        lines,
        score: {
          mods: [
            { participantId: 'p1', name: 'Sam', isSim: false, caught: mine, falseBans: resolved > 6 ? 1 : 0, avgReactionMs: mine ? 2100 : null },
            { participantId: 'p2', name: 'Kai', isSim: true, caught: caught - mine, falseBans: 0, avgReactionMs: caught - mine ? 3000 : null }
          ],
          slipped,
          attacksShown: shown
        }
      },
      participants: [
        { id: 'p1', name: 'Sam', isSim: false, online: true },
        { id: 'p2', name: 'Kai', isSim: true, online: true }
      ]
    }
  };
}

test('record the OBS overlay', async ({ browser, baseURL }) => {
  test.setTimeout(3 * 60_000);
  const rec = await startRecording(browser, baseURL, { name: 'overlay', width: 1920, height: 1080 });
  const { page, timeline: tl, caption } = rec;
  try {
    await mockOverlay(page, CHANNEL);
    let play: (() => void) | null = null;
    const started = new Promise<void>((resolve) => { play = resolve; });
    await page.routeWebSocket(/\/ws\/ch\//, (ws) => {
      const key = new URL(ws.url()).searchParams.get('overlayKey');
      if (key !== OVERLAY_KEY) { ws.close({ code: 1008, reason: 'bad key' }); return; }
      const send = (frame: Frame): void => ws.send(JSON.stringify(frame));
      send({ type: 'hello', data: { role: 'overlay', serverTime: T0 } });
      send(drillState(0, 0, 'running'));
      void started.then(async () => {
        // a line appears every 1.2 s; each is resolved two lines later
        for (let shown = 1; shown <= 12; shown += 1) {
          send(drillState(shown, Math.max(0, shown - 2), 'running'));
          await sleep(1200);
        }
        send(drillState(12, 12, 'running'));
        await sleep(1500);
        send(drillState(12, 12, 'ended'));
        await sleep(600);
        send({
          type: 'report.ready',
          data: {
            drillId: 'drill-gif',
            card: {
              drillId: 'drill-gif',
              attacksShown: 12,
              slipped: 3,
              mods: [{ name: 'Sam', isSim: false, caught: 6, falseBans: 1, avgReactionMs: 2100 }],
              grade: { passed: 4, total: 12, engine: 'local' },
              termsPushed: 3,
              fresh: { before: 8, after: 11, total: 12 }
            }
          }
        });
      });
    });

    await page.goto(`/overlay/${CHANNEL}?key=${OVERLAY_KEY}`);
    // the page itself draws nothing on a transparent ground; this backdrop stands in for the stream
    await page.addStyleTag({
      content: 'html{background:radial-gradient(1200px 700px at 25% 30%,#4a5c85,transparent 70%),linear-gradient(120deg,#2c3550,#4a3350 55%,#23232b) !important}'
    });
    await expect(page.getByRole('main', { name: 'OBS practice overlay' })).toBeVisible({ timeout: 25_000 });
    tl.mark('overlay_alarm');
    await caption('OBS overlay: the alarm and the scoreboard');
    await sleep(1800);
    play?.();
    tl.mark('overlay_live');
    await sleep(2500);
    await caption('Chat shown as hidden bars: no text, no links');
    await expect(page.getByLabel('Hidden practice message').first()).toBeVisible({ timeout: 20_000 });
    tl.mark('overlay_redacted');
    await sleep(9000);
    tl.mark('overlay_scoreboard');
    await caption('');
    await expect(page.locator('.overlay-report')).toBeVisible({ timeout: 30_000 });
    tl.mark('overlay_report');
    await sleep(3800);
    tl.mark('overlay_end');
  } finally {
    await rec.finish();
  }
});
