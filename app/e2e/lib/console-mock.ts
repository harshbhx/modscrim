/**
 * A stateful stand-in for the Worker, for the streamer console surface specs.
 *
 * It answers the REST routes the console calls (demo room under `/api/demo/:room`
 * and the signed-in console under `/api`) and drives the console socket with
 * `page.routeWebSocket`, so every one of the six steps renders its real states
 * (filters, draft, live drill, grades, rules, proof, push, report) without a
 * Worker, a Twitch login or the network.
 *
 * Every payload is built with the zod schema the app itself parses it with
 * (src/lib/contracts.ts, src/lib/consoleContracts.ts), so a fixture that drifts
 * from the real shape throws in the spec instead of screenshotting a state the
 * app never reaches. Socket frames are typed as core's `ServerMsg`.
 *
 * Page origin: the SPA is served by a static server on a test host. To get a
 * realistic mod link in the screenshots the page is opened on DEMO_HOST and
 * every non-mocked request is forwarded to the static server.
 *
 * Safety (AGENTS.md rule 2): every generated link ends in `.invalid`, no real
 * slurs (none appear at all), no tokens, banter only from the curated pool.
 */
import type { Page, Route, WebSocketRoute } from '@playwright/test';
import type { DrillSnapshot, Reveal, Segment, ServerMsg } from '@mfd/core';
import { ChatLogZ, FiltersZ } from '../../src/lib/contracts';
import {
  DraftResponseZ, DrillViewZ, GradeLocalZ, GradeQueuedZ, GradesViewZ, MeZ, ProofResultZ, PushResultsZ,
  ReportViewZ, RuleResultZ, StartResponseZ, StatusViewZ, StopResponseZ,
  type GradesView, type PushResult
} from '../../src/lib/consoleContracts';

export const DEMO_HOST = 'https://app.modscrim.dualmindlab.tech';
const CHANNEL = 'pixelpanda_tv';
const DRILL_ID = 'drill-fixture-01';
const JOIN_CODE = '482915';

export type ConsoleMode = 'demo' | 'live';
export type ConsoleMockOptions = {
  mode: ConsoleMode;
  room?: string;
  /** Where the built SPA is served (the static server). */
  staticBase: string;
  /** Replace what a data route answers, to render an error or an empty state. */
  filters?: 'ok' | 'error' | 'empty';
  chatLog?: 'ok' | 'error' | 'empty';
  status?: 'ok' | 'degraded' | 'error';
  me?: 'ok' | 'unauthorized' | 'error';
  /** Hold every data response for this long, to render loading states. */
  delayMs?: number;
};

type Wave = {
  id: string; user: string; kind: 'attack' | 'banter'; tactic?: 'linkscam' | 'spam' | 'botwave';
  trick?: string; tags: string[]; segments: Segment[];
  /** Whether the channel's three blocked terms already catch it (so the grade says "blocked"). */
  blocked?: string;
};

const t = (text: string): Segment => ({ kind: 'text', text });
const link = (text: string): Segment => ({ kind: 'link', text });

