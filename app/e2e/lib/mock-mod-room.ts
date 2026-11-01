/**
 * Mocked moderator room for the mod surface spec: a fake ticket endpoint plus a fake WebSocket, so
 * the joined screens (waiting, practice, end) render without a Worker.
 *
 * Safety (AGENTS.md rule 2): attack text is fixture text only, every link ends in .invalid, slurs are
 * the placeholder `slurx` (rendered as block characters by the app), no tokens are real.
 */
import type { Page } from '@playwright/test';

export type ModScenario = 'waiting' | 'practice' | 'ended';

type Line = { lineId: string; user: string; segments: Array<{ kind: 'text' | 'link' | 'slur'; text: string }> };
type ModScore = { participantId: string; name: string; isSim: boolean; caught: number; falseBans: number; avgReactionMs: number | null };

export const ME = { id: 'p-me', name: 'Playwright mod' };
const KAI = { id: 'p-kai', name: 'Kai', isSim: true };
const DANA = { id: 'p-dana', name: 'Dana', isSim: false };

const text = (value: string) => ({ kind: 'text' as const, text: value });
const LINES: Line[] = [
  { lineId: 'l1', user: 'viewer_8841', segments: [text('want free followers? claim at '), { kind: 'link', text: 'fre3-fol.invalid/claim' }] },
  { lineId: 'l2', user: 'bot_wave_02', segments: [text('BUY cheap v1ewers now '), { kind: 'link', text: 'cheap-v.invalid' }] },
  { lineId: 'l3', user: 'regular_nia', segments: [text('that clutch was unreal, gg')] },
  { lineId: 'l4', user: 'raider_x', segments: [text('go away '), { kind: 'slur', text: 'slurx' }, text(' crew')] },
  { lineId: 'l5', user: 'spam_acct', segments: [text('f r e e  f o l l o w e r s  here')] },
  { lineId: 'l6', user: 'viewer_1207', segments: [text('promo code at '), { kind: 'link', text: 'promo-d.invalid' }, text(' hurry')] }
];

const score = (slipped: number): { mods: ModScore[]; slipped: number; attacksShown: number } => ({
  mods: [
    { participantId: ME.id, name: ME.name, isSim: false, caught: 2, falseBans: 1, avgReactionMs: 2300 },
    { participantId: KAI.id, name: KAI.name, isSim: true, caught: 1, falseBans: 0, avgReactionMs: 3100 },
    { participantId: DANA.id, name: DANA.name, isSim: false, caught: 0, falseBans: 0, avgReactionMs: null }
  ],
  slipped,
  attacksShown: 5
});

function snapshot(scenario: ModScenario): unknown {
  const participants = [
    { id: ME.id, name: ME.name, isSim: false, online: true },
    { id: KAI.id, name: KAI.name, isSim: true, online: true },
    { id: DANA.id, name: DANA.name, isSim: false, online: false }
  ];
  if (scenario === 'waiting') return { drill: null, participants };
  const states: Array<{ state: 'open' | 'acted' | 'slipped'; actedByName?: string; action?: 'delete' | 'timeout' | 'ban' }> = [
    { state: 'acted', actedByName: ME.name, action: 'ban' },
    { state: 'acted', actedByName: KAI.name, action: 'delete' },
    { state: 'acted', actedByName: ME.name, action: 'ban' },
    { state: 'slipped' },
    { state: 'open' },
    { state: 'open' }
  ];
  const ended = scenario === 'ended';
  return {
    drill: {
      drillId: 'd-1',
      status: ended ? 'ended' : 'running',
      startedAt: Date.now() - 95_000,
      total: 6,
      lines: LINES.map((line, index) => {
        const base = states[index] ?? { state: 'open' as const };
        return { line, shownAt: Date.now() - (6 - index) * 12_000, ...(ended && base.state === 'open' ? { state: 'slipped' } : base) };
      }),
      score: score(ended ? 3 : 1),
      ...(ended ? { reveal: [
        { lineId: 'l1', kind: 'attack', tactic: 'linkscam', tags: ['link scam', 'leet spelling'] },
        { lineId: 'l2', kind: 'attack', tactic: 'botwave', tags: ['bot wave', 'dotted link'] },
        { lineId: 'l3', kind: 'banter', tags: [] },
        { lineId: 'l4', kind: 'attack', tactic: 'hateraid', tags: ['hate raid', 'blocked-term lookalike'] },
        { lineId: 'l5', kind: 'attack', tactic: 'spam', tags: ['spam', 'spaced letters'] },
        { lineId: 'l6', kind: 'attack', tactic: 'linkscam', tags: ['link scam', 'bracket link'] }
      ] } : {})
    },
    participants
  };
}

function events(scenario: ModScenario): unknown[] {
  if (scenario === 'waiting') return [];
  const action = (lineId: string, p: { id: string; name: string; isSim?: boolean }, act: string, reactionMs: number, falseBan: boolean) =>
    ({ type: 'drill.action', data: { lineId, participantId: p.id, name: p.name, isSim: p.isSim ?? false, action: act, reactionMs, falseBan } });
  const out: unknown[] = [
    action('l1', ME, 'ban', 1800, false),
    action('l2', KAI, 'delete', 3100, false),
    action('l3', ME, 'ban', 2800, true)
  ];
  if (scenario === 'ended') {
    out.push({ type: 'mod.history', data: [{ name: ME.name, drills: [
      { drillId: 'd-0', caught: 3, falseBans: 0, avgReactionMs: 2900 },
      { drillId: 'd-1', caught: 2, falseBans: 1, avgReactionMs: 2300 }
    ] }] });
  }
  return out;
}

/**
 * Install the mocks. Returns the list of client messages the page sent over the socket, so a spec can
 * assert that D, T and B reach the room.
 */
export async function mockModRoom(page: Page, room: string, scenario: ModScenario): Promise<unknown[]> {
  const sent: unknown[] = [];
  await page.addInitScript(({ key, session }) => {
    try { sessionStorage.setItem(key, JSON.stringify(session)); } catch { /* storage blocked: the join card shows instead */ }
  }, { key: `mfd_mod_demo:${room}`, session: { participantId: ME.id, participantToken: 'surface-test-token', displayName: ME.name } });

  await page.route(`**/api/demo/${room}/mod/ticket`, async (route) => {
    const origin = new URL(route.request().url()).origin.replace(/^http/, 'ws');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ticket: 'surface-test', wsUrl: `${origin}/ws/surface-test` }) });
  });
  await page.route(`**/api/demo/${room}/**`, async (route) => {
    if (route.request().url().endsWith('/mod/ticket')) { await route.fallback(); return; }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });
  await page.routeWebSocket(/\/ws\/surface-test/, (ws) => {
    ws.onMessage((raw) => {
      if (typeof raw !== 'string' || raw === 'ping') return;
      try { sent.push(JSON.parse(raw)); } catch { /* ignore */ }
    });
    ws.send(JSON.stringify({ type: 'hello', data: { role: 'mod', participantId: ME.id, serverTime: Date.now() } }));
    ws.send(JSON.stringify({ type: 'drill.state', data: snapshot(scenario) }));
    for (const event of events(scenario)) ws.send(JSON.stringify(event));
  });
  return sent;
}
