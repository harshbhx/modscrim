import { expect, test, type Page } from '@playwright/test';
import { SHOTS, WIDTHS } from './lib/shots';
import { installConsoleMock, type ConsoleMock, type ConsoleMockOptions, type ConsoleMode } from './lib/console-mock';

/**
 * Streamer console surface specs (T-130, T-131). The Worker is replaced by the
 * stateful fixture in lib/console-mock.ts, so every step renders its real
 * states. One walkthrough per mode (signed-in `/console`, demo `/demo/:room`),
 * colour scheme and width; each walkthrough writes one screenshot per step.
 */

const ROOM = 'surface-test';
const SCHEMES = ['light', 'dark'] as const;

type Shot = (name: string) => Promise<void>;

function shooter(page: Page, mode: ConsoleMode, size: string, scheme: string): Shot {
  return async (name) => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/console-${mode}-${name}-${size}-${scheme}.png`, fullPage: true });
  };
}

async function setup(page: Page, baseURL: string | undefined, options: Omit<ConsoleMockOptions, 'staticBase'>): Promise<ConsoleMock> {
  return installConsoleMock(page, { staticBase: baseURL ?? 'http://127.0.0.1:4173', ...options });
}

function noFixtureErrors(mock: ConsoleMock): void {
  expect(mock.calls.filter((call) => call.startsWith('FIXTURE ERROR'))).toEqual([]);
}

/** Steps 1 to 6 in order, with a screenshot per step and the states between them. */
async function walkThrough(page: Page, mock: ConsoleMock, mode: ConsoleMode, shot: Shot): Promise<void> {
  const demo = mode === 'demo';
  await mock.open(page);

  await expect(page.getByRole('heading', { name: 'Read filters', exact: true })).toBeVisible();
  await expect(page.getByText('free followers', { exact: true })).toBeVisible();
  await shot('1-filters');

  await page.getByRole('button', { name: 'Continue to configure' }).click();
  await expect(page.getByRole('heading', { name: 'Configure', exact: true })).toBeVisible();
  await expect(page.getByText('Draft ready')).toBeVisible();
  await expect(page.getByLabel('Join code')).toHaveValue('482915');
  await shot('2-configure');

  await page.getByRole('button', { name: 'Start drill' }).click();
  await expect(page.getByRole('heading', { name: 'Run the drill', exact: true })).toBeVisible();
  await expect(page.getByText(/^15 lines$/)).toBeVisible();
  await shot('3-run');

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drill complete', exact: true })).toBeVisible();
  await expect(page.getByText(/^22 lines$/)).toBeVisible();
  await shot('3-complete');

  await page.getByRole('button', { name: demo ? 'Continue to local estimate' : 'Continue to Twitch grades' }).click();
  if (demo) {
    // demo rooms grade locally as soon as the step opens
    await expect(page.getByRole('heading', { name: 'Local filter estimate', exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Twitch grades', exact: true })).toBeVisible();
    await expect(page.getByText(/Twitch grading in progress/)).toBeVisible();
    await shot('4-grades-running');
    mock.finishTwitchGrading();
  }
  await expect(page.getByText(/^10 of 14 attack lines would get past your filters/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find better rules' })).toBeEnabled();
  await shot('4-grades');

  await page.getByRole('button', { name: 'Find better rules' }).click();
  await expect(page.getByRole('heading', { name: 'Fix the rules', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Selected terms \(4\)$/ })).toBeVisible();
  await shot('5-rules');

  await page.getByRole('button', { name: 'Test on a fresh wave' }).click();
  await expect(page.getByRole('heading', { name: demo ? 'Fresh wave and simulated push' : 'Fresh wave and push', exact: true })).toBeVisible();
  await expect(page.locator('.console-proof-safe').first()).toBeVisible();
  await shot('6-proof');

  await page.getByRole('button', { name: demo ? /^Simulate push of 4 terms$/ : /^Approve and push 4 terms to Twitch$/ }).click();
  await expect(page.getByRole('heading', { name: 'Drill summary', exact: true })).toBeVisible();
  await expect(page.getByText(demo ? 'Added to this demo only' : 'Added to Twitch', { exact: true }).first()).toBeVisible();
  await shot('6-pushed');
  noFixtureErrors(mock);
}

for (const mode of ['live', 'demo'] as const) {
  for (const scheme of SCHEMES) {
    for (const size of WIDTHS) {
      test.describe(`console ${mode} walkthrough`, () => {
        test.use({ colorScheme: scheme, viewport: { width: size.width, height: size.height } });
        test(`all six steps at ${size.name}px in ${scheme}`, async ({ page, baseURL }) => {
          test.setTimeout(120_000);
          const mock = await setup(page, baseURL, { mode, room: ROOM });
          await walkThrough(page, mock, mode, shooter(page, mode, size.name, scheme));
        });
      });
    }
  }
}

test.describe('console behaviour', () => {
  test.use({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });

  test('shows a realistic mod link, not the test host', async ({ page, baseURL }) => {
    const mock = await setup(page, baseURL, { mode: 'demo', room: ROOM });
    await mock.open(page);
    await expect(page.getByLabel('Mod link')).toHaveValue(`https://app.modscrim.dualmindlab.tech/demo/${ROOM}/mod`);
    await expect(page.getByText('Demo filters are unavailable')).toHaveCount(0);
    noFixtureErrors(mock);
  });

  test('stepper marks the current step and keeps every step reachable by keyboard', async ({ page, baseURL }) => {
    const mock = await setup(page, baseURL, { mode: 'demo', room: ROOM });
    await mock.open(page);
    const nav = page.getByRole('navigation', { name: 'Drill steps' });
    await expect(nav.getByRole('button', { name: 'Step 1: Read filters', exact: true })).toHaveAttribute('aria-current', 'step');
    await expect(nav.getByRole('button', { name: 'Step 3: Run the drill, locked', exact: true })).toBeDisabled();
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => Boolean(document.activeElement?.closest('.console-stepper')))) break;
    }
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    await expect(nav.getByRole('button', { name: 'Step 2: Configure', exact: true })).toBeEnabled();
  });

  test('sample chat lines stay blurred until hover or focus (S-08)', async ({ page, baseURL }) => {
    const mock = await setup(page, baseURL, { mode: 'live' });
    await mock.open(page);
    const sample = page.locator('.console-blurred-sample').first();
    await expect(sample).toBeVisible();
    const blur = () => sample.locator('span').evaluate((el) => getComputedStyle(el).filter);
    expect(await blur()).toContain('blur');
    await sample.focus();
    await expect.poll(blur).toBe('none');
  });

  test('orange fills keep their border-strong outline and hover is a box-shadow', async ({ page, baseURL }) => {
    const mock = await setup(page, baseURL, { mode: 'demo', room: ROOM });
    await mock.open(page);
    const button = page.getByRole('button', { name: 'Continue to configure' });
    const measure = () => button.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { border: style.borderTopWidth, shadow: style.boxShadow, width: box.width, height: box.height };
    });
    await page.mouse.move(0, 0);
    const before = await measure();
    expect(Number.parseFloat(before.border)).toBeGreaterThanOrEqual(2);
    await button.hover();
    await expect.poll(async () => (await measure()).shadow).not.toBe(before.shadow);
    const after = await measure();
    expect(after.border).toBe(before.border);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });
});