/** 14 attack lines and 8 banter lines: the default drill size. Links are `.invalid` only. */
export const WAVE: Wave[] = [
  { id: 'l01', user: 'viewer_8841', kind: 'attack', tactic: 'linkscam', trick: 'plain', tags: ['link', 'followers'], segments: [t('free followers here > '), link('growfast-tv.invalid')], blocked: 'free followers' },
  { id: 'l02', user: 'sam_plays', kind: 'banter', tags: [], segments: [t('lmao the boss one-shot you again')] },
  { id: 'l03', user: 'viewer_2210', kind: 'attack', tactic: 'linkscam', trick: 'leet', tags: ['link', 'followers'], segments: [t('fr33 f0llowers + v1ewers '), link('boost-hub.invalid')] },
  { id: 'l04', user: 'x_bot_4471', kind: 'attack', tactic: 'spam', trick: 'caps', tags: ['caps', 'viewers'], segments: [t('CHEAP VIEWERS ARE LIVE GET THEM NOW')], blocked: 'cheap viewers' },
  { id: 'l05', user: 'luna_arts', kind: 'banter', tags: [], segments: [t('gg that was clean')] },
  { id: 'l06', user: 'viewer_9302', kind: 'attack', tactic: 'botwave', trick: 'plain', tags: ['follow-me'], segments: [t('hi streamer big fan please follow me back')] },
  { id: 'l07', user: 'viewer_5518', kind: 'attack', tactic: 'spam', trick: 'stretch', tags: ['stretch', 'viewers'], segments: [t('cheeeeap viewerrrrs for your channeeel')] },
  { id: 'l08', user: 'ravenwing', kind: 'banter', tags: [], segments: [t('first time here, love the vibes')] },
  { id: 'l09', user: 'viewer_7064', kind: 'attack', tactic: 'linkscam', trick: 'bracket', tags: ['link', 'promo'], segments: [t('promo code STREAM50 at '), link('promo.invalid')], blocked: 'promo.invalid' },
  { id: 'l10', user: 'viewer_3391', kind: 'attack', tactic: 'botwave', trick: 'plain', tags: ['follow-me'], segments: [t('hi streamer big fan check my profile')] },
  { id: 'l11', user: 'tomo_k', kind: 'banter', tags: [], segments: [t('this soundtrack slaps')] },
  { id: 'l12', user: 'viewer_6120', kind: 'attack', tactic: 'spam', trick: 'emoji', tags: ['emoji', 'boost'], segments: [t('🔥 promo 🔥 boost your channel 🔥 promo 🔥')] },
  { id: 'l13', user: 'viewer_1847', kind: 'attack', tactic: 'botwave', trick: 'lookalike', tags: ['lookalike', 'follow-me'], segments: [t('hі streаmer bіg fаn follow me')] },
  { id: 'l14', user: 'mika_cat', kind: 'banter', tags: [], segments: [t('hydrate check')] },
  { id: 'l15', user: 'viewer_4408', kind: 'attack', tactic: 'spam', trick: 'dotted', tags: ['dotted', 'viewers'], segments: [t('c.h.e.a.p v.i.e.w.e.r.s')] },
  { id: 'l16', user: 'viewer_8095', kind: 'attack', tactic: 'linkscam', trick: 'spaced', tags: ['link', 'followers', 'boost'], segments: [t('boost your followers '), link('growfast-tv.invalid')] },
  { id: 'l17', user: 'deepdish', kind: 'banter', tags: [], segments: [t('welcome raiders!')] },
  { id: 'l18', user: 'viewer_2976', kind: 'attack', tactic: 'botwave', trick: 'plain', tags: ['follow-me'], segments: [t('nice stream, follow me and i follow you')] },
  { id: 'l19', user: 'viewer_5603', kind: 'attack', tactic: 'spam', trick: 'plain', tags: ['boost', 'viewers'], segments: [t('boost viewers now, 24/7 support')] },
  { id: 'l20', user: 'orbit_ana', kind: 'banter', tags: [], segments: [t('the lighting in this area is so good')] },
  { id: 'l21', user: 'viewer_7731', kind: 'attack', tactic: 'botwave', trick: 'plain', tags: ['dm-me'], segments: [t('dm me for a collab offer')] },
  { id: 'l22', user: 'pip_squeak', kind: 'banter', tags: [], segments: [t('that raid was huge')] }
];

const textOf = (line: Wave): string => line.segments.map((segment) => segment.text).join('');
const ATTACKS = WAVE.filter((line) => line.kind === 'attack');

const FILTER_TERMS = ['free followers', 'cheap viewers', 'promo.invalid'];

const PARTICIPANTS = [
  { id: 'p-aria', name: 'Aria', isSim: false, online: true },
  { id: 'p-jonah', name: 'Jonah', isSim: false, online: true },
  { id: 'p-kai', name: 'Kai', isSim: true, online: true }
];

