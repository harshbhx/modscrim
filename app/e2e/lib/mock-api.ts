/**
 * API and WebSocket mocks for surface specs. Each function intercepts calls so
 * the SPA renders without a running Worker or Twitch connection.
 *
 * Every payload is built with the zod schema the app itself parses it with
 * (app/src/lib/contracts.ts), so a fixture that drifts from the real shape
 * throws in the spec instead of screenshotting a state the app never reaches.
 *
 * Safety (AGENTS.md rule 2): no real links (all .invalid), no real slurs (only
 * slurx/slury as blocks), no tokens. Overlay payloads are redacted only.
 */
import type { Page } from '@playwright/test';
import type { z } from 'zod';
import {
  ChannelInfoZ,
  ChatLogZ,
  FiltersZ,
  OverlayServerMsgZ,
  SharedReportZ,
  type OverlayServerMsg
} from '../../src/lib/contracts';

const NOT_FOUND = { status: 404, contentType: 'application/json', body: '{"error":"not_found"}' } as const;

export async function mockConsoleDemo(page: Page, room: string): Promise<void> {
  const base = `/api/demo/${room}`;

  const filters = FiltersZ.parse({
    terms: [
      { id: 't1', text: 'free followers' },
      { id: 't2', text: 'cheap viewers' },
      { id: 't3', text: 'promo.invalid' }
    ],
    automod: {
      overall_level: 2,
      disability: 1,
      aggression: 2,
      sexuality_sex_or_gender: 2,
      misogyny: 1,
      bullying: 2,
      swearing: 1,
      race_ethnicity_or_religion: 3,
      sex_based_terms: 1
    },
    fetchedAt: 1730000000000
  });

  const chatLog = ChatLogZ.parse({
    count: 71,
    oldest: 1730000000000 - 86400_000,
    newest: 1730000000000 - 300_000,
    logging: false,
    samples: [
      { login: 'viewer_one', text: 'great stream today' },
      { login: 'viewer_two', text: 'love the new emote' },
      { login: 'mod_helper', text: 'welcome everyone' }
    ]
  });

  await page.route(`${base}/filters`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filters) }));
  await page.route(`${base}/chatlog/stats`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chatLog) }));
  await page.route(`${base}/**`, (route) => route.fulfill(NOT_FOUND));
}

export type SharedCard = z.infer<typeof SharedReportZ>['card'];

const DEFAULT_SHARED_CARD: SharedCard = {
  attacksShown: 18,
  slipped: 3,
  mods: [
    { name: 'Mod 1', isSim: false, caught: 12, falseBans: 1, avgReactionMs: 2400 },
    { name: 'Mod 2', isSim: false, caught: 3, falseBans: 0, avgReactionMs: 3100 },
    { name: 'Kai', isSim: true, caught: 0, falseBans: 0, avgReactionMs: null }
  ],
  grade: { passed: 7, total: 18, engine: 'local' },
  termsPushed: 2,
  fresh: { before: 14, after: 17, total: 18 }
};