type StateCase = { name: string; options: Omit<ConsoleMockOptions, 'staticBase'>; ready: (page: Page) => Promise<void>; waitMs?: number };

const STATES: StateCase[] = [
  {
    name: 'filters-error',
    options: { mode: 'demo', room: ROOM, filters: 'error' },
    ready: async (page) => { await expect(page.getByRole('alert')).toContainText('Demo filters are unavailable'); }
  },
  {
    name: 'empty',
    options: { mode: 'live', filters: 'empty', chatLog: 'empty' },
    ready: async (page) => { await expect(page.getByText(/no public blocked terms/)).toBeVisible(); }
  },
  {
    name: 'loading',
    options: { mode: 'live', delayMs: 4000 },
    ready: async (page) => { await expect(page.getByText('Loading your channel console…')).toBeVisible(); }
  },
  {
    name: 'status-degraded',
    options: { mode: 'live', status: 'degraded' },
    ready: async (page) => { await expect(page.getByRole('button', { name: 'Repair chat connection' })).toBeVisible(); }
  },
  {
    name: 'status-error',
    options: { mode: 'live', status: 'error', chatLog: 'error' },
    ready: async (page) => { await expect(page.getByRole('alert').first()).toBeVisible(); }
  },
  {
    name: 'signed-out',
    options: { mode: 'live', me: 'unauthorized' },
    ready: async (page) => { await expect(page.getByRole('heading', { name: 'Open your channel console' })).toBeVisible(); }
  }
];

const STATE_VIEWS = [
  { size: WIDTHS[0], scheme: 'light' },
  { size: WIDTHS[2], scheme: 'light' },
  { size: WIDTHS[2], scheme: 'dark' }
] as const;

for (const view of STATE_VIEWS) {
  test.describe(`console states ${view.size.name} ${view.scheme}`, () => {
    test.use({ colorScheme: view.scheme, viewport: { width: view.size.width, height: view.size.height } });
    for (const state of STATES) {
      test(state.name, async ({ page, baseURL }) => {
        const mock = await setup(page, baseURL, state.options);
        await mock.open(page);
        await state.ready(page);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${SHOTS}/console-state-${state.name}-${view.size.name}-${view.scheme}.png`, fullPage: true });
        noFixtureErrors(mock);
      });
    }
  });
}
