import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { RAW_DIR, sleep, startRecording } from './lib/stage';

/**
 * Flow 0: the branded intro and the two outro variants (README says "reading", the video says "watching").
 * Small static HTML pages in app/e2e/gifs/cards, built only from the brand kit (brand/logo/svg, brand/fonts,
 * brand/DESIGN.md colours). CSS animation, recorded at 1920x1080 by the same pipeline as the product flows;
 * the converter cuts them at the marks below and bakes them into hero.gif (intro) and end.gif (outro).
 * Also writes the reduced-motion stills (no animation) used as the static fallback.
 */

const CARDS = resolve('app/e2e/gifs/cards');
const url = (file: string, query = ''): string => `${pathToFileURL(resolve(CARDS, file)).href}${query}`;

async function playCard(page: import('@playwright/test').Page, address: string, ms: number, begin: () => void, end: () => void): Promise<void> {
  await page.goto(address);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, undefined, { timeout: 20_000 });
  await sleep(150);
  await page.evaluate(() => (window as unknown as { __go: () => void }).__go());
  begin();
  await sleep(ms);
  end();
}

test('record the intro and outro cards', async ({ browser }) => {
  test.setTimeout(2 * 60_000);
  const rec = await startRecording(browser, undefined, { name: 'cards', width: 1920, height: 1080 });
  const { page, timeline: tl } = rec;
  try {
    await playCard(page, url('intro.html'), 3300, () => tl.mark('intro_start'), () => tl.mark('intro_end'));
    await playCard(page, url('outro.html', '?say=reading'), 4300, () => tl.mark('outro_reading_start'), () => tl.mark('outro_reading_end'));
    await playCard(page, url('outro.html', '?say=watching'), 4300, () => tl.mark('outro_watching_start'), () => tl.mark('outro_watching_end'));
  } finally {
    await rec.finish();
  }

  // static fallbacks: reduced motion shows the final frame of each card
  mkdirSync(resolve(RAW_DIR, 'stills'), { recursive: true });
  const still = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const sp = await still.newPage();
  for (const [file, query, out] of [['intro.html', '', 'intro-static.png'], ['outro.html', '?say=reading', 'outro-static.png'], ['outro.html', '?say=watching', 'outro-video-static.png']] as const) {
    await sp.goto(url(file, query));
    await sp.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    await sp.screenshot({ path: resolve(RAW_DIR, 'stills', out) });
  }
  await still.close();
  expect(true).toBe(true);
});