export async function mockSharedReport(page: Page, reportId: string, card: SharedCard = DEFAULT_SHARED_CARD): Promise<void> {
  const report = SharedReportZ.parse({
    reportId,
    channel: { login: 'pixelpanda_tv', displayName: 'Pixel Panda' },
    createdAt: 1730000000000,
    card
  });
  await page.route(`/api/public/reports/${reportId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) })
  );
}

export async function mockModDemo(page: Page, room: string): Promise<void> {
  await page.route(`/api/public/channel/**`, (route) => route.fulfill(NOT_FOUND));
  await page.route(`/api/demo/${room}/**`, (route) => route.fulfill(NOT_FOUND));
}

const OVERLAY_BROADCASTER_ID = 'demo:overlay-test';

export async function mockOverlay(page: Page, channel: string): Promise<void> {
  const info = ChannelInfoZ.parse({
    broadcasterId: OVERLAY_BROADCASTER_ID,
    displayName: 'Pixel Panda',
    avatarUrl: null,
    drillOpen: true
  });
  await page.route(`/api/public/channel/${channel}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(info) })
  );
}

/**
 * Overlay socket frames for a running drill: redacted lines (length only) and
 * numbers. With `withReport` the after-action card follows the drill state.
 */
export function overlayFrames(withReport: boolean): OverlayServerMsg[] {
  const frames: unknown[] = [
    { type: 'hello', data: { role: 'overlay', serverTime: 1730000000000 } },
    {
      type: 'drill.state',
      data: {
        drill: {
          drillId: 'drill-surface',
          status: 'running',
          startedAt: 1730000000000,
          total: 18,
          lines: [
            { line: { lineId: 'l1', user: 'viewer_a', len: 64 }, shownAt: 1730000001000, state: 'acted' },
            { line: { lineId: 'l2', user: 'viewer_b', len: 120 }, shownAt: 1730000002000, state: 'slipped' },
            { line: { lineId: 'l3', user: 'viewer_c', len: 36 }, shownAt: 1730000003000, state: 'open' }
          ],
          score: {
            mods: [
              { participantId: 'p1', name: 'Mod 1', isSim: false, caught: 1, falseBans: 0, avgReactionMs: 2100 },
              { participantId: 'p2', name: 'Kai', isSim: true, caught: 0, falseBans: 0, avgReactionMs: null }
            ],
            slipped: 1,
            attacksShown: 3
          }
        },
        participants: [
          { id: 'p1', name: 'Mod 1', isSim: false, online: true },
          { id: 'p2', name: 'Kai', isSim: true, online: true }
        ]
      }
    },
    ...(withReport ? [{
      type: 'report.ready',
      data: {
        drillId: 'drill-surface',
        card: {
          drillId: 'drill-surface',
          attacksShown: 18,
          slipped: 3,
          mods: [{ name: 'Mod 1', isSim: false, caught: 12, falseBans: 1, avgReactionMs: 2400 }],
          grade: { passed: 7, total: 18, engine: 'local' },
          termsPushed: 2,
          fresh: { before: 14, after: 17, total: 18 }
        }
      }
    }] : [])
  ];
  return frames.map((frame) => OverlayServerMsgZ.parse(frame));
}

/**
 * Stand in for the Worker's overlay socket with `page.routeWebSocket`. Only the
 * frames built by `overlayFrames` (validated redacted payloads) are sent.
 */
export async function mockOverlaySocket(page: Page, frames: OverlayServerMsg[]): Promise<void> {
  await page.routeWebSocket(/\/ws\/ch\//, (ws) => {
    for (const frame of frames) ws.send(JSON.stringify(frame));
  });
}

/**
 * A fake overlay socket. It sends what the Worker's overlay role sends and nothing more (SRS 8.3):
 * redacted lines (`lineId`, `user`, `len`), numbers, and the numbers-only report card. There is no
 * `segments` field and no term anywhere in these fixtures, so a leak in the DOM can only come from
 * the page itself.
 */
export type OverlayFixture = {
  status: 'running' | 'ended';
  lines: Array<{ user: string; len: number; state: 'open' | 'acted' | 'slipped' }>;
  mods: Array<{ name: string; isSim: boolean; caught: number; falseBans: number; avgReactionMs: number | null }>;
  slipped: number;
  report?: SharedCard;
};

export const OVERLAY_KEY = 'overlay-fixture-key';

export const OVERLAY_SHORT: OverlayFixture = {
  status: 'running',
  lines: [
    { user: 'ava_v', len: 24, state: 'acted' },
    { user: 'bot_17', len: 62, state: 'slipped' },
    { user: 'cleo', len: 31, state: 'open' },
    { user: 'dax', len: 88, state: 'acted' },
    { user: 'eli', len: 40, state: 'open' },
    { user: 'fern', len: 54, state: 'open' }
  ],
  mods: [
    { name: 'Mod 1', isSim: false, caught: 3, falseBans: 0, avgReactionMs: 1800 },
    { name: 'Mod 2', isSim: true, caught: 1, falseBans: 1, avgReactionMs: 2400 }
  ],
  slipped: 1
};

/** Longer names, bigger numbers, more rows and a different status: nothing may move. */
export const OVERLAY_LONG: OverlayFixture = {
  status: 'ended',
  lines: Array.from({ length: 16 }, (_, i) => ({
    user: i % 2 === 0 ? `a_streamer_with_a_very_long_viewer_name_${i}` : `x${i}`,
    len: 6 + ((i * 37) % 120),
    state: (['acted', 'slipped', 'open'] as const)[i % 3] ?? 'open'
  })),
  mods: Array.from({ length: 6 }, (_, i) => ({
    name: `A moderator with an extremely long display name number ${i + 1}`,
    isSim: i % 2 === 1,
    caught: 1000 + i * 111,
    falseBans: 100 + i,
    avgReactionMs: 12_345 + i
  })),
  slipped: 12_345
};

export async function mockOverlayFixtureSocket(page: Page, fixture: OverlayFixture, goodKey: string = OVERLAY_KEY): Promise<void> {
  await page.routeWebSocket(/\/ws\/ch\//, (ws) => {
    const key = new URL(ws.url()).searchParams.get('overlayKey');
    if (key !== goodKey) {
      ws.close({ code: 1008, reason: 'bad key' });
      return;
    }
    const send = (type: string, data: unknown): void => ws.send(JSON.stringify({ type, data }));
    send('hello', { role: 'overlay', serverTime: 1730000000000 });
    send('drill.state', {
      drill: {
        drillId: 'drill-fixture',
        status: fixture.status,
        startedAt: 1730000000000,
        total: 20,
        lines: fixture.lines.map((line, i) => ({
          line: { lineId: `l${i}`, user: line.user, len: line.len },
          shownAt: 1730000000000 + i * 1500,
          state: line.state
        })),
        score: {
          mods: fixture.mods.map((mod, i) => ({ participantId: `p${i}`, ...mod })),
          slipped: fixture.slipped,
          attacksShown: 20
        }
      },
      participants: []
    });
    if (fixture.report) send('report.ready', { drillId: 'drill-fixture', card: { drillId: 'drill-fixture', ...fixture.report } });
  });
}
