import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { consoleChat, modChat, openModPage, prepareSafetyDrill, renderedLines } from './lib/safety.js';

/**
 * S-03, S-04 (AGENTS.md rule 2): slurs exist only as the placeholders `slurx` and `slury`, and the UI renders
 * them as block characters. The check is scoped to the rendered sample lines, not the whole page, because the
 * hate-raid warning and the copy deck may talk about placeholders in prose.
 */

const PLACEHOLDER_BLOCK = '\u2587';

/** Undo the cheap tricks (spacing, dots, zero-width, number swaps) so a disguised placeholder still trips. */
function squash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

async function assertSlursAreBlocks(chat: Locator, lines: string[]): Promise<void> {
  for (const line of lines) {
    expect(line, 'a readable placeholder in a rendered line').not.toMatch(/slur[xy]/i);
    expect(squash(line), `a disguised placeholder in "${line}"`).not.toMatch(/slur[xy]/);
  }

  // Where the drill put a slur placeholder, the line shows blocks and nothing else in its place.
  const slurSegments = await chat.locator('[class$="-slur-segment"]').allInnerTexts();
  expect(slurSegments.length, 'the hate-raid tactic rendered at least one placeholder').toBeGreaterThan(0);
  for (const segment of slurSegments) {
    expect(segment, 'slur segment text').toMatch(new RegExp(`^${PLACEHOLDER_BLOCK}+$`));
  }
  expect(lines.join('').includes(PLACEHOLDER_BLOCK), 'block characters are rendered').toBe(true);
}

test('the console renders slur placeholders as blocks, never as text', async ({ page, request, demo, baseURL }) => {
  test.setTimeout(90_000);
  const drill = await prepareSafetyDrill(request, demo, baseURL);
  try {
    await drill.start();
    await page.goto(`/demo/${encodeURIComponent(demo.room)}`);
    const lines = await renderedLines(consoleChat(page));
    await assertSlursAreBlocks(consoleChat(page), lines);
  } finally {
    await drill.stop();
  }
});

test('the mod view renders slur placeholders as blocks, never as text', async ({ page, request, demo, baseURL }) => {
  test.setTimeout(90_000);
  const drill = await prepareSafetyDrill(request, demo, baseURL);
  try {
    const joined = await drill.join('Safety mod');
    await drill.start();
    await openModPage(page, demo, joined);
    const lines = await renderedLines(modChat(page));
    await assertSlursAreBlocks(modChat(page), lines);
  } finally {
    await drill.stop();
  }
});
