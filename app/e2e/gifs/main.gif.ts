import { expect, test } from '@playwright/test';
import { glideTo, humanClick, sleep, slowScroll, startRecording, step } from './lib/stage';

/**
 * Flow 1: the whole console loop in one demo room, recorded as one video ("main").
 * It feeds hero.gif, how-it-works.gif, the console half of safety.gif and end.gif
 * (cut at the marks below by app/e2e/gifs/manifest.json).
 *
 * Uses ONE POST /api/demo (made by the app's own "Start a demo drill" button).
 * Selectors are role and text based on purpose: the console is being redesigned, and a step that
 * no longer matches is logged and skipped instead of failing the run.
 */

const wait = { timeout: 25_000 };

test('record the console loop in a demo room', async ({ browser, baseURL }) => {
  test.setTimeout(8 * 60_000);
  const rec = await startRecording(browser, baseURL, { name: 'main', width: 1280, height: 720 });
  const { page, timeline: tl, caption } = rec;
  try {
    // ---- landing ---------------------------------------------------------------------------
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible(wait);
    await sleep(1200);
    tl.mark('landing_start');
    await caption('ModScrim: raid drills for your mod team');
    await step(page, 'landing-scroll', async () => {
      await page.mouse.move(640, 380, { steps: 12 });
      await slowScroll(page, 420, 14, 90);
      await sleep(900);
      await slowScroll(page, -420, 14, 70);
      await sleep(500);
    });
    tl.mark('landing_scrolled');
    const tryDemo = page.getByRole('link', { name: /try the demo/i }).first();
    await step(page, 'landing-hover-demo', async () => { await glideTo(page, tryDemo); await sleep(700); }, { critical: true });
    await caption('');
    await step(page, 'landing-click-demo', async () => { await tryDemo.click(); await sleep(700); }, { critical: true });
    tl.mark('demo_page');

    // ---- demo page: start a demo drill (creates the one demo room) --------------------------
    await expect(page).toHaveURL(/\/demo\/?$/, wait);
    await sleep(1300);
    await step(page, 'demo-start', async () => {
      const start = page.getByRole('button', { name: /start a demo drill|start|try/i }).first();
      await humanClick(page, start, { afterMs: 300 });
    }, { critical: true });
    await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}/, wait);
    await expect(page.getByRole('heading', { name: 'Read filters', exact: true })).toBeVisible(wait);
    tl.mark('console_step1');
    await caption('Step 1: read your filters');
    await sleep(1800);

    // ---- step 1 -> 2: pick tactics ----------------------------------------------------------
    await step(page, 'continue-to-configure', async () => {
      await humanClick(page, page.getByRole('button', { name: 'Continue to configure' }), { afterMs: 400 });
    }, { critical: true });
    await expect(page.getByRole('heading', { name: 'Configure', exact: true })).toBeVisible(wait);
    tl.mark('configure');
    await caption('Pick the tactics to rehearse');
    await sleep(900);
    await step(page, 'pick-tactics', async () => {
      // tick up to two more tactics, never the hate raid one, then make sure one is primary
      const boxes = page.getByRole('checkbox');
      const count = await boxes.count();
      let ticked = 0;
      for (let i = 0; i < count && ticked < 2; i += 1) {
        const box = boxes.nth(i);
        const label = (await box.evaluate((el) => el.closest('label')?.textContent ?? '')).trim();
        if (/hate/i.test(label) || (await box.isChecked())) continue;
        await glideTo(page, box);
        await box.check({ timeout: 5_000 });
        ticked += 1;
        await sleep(700);
      }
    });
    tl.mark('tactics_picked');
    await sleep(900);

    // ---- step 2 -> 3: start the drill and let the practice chat fill --------------------------
    await caption('Start the drill');
    await step(page, 'start-drill', async () => {
      await humanClick(page, page.getByRole('button', { name: 'Start drill' }), { afterMs: 300 });
    }, { critical: true });
    await expect(page.getByRole('heading', { name: 'Run the drill', exact: true })).toBeVisible(wait);
    tl.mark('drill_start');
    await caption('Practice chat: only your team sees it');
    await step(page, 'chat-fills', async () => {
      await expect.poll(async () => {
        const text = await page.getByText(/^\d+ lines$/).first().textContent().catch(() => '0');
        return Number.parseInt(text ?? '0', 10);
      }, { timeout: 60_000, intervals: [500] }).toBeGreaterThanOrEqual(6);
    });
    tl.mark('chat_started');
    // safety beat: point at a practice link, which always ends in .invalid
    await step(page, 'point-at-invalid-link', async () => {
      const link = page.getByText(/\.invalid/).first();
      await link.waitFor({ timeout: 20_000 });
      await glideTo(page, link, { settleMs: 1200 });
    });
    tl.mark('safety_link');
    await step(page, 'chat-fills-more', async () => {
      await expect.poll(async () => {
        const text = await page.getByText(/^\d+ lines$/).first().textContent().catch(() => '0');
        return Number.parseInt(text ?? '0', 10);
      }, { timeout: 90_000, intervals: [500] }).toBeGreaterThanOrEqual(16);
    });
    tl.mark('chat_filled');
    await caption('');
    await step(page, 'stop-drill', async () => {
      await humanClick(page, page.getByRole('button', { name: 'Stop', exact: true }), { afterMs: 300 });
    }, { critical: true });
    await expect(page.getByRole('heading', { name: 'Drill complete', exact: true })).toBeVisible(wait);
    tl.mark('drill_end');
    await sleep(1500);

    // ---- step 4: grades (local estimate in a demo room) -----------------------------------------
    await caption('Twitch grades the drill (demo rooms use a local estimate)');
    await step(page, 'continue-to-grades', async () => {
      await humanClick(page, page.getByRole('button', { name: /^Continue to (local estimate|Twitch grades)/ }), { afterMs: 500 });
    }, { critical: true });
    tl.mark('grade_start');
    await step(page, 'run-grading', async () => {
      await humanClick(page, page.getByRole('button', { name: /run local estimate|grade with twitch/i }).first(), { afterMs: 300 });
      await expect(page.getByRole('button', { name: 'Find better rules' })).toBeEnabled({ timeout: 40_000 });
    }, { critical: true });
    await sleep(1400);
    tl.mark('graded');

    // ---- step 5: fix the rules ------------------------------------------------------------------
    await caption('Fix the rules');
    await step(page, 'find-rules', async () => {
      await humanClick(page, page.getByRole('button', { name: 'Find better rules' }), { afterMs: 300 });
      await expect(page.getByRole('heading', { name: /Selected terms \([1-9]\d*\)/ })).toBeVisible({ timeout: 40_000 });
    }, { critical: true });
    await sleep(2000);
    tl.mark('rules');

    // ---- step 6: fresh wave, approve and push, undo -----------------------------------------------
    await caption('Test on a fresh wave');
    await step(page, 'fresh-wave', async () => {
      await humanClick(page, page.getByRole('button', { name: 'Test on a fresh wave' }), { afterMs: 300 });
      await expect(page.getByRole('heading', { name: /Fresh wave/ })).toBeVisible(wait);
    }, { critical: true });
    await step(page, 'fresh-wave-proof', async () => {
      await expect(page.getByText(/0 real-chat matches/).first()).toBeVisible(wait);
    });
    await sleep(2200);
    tl.mark('fresh');
    await caption('Approve and push, with one-click undo');
    await step(page, 'push', async () => {
      await humanClick(page, page.getByRole('button', { name: /Simulate push of \d+ terms|Push \d+ terms|Approve/i }).first(), { afterMs: 300 });
      await expect(page.getByText('Added to this demo only', { exact: true }).first()).toBeVisible(wait);
    }, { critical: true });
    await sleep(2200);
    tl.mark('pushed');
    await step(page, 'undo', async () => {
      await humanClick(page, page.getByRole('button', { name: /Undo/i }).first(), { afterMs: 300 });
      await expect(page.getByText('Removed from this demo', { exact: true }).first()).toBeVisible(wait);
    });
    await sleep(2000);
    tl.mark('undone');

    // ---- report card, then the call to action ------------------------------------------------------
    await caption('Your report card');
    await step(page, 'report-card', async () => {
      const summary = page.getByRole('heading', { name: /Drill summary/ }).first();
      await glideTo(page, summary, { settleMs: 2500 });
    });
    tl.mark('report');
    await sleep(1800);
    await caption('');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible(wait);
    await sleep(700);
    tl.mark('cta_start');
    await caption('Try it free, no Twitch account needed');
    await step(page, 'cta-hover', async () => {
      await glideTo(page, page.getByRole('link', { name: /try the demo/i }).first(), { settleMs: 2200 });
    });
    tl.mark('cta_end');
    await sleep(600);
  } finally {
    await rec.finish();
  }
});