function scoreFor(stage: 'running' | 'ended') {
  const ended = stage === 'ended';
  return {
    mods: [
      { participantId: 'p-aria', name: 'Aria', isSim: false, caught: ended ? 5 : 4, falseBans: 1, avgReactionMs: 2100 },
      { participantId: 'p-kai', name: 'Kai', isSim: true, caught: ended ? 5 : 2, falseBans: 0, avgReactionMs: 2800 },
      { participantId: 'p-jonah', name: 'Jonah', isSim: false, caught: ended ? 2 : 1, falseBans: 0, avgReactionMs: 3300 }
    ],
    slipped: ended ? 2 : 1,
    attacksShown: ended ? 14 : 10
  };
}

type Act = { name: string; action: 'delete' | 'timeout' | 'ban' };
/** Who handled which line by the end of the drill; l05 is a false ban on a regular. */
const ACTED: Record<string, Act> = {
  l01: { name: 'Aria', action: 'delete' }, l03: { name: 'Kai', action: 'delete' }, l04: { name: 'Aria', action: 'timeout' },
  l05: { name: 'Aria', action: 'delete' }, l06: { name: 'Jonah', action: 'delete' }, l07: { name: 'Kai', action: 'delete' },
  l09: { name: 'Aria', action: 'ban' }, l10: { name: 'Kai', action: 'delete' }, l12: { name: 'Aria', action: 'delete' },
  l13: { name: 'Jonah', action: 'timeout' }, l15: { name: 'Kai', action: 'delete' }, l16: { name: 'Aria', action: 'delete' },
  l18: { name: 'Kai', action: 'delete' }
};

/** Lines the console socket shows: full text segments for the console role. */
function snapshotLines(stage: 'running' | 'ended'): NonNullable<DrillSnapshot['drill']>['lines'] {
  const ended = stage === 'ended';
  const shown = ended ? WAVE : WAVE.slice(0, 15);
  return shown.map((line, index) => {
    const base = { line: { lineId: line.id, user: line.user, segments: line.segments }, shownAt: 1_730_000_000_000 + index * 1500 };
    const act = ACTED[line.id];
    // mid-drill: l07 slipped past, the two newest attacks are still open
    const open = !ended && (line.id === 'l13' || line.id === 'l15');
    const slipped = ended ? line.id === 'l19' || line.id === 'l21' : line.id === 'l07';
    if (slipped) return { ...base, state: 'slipped' as const };
    if (act && !open) return { ...base, state: 'acted' as const, actedByName: act.name, action: act.action };
    return { ...base, state: 'open' as const };
  });
}

