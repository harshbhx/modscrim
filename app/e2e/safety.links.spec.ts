import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { consoleChat, modChat, openModPage, prepareSafetyDrill, renderedLines } from './lib/safety.js';

/**
 * S-02 (AGENTS.md rule 2): every generated link ends in `.invalid`. Checked on the lines the streamer console
 * and the mod view actually render, never on the whole page (the app legitimately links to the site, GitHub
 * and Twitch sign-in outside the sample chat).
 */

/** The ways the generator may write the separator before the reserved TLD. */
const INVALID_TLD = /(?:\.| \.|\[\.\]| dot )invalid$/i;

async function assertLinksAreInvalid(chat: Locator, lines: string[]): Promise<void> {
  // Anchors inside the sample: none today, but any that appear must point at a `.invalid` host.
  for (const href of await chat.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''))) {
    expect(new URL(href, 'https://placeholder.invalid').hostname, `anchor ${href}`).toMatch(/\.invalid$/);
  }

  // Link segments the generator marked as links: the text must end in `.invalid` (any separator trick).
  const segments = await chat.locator('[class$="-link-segment"]').allInnerTexts();
  expect(segments.length, 'the drill rendered at least one link').toBeGreaterThan(0);
  for (const segment of segments) {
    expect(segment.replace(/[\u200b-\u200d\ufeff]/g, '').trim(), `link segment "${segment}"`).toMatch(INVALID_TLD);
  }

  // Anything else in a line that looks like host.tld (attack text, banter, usernames) must also be `.invalid`.
  for (const line of lines) {
    const normalised = line.replace(/\[\.\]/g, '.').replace(/ \./g, '.');
    for (const host of normalised.match(/[A-Za-z0-9-]+\.[A-Za-z]{2,}\b/g) ?? []) {
      expect(host, `host-like text in "${line}"`).toMatch(/\.invalid$/i);
    }
  }
}

test('every link in the console sample chat ends in .invalid', async ({ page, request, demo, baseURL }) => {
  test.setTimeout(90_000);
  const drill = await prepareSafetyDrill(request, demo, baseURL);
  try {
    await drill.start();
    await page.goto(`/demo/${encodeURIComponent(demo.room)}`);
    const lines = await renderedLines(consoleChat(page));
    await assertLinksAreInvalid(consoleChat(page), lines);
  } finally {
    await drill.stop();
  }
});

test('every link in the mod view sample chat ends in .invalid', async ({ page, request, demo, baseURL }) => {
  test.setTimeout(90_000);
  const drill = await prepareSafetyDrill(request, demo, baseURL);
  try {
    const joined = await drill.join('Safety mod');
    await drill.start();
    await openModPage(page, demo, joined);
    const lines = await renderedLines(modChat(page));
    await assertLinksAreInvalid(modChat(page), lines);
  } finally {
    await drill.stop();
  }
});
