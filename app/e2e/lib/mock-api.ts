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

export async function mockSharedReport(page: Page, reportId: string): Promise<void> {
  const report = SharedReportZ.parse({
    reportId,
    channel: { login: 'pixelpanda_tv', displayName: 'Pixel Panda' },
    createdAt: 1730000000000,
    card: {
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
    }
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