function revealAll(): Reveal[] {
  return WAVE.map((line) => ({ lineId: line.id, kind: line.kind, ...(line.tactic ? { tactic: line.tactic } : {}), tags: line.tags }));
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export type ConsoleMock = {
  /** Path to open: `/demo/:room` or `/console`. */
  path: string;
  /** Open the page on the realistic host. */
  open: (page: Page) => Promise<void>;
  /** Flip a Twitch-graded phase to finished and tell the socket. */
  finishTwitchGrading: () => void;
  /** Calls the SPA made, as "METHOD path", for assertions. */
  calls: string[];
};

export async function installConsoleMock(page: Page, options: ConsoleMockOptions): Promise<ConsoleMock> {
  const demo = options.mode === 'demo';
  const room = options.room ?? 'surface-test';
  const apiPath = demo ? `/api/demo/${room}` : '/api';
  const engine = demo ? 'local' : 'twitch';
  const calls: string[] = [];
  const staticBase = new URL(options.staticBase);
  const now = Date.now();

  const state = {
    stage: 'none' as 'none' | 'draft' | 'running' | 'ended',
    startedAt: 0,
    config: { tactics: ['linkscam', 'spam', 'botwave'], primaryTactic: 'linkscam', attackCount: 14, banterCount: 8, intervalMs: 1500, slipWindowMs: 9000, seed: 7, simMod: true, chatVote: false, announce: false },
    gradeDone: 0,
    pushes: [] as PushResult[]
  };
  let socket: WebSocketRoute | null = null;
  const send = (message: ServerMsg): void => { socket?.send(JSON.stringify(message)); };

  const gradeTotal = ATTACKS.length;
  const passedCount = ATTACKS.filter((line) => !line.blocked).length;

  const gradesView = (): GradesView => GradesViewZ.parse(state.gradeDone === 0 ? { phases: {}, lines: [] } : {
    phases: { A: { done: state.gradeDone, total: gradeTotal, passed: ATTACKS.slice(0, state.gradeDone).filter((line) => !line.blocked).length, engine } },
    lines: ATTACKS.slice(0, state.gradeDone).map((line) => ({
      lineId: line.id, phase: 'A', engine, permitted: !line.blocked, ...(line.blocked ? { blockedBy: line.blocked } : {})
    }))
  });

  const drillView = () => DrillViewZ.parse({
    drillId: DRILL_ID,
    status: state.stage === 'none' ? 'draft' : state.stage,
    config: state.config,
    joinCode: JOIN_CODE,
    participants: PARTICIPANTS.map(({ id, name, isSim }) => ({ id, name, isSim })),
    score: scoreFor(state.stage === 'ended' ? 'ended' : 'running'),
    lines: WAVE.map((line) => ({ id: line.id, text: textOf(line), ...(line.tactic ? { tactic: line.tactic } : {}), ...(line.trick ? { trick: line.trick } : {}), tags: line.tags }))
  });

  const snapshot = (): DrillSnapshot => {
    if (state.stage === 'none') return { drill: null, participants: [] };
    const base = { drillId: DRILL_ID, status: state.stage, startedAt: state.stage === 'draft' ? null : state.startedAt, total: WAVE.length };
    if (state.stage === 'draft') return { drill: { ...base, lines: [], score: { mods: [], slipped: 0, attacksShown: 0 } }, participants: PARTICIPANTS };
    const stage = state.stage;
    return { drill: { ...base, lines: snapshotLines(stage), score: scoreFor(stage), ...(stage === 'ended' ? { reveal: revealAll() } : {}) }, participants: PARTICIPANTS };
  };

  const proofBody = () => ProofResultZ.parse({
    total: gradeTotal,
    blockedBefore: gradeTotal - passedCount,
    blockedAfter: 12,
    realChat: ['follow me', 'boost', 'f0llowers', 'c.h.e.a.p'].map((term) => ({ term, count: 0, example: null })),
    pushAllowed: true,
    stillByTag: [{ tag: 'lookalike', count: 1, needsBotRule: true }, { tag: 'dm-me', count: 1, needsBotRule: false }]
  });

  const reportBody = () => ReportViewZ.parse({
    reportId: 'rep-fixture-01',
    score: scoreFor('ended'),
    grading: [{ phase: 'A', engine, passed: passedCount, total: gradeTotal }],
    rules: {
      accepted: [{ term: 'follow me', gain: 3 }, { term: 'boost', gain: 2 }, { term: 'f0llowers', gain: 2 }, { term: 'c.h.e.a.p', gain: 1 }],
      rejected: [{ term: 'free', hits: 4, fp: 3 }, { term: 'promo', hits: 3, fp: 2 }],
      needsBotRule: [{ tag: 'lookalike', count: 1, needsBotRule: true }]
    },
    proof: { total: gradeTotal, blockedBefore: gradeTotal - passedCount, blockedAfter: 12, realChatMatches: 0 },
    modHistory: [
      { name: 'Aria', drills: [{ drillId: 'd0', createdAt: now - 7 * 86_400_000, caught: 8, falseBans: 2, avgReactionMs: 2900 }, { drillId: DRILL_ID, createdAt: now, caught: 6, falseBans: 1, avgReactionMs: 2100 }] },
      { name: 'Jonah', drills: [{ drillId: 'd0', createdAt: now - 7 * 86_400_000, caught: 3, falseBans: 1, avgReactionMs: 4100 }, { drillId: DRILL_ID, createdAt: now, caught: 2, falseBans: 0, avgReactionMs: 3300 }] }
    ],
    pushes: state.pushes.map(({ term, status }) => ({ term, status }))
  });

  const terms = options.filters === 'empty' ? [] : FILTER_TERMS.map((text, index) => ({ id: `t${index + 1}`, text }));
  const filtersBody = FiltersZ.parse({
    terms,
    automod: { overall_level: 2, disability: 1, aggression: 2, sexuality_sex_or_gender: 2, misogyny: 1, bullying: 2, swearing: 1, race_ethnicity_or_religion: 3, sex_based_terms: 1 },
    fetchedAt: now - 4 * 60_000
  });
  const chatLogBody = ChatLogZ.parse(options.chatLog === 'empty'
    ? { count: 0, oldest: null, newest: null, logging: true, samples: [] }
    : {
      count: 1284, oldest: now - 3 * 86_400_000, newest: now - 40_000, logging: true,
      samples: [
        { login: 'sam_plays', text: 'that boss fight was wild' },
        { login: 'luna_arts', text: 'new emotes when?' },
        { login: 'ravenwing', text: 'second monitor is a good call' },
        { login: 'tomo_k', text: 'chat is so wholesome today' },
        { login: 'mika_cat', text: 'clip that one please' },
        { login: 'deepdish', text: 'gg everyone, see you tomorrow' }
      ]
    });
  const statusBody = StatusViewZ.parse({
    token: { status: 'ok', validatedAt: now - 2 * 60_000 },
    subscription: { status: options.status === 'degraded' ? 'webhook_callback_verification_failed' : 'enabled' },
    chatLog: { count: 1284, lastMessageAt: now - 40_000 },
    quota: { minute: { used: 2, limit: 5 }, hour: { used: 38, limit: 60 }, nextAllowedAt: now - 1000 }
  });
  const channel = { id: '1001', login: CHANNEL, displayName: 'Pixel Panda', avatarUrl: null, broadcasterType: 'affiliate' as const };
  const meBody = MeZ.parse({
    user: channel, channel, tokenStatus: 'ok', subscriptionStatus: 'enabled',
    overlayUrl: `${DEMO_HOST}/overlay/${CHANNEL}?key=ovl-pp-3f9c1a72d0`,
    modUrl: `${DEMO_HOST}/mod/${CHANNEL}`
  });

  // 1) everything not mocked goes to the static server
  await page.route(`${DEMO_HOST}/**`, async (route) => {
    const url = new URL(route.request().url());
    const target = new URL(url.pathname + url.search, staticBase);
    await route.fulfill({ response: await route.fetch({ url: target.toString() }) });
  });

  // 2) the API (registered later, so it wins over the forwarder)
  await page.route(`${DEMO_HOST}/api/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace(apiPath, '').replace(/^\//, '');
    calls.push(`${method} ${path}`);
    if (options.delayMs) await new Promise((done) => setTimeout(done, options.delayMs));
    const drill = new RegExp(`^drills/${DRILL_ID}/?`);
    const sub = path.replace(drill, '');
    try {
      if (!path.startsWith('drills') && !path.startsWith('ws-ticket')) {
        if (path === 'me') {
          if (options.me === 'unauthorized') return await json(route, { error: { code: 'unauthorized', message: 'Sign in.' } }, 401);
          if (options.me === 'error') return await json(route, { error: { code: 'server', message: 'Down.' } }, 500);
          return await json(route, meBody);
        }
        if (path === 'filters') return options.filters === 'error' ? await json(route, { error: { code: 'server', message: 'Down.' } }, 500) : await json(route, filtersBody);
        if (path === 'chatlog/stats') return options.chatLog === 'error' ? await json(route, { error: { code: 'server', message: 'Down.' } }, 500) : await json(route, chatLogBody);
        if (path === 'status') return options.status === 'error' ? await json(route, { error: { code: 'server', message: 'Down.' } }, 500) : await json(route, statusBody);
        if (path === 'subscription/repair') return await json(route, { status: 'enabled' });
        return await json(route, { error: { code: 'not_found', message: 'Not found.' } }, 404);
      }
      if (path === 'ws-ticket') return await json(route, { ticket: 'fixture-ticket', wsUrl: `${DEMO_HOST.replace('https', 'wss')}/ws/console/${room}` });
      if (path === 'drills' && method === 'POST') {
        state.stage = 'draft';
        send({ type: 'drill.state', data: snapshot() });
        return await json(route, DraftResponseZ.parse({ drillId: DRILL_ID, joinCode: JOIN_CODE, modUrl: demo ? `${DEMO_HOST}/demo/${room}/mod` : `${DEMO_HOST}/mod/${CHANNEL}` }), 201);
      }
      if (path === `drills/${DRILL_ID}`) return await json(route, drillView());
      if (sub === 'start') {
        state.stage = 'running';
        state.startedAt = Date.now() - 27_000;
        await json(route, StartResponseZ.parse({ startedAt: state.startedAt }));
        send({ type: 'drill.state', data: snapshot() });
        return;
      }
      if (sub === 'stop') {
        state.stage = 'ended';
        await json(route, StopResponseZ.parse({ endedAt: Date.now() }));
        send({ type: 'drill.ended', data: { score: scoreFor('ended'), reveal: revealAll() } });
        return;
      }
      if (sub === 'grades') return await json(route, gradesView());
      if (sub === 'grade/local') {
        state.gradeDone = gradeTotal;
        return await json(route, GradeLocalZ.parse({ passed: passedCount, total: gradeTotal, engine: 'local' }));
      }
      if (sub === 'grade') {
        state.gradeDone = 6;
        await json(route, GradeQueuedZ.parse({ queued: gradeTotal }));
        send({ type: 'grade.progress', data: { phase: 'A', done: 6, total: gradeTotal, engine: 'twitch' } });
        return;
      }
      if (sub === 'rules') {
        return await json(route, RuleResultZ.parse({
          accepted: [
            { term: 'follow me', hits: 3, gain: 3, exampleLineId: 'l06' },
            { term: 'boost', hits: 3, gain: 2, exampleLineId: 'l12' },
            { term: 'f0llowers', hits: 2, gain: 2, exampleLineId: 'l03' },
            { term: 'c.h.e.a.p', hits: 2, gain: 1, exampleLineId: 'l15' }
          ],
          rejected: [
            { term: 'free', hits: 4, fp: 3, fpExample: 'free real estate' },
            { term: 'promo', hits: 3, fp: 2, fpExample: 'the promo art is beautiful' }
          ],
          stillPassing: ['l13', 'l21'],
          stillByTag: [{ tag: 'lookalike', count: 1, needsBotRule: true }, { tag: 'dm-me', count: 1, needsBotRule: false }]
        }));
      }
      if (sub === 'prove') return await json(route, proofBody());
      if (sub === 'push') {
        const body = JSON.parse(request.postData() ?? '{}') as { terms?: string[] };
        state.pushes = PushResultsZ.parse((body.terms ?? []).map((term) => ({ term, status: 'added' })));
        return await json(route, state.pushes);
      }
      if (sub === 'undo') {
        state.pushes = PushResultsZ.parse(state.pushes.map(({ term }) => ({ term, status: 'removed' })));
        return await json(route, state.pushes);
      }
      if (sub === 'report') return state.stage === 'ended' && state.pushes.length > 0 ? await json(route, reportBody()) : await json(route, { error: { code: 'not_found', message: 'No report yet.' } }, 404);
      return await json(route, { error: { code: 'not_found', message: 'Not found.' } }, 404);
    } catch (error) {
      // a fixture that fails its own schema must be loud, not a silent 500 screenshot
      calls.push(`FIXTURE ERROR ${path}: ${error instanceof Error ? error.message : String(error)}`);
      return json(route, { error: { code: 'fixture', message: 'Fixture did not match its schema.' } }, 500);
    }
  });

  // 3) the console socket
  await page.routeWebSocket(/\/ws\//, (ws) => {
    socket = ws;
    ws.send(JSON.stringify({ type: 'hello', data: { role: 'console', serverTime: Date.now() } } satisfies ServerMsg));
    ws.send(JSON.stringify({ type: 'drill.state', data: snapshot() } satisfies ServerMsg));
  });

  return {
    path: demo ? `/demo/${room}` : '/console',
    open: async (target) => { await target.goto(`${DEMO_HOST}${demo ? `/demo/${room}` : '/console'}`); },
    finishTwitchGrading: () => {
      state.gradeDone = gradeTotal;
      send({ type: 'grade.done', data: { phase: 'A', passed: passedCount, total: gradeTotal, engine: 'twitch' } });
    },
    calls
  };
}
