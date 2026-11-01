import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import type { DemoState } from '../fixtures.js';

/**
 * Shared pieces of the T-124 safety specs. Demo rooms only (AGENTS.md rule 8): every drill here is created
 * on the shared demo room that `setup.ts` makes, through the public demo routes.
 *
 * Overlay redaction and the share card are Worker integration tests (`app/test/safety.overlay.test.ts`):
 * a demo room has no public channel entry, so the overlay page cannot be opened for it in a browser.
 */

/**
 * Token shapes of the CI secret scan (`.github/workflows/ci.yml`), anchored to the start of a token so a
 * random run inside a signed URL-safe string cannot match by accident.
 */
export const TOKEN_SHAPES = new RegExp(
  '(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|oauth:[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|' +
    'xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|Bearer\\s+[A-Za-z0-9._~-]{30,})'
);

/** A drill with one line of every kind: links (linkscam, spam), bots, and placeholder slurs (hateraid). */
export const SAFETY_DRILL = {
  tactics: ['linkscam', 'spam', 'botwave', 'hateraid'],
  primaryTactic: 'linkscam',
  attackCount: 8,
  banterCount: 4,
  intervalMs: 800,
  slipWindowMs: 5000,
  seed: 7,
  simMod: false,
  chatVote: false,
  announce: false
} as const;
export const SAFETY_DRILL_LINES = SAFETY_DRILL.attackCount + SAFETY_DRILL.banterCount;

const DraftZ = z.object({ drillId: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/) });
const ViewZ = z.object({ status: z.string() });
const ModJoinZ = z.object({ participantId: z.string().min(1), participantToken: z.string().min(1) });

export type SafetyDrill = {
  drillId: string;
  joinCode: string;
  /** Text of every response the helper itself received, for the token scan. */
  bodies: string[];
  /** Join the drill as a mod and return the sessionStorage entry the mod page reads. */
  join: (displayName: string) => Promise<{ storageKey: string; session: { participantId: string; participantToken: string; displayName: string } }>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

/**
 * Put the shared demo room into a fresh draft with the safety config. An earlier spec may have left a
 * running drill or a draft with other settings behind, so look first, stop a running one, then edit the draft.
 */
export async function prepareSafetyDrill(request: APIRequestContext, demo: DemoState, baseURL: string | undefined): Promise<SafetyDrill> {
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const apiBase = `${origin}/api/demo/${encodeURIComponent(demo.room)}`;
  const bodies: string[] = [];

  async function send(method: 'POST' | 'PATCH' | 'GET', path: string, data?: unknown): Promise<unknown> {
    const response = method === 'GET'
      ? await request.get(`${apiBase}${path}`)
      : await request.fetch(`${apiBase}${path}`, { method, headers: { Origin: origin }, data: data ?? {} });
    const body = await response.text();
    bodies.push(body);
    expect(response.ok(), `${method} ${path} returned ${response.status()}: ${body}`).toBeTruthy();
    return JSON.parse(body) as unknown;
  }

  let draft = DraftZ.parse(await send('POST', '/drills', SAFETY_DRILL));
  const status = ViewZ.parse(await send('GET', `/drills/${draft.drillId}`)).status;
  if (status !== 'draft') {
    // A drill is running or voting: stop it, then the next create opens a new draft.
    await send('POST', `/drills/${draft.drillId}/stop`);
    draft = DraftZ.parse(await send('POST', '/drills', SAFETY_DRILL));
  }
  await send('PATCH', `/drills/${draft.drillId}`, SAFETY_DRILL);

  const drillId = draft.drillId;
  return {
    drillId,
    joinCode: draft.joinCode,
    bodies,
    async join(displayName) {
      const mod = ModJoinZ.parse(await send('POST', '/mod/join', { code: draft.joinCode, displayName }));
      return {
        storageKey: `mfd_mod_demo:${demo.room}`,
        session: { participantId: mod.participantId, participantToken: mod.participantToken, displayName }
      };
    },
    async start() {
      await send('POST', `/drills/${drillId}/start`);
    },
    async stop() {
      // Already ended (or never started) is fine: the next spec looks before it creates.
      await request.fetch(`${apiBase}/drills/${drillId}/stop`, { method: 'POST', headers: { Origin: origin }, data: {} }).catch(() => undefined);
    }
  };
}

/** Open the mod page for a joined mod. */
export async function openModPage(page: Page, demo: DemoState, joined: Awaited<ReturnType<SafetyDrill['join']>>): Promise<void> {
  await page.addInitScript(({ storageKey, session }) => {
    sessionStorage.setItem(storageKey, JSON.stringify(session));
  }, joined);
  await page.goto(`/demo/${encodeURIComponent(demo.room)}/mod`);
}

/** The streamer console's chat list (the "Practice chat" region of the run step). */
export function consoleChat(page: Page) {
  return page.getByRole('region', { name: 'Practice chat', exact: true });
}

/** The mod view's chat list. */
export function modChat(page: Page) {
  return page.getByRole('region', { name: 'Every line stays in this room', exact: true });
}

/**
 * Wait until the drill has shown all its lines in a chat region. Lines are list items, so this needs no
 * styling hooks. Returns the rendered text of each line, zero-width characters removed.
 */
export async function renderedLines(chat: Locator): Promise<string[]> {
  const items = chat.getByRole('listitem');
  await expect.poll(() => items.count(), { timeout: 45_000, message: 'all drill lines render' }).toBeGreaterThanOrEqual(SAFETY_DRILL_LINES);
  return (await items.allInnerTexts()).map((text) => text.replace(/[\u200b-\u200d\ufeff]/g, ''));
}
