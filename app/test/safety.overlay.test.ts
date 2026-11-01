import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@mfd/core';
import worker from '../worker/index.js';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';
import { demoRoomName } from '../worker/room/demo.js';

/**
 * T-124 safety net at the Worker edge (S-02, S-05, S-06, NFR-12; AGENTS.md rule 2).
 *
 * One full demo loop is driven through the real routes (`/api/demo...`, `/ws/demo/:room`) with a console, a
 * mod and three overlay sockets (before, during and after the drill). The console socket supplies the ground
 * truth (the readable attack lines); every overlay frame is then checked against it. Every HTTP response and
 * every socket frame of every role is also scanned for token shapes and for the Worker's own secret values.
 *
 * Demo rooms never touch Twitch, D1, R2 or the Queue (rule 8), so this needs no D1 migration and no channel
 * lookup: the overlay socket is opened with the overlay key `POST /api/demo` returns.
 */
const BASE_URL = 'https://mfd.test';
const WS_PATH = (room: string) => `/ws/demo/${room}`;

/** Token shapes of the CI secret scan (`.github/workflows/ci.yml`), anchored to the start of a token. */
const TOKEN_SHAPES = new RegExp(
  '(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|oauth:[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|' +
    'xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|Bearer\\s+[A-Za-z0-9._~-]{30,})'
);

/** Keys that must never appear anywhere in a frame an overlay socket receives (SRS §8.3). */
const FORBIDDEN_OVERLAY_KEYS = [
  'segments', 'text', 'reveal', 'attack', 'terms', 'term', 'tags', 'tactic', 'trick', 'linkTrick', 'joinCode', 'overlayKey', 'ticket'
];

/** String fields allowed to carry readable names (bot logins and mod names are readable by design). */
const NAME_KEYS = new Set(['user', 'name', 'actedByName', 'type']);

type Role = 'console' | 'mod' | 'overlay';
type Frame = { role: Role; socket: string; raw: string; msg: ServerMsg };

const frames: Frame[] = [];
const httpText: string[] = [];

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await worker.fetch(new Request(`${BASE_URL}${path}`, init), env, {} as ExecutionContext);
  if (response.status !== 101) {
    const headers = [...response.headers].map(([key, value]) => `${key}: ${value}`).join('\n');
    httpText.push(`${headers}\n${await response.clone().text()}`);
  }
  return response;
}

async function post(path: string, cookie: string | null, data: unknown = {}): Promise<Response> {
  return call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(data)
  });
}

async function json<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return (await response.json()) as T;
}

async function openSocket(room: string, query: string, role: Role, socket: string): Promise<WebSocket> {
  const response = await call(`${WS_PATH(room)}?${query}`, { headers: { Upgrade: 'websocket' } });
  expect(response.status).toBe(101);
  const ws = response.webSocket as WebSocket;
  ws.addEventListener('message', (event) => {
    const raw = String(event.data);
    frames.push({ role, socket, raw, msg: JSON.parse(raw) as ServerMsg });
  });
  ws.accept();
  return ws;
}

async function until(check: () => boolean | Promise<boolean>, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function* walk(value: unknown, key = ''): Generator<{ key: string; value: unknown }> {
  yield { key, value };
  if (Array.isArray(value)) for (const item of value) yield* walk(item, key);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* walk(v, k);
}

type Truth = { lineId: string; kind: 'attack' | 'banter'; text: string; segments: Array<{ kind: string; text: string }> };

/** The readable lines, as the console received them, with attack or banter from the console's reveal. */
function groundTruth(): Map<string, Truth> {
  const lines = new Map<string, Truth>();
  const remember = (line: unknown) => {
    const candidate = line as { lineId?: string; segments?: Array<{ kind: string; text: string }> };
    if (!candidate.lineId || !candidate.segments) return;
    lines.set(candidate.lineId, {
      lineId: candidate.lineId,
      kind: 'banter',
      text: candidate.segments.map((segment) => segment.text).join(''),
      segments: candidate.segments
    });
  };
  for (const { msg } of frames.filter((frame) => frame.role === 'console')) {
    if (msg.type === 'drill.line') remember(msg.data.line);
    if (msg.type === 'drill.state') for (const row of msg.data.drill?.lines ?? []) remember(row.line);
  }
  for (const { msg } of frames.filter((frame) => frame.role === 'console')) {
    const reveal = msg.type === 'drill.ended' ? msg.data.reveal : msg.type === 'drill.state' ? msg.data.drill?.reveal : undefined;
    for (const item of reveal ?? []) {
      const line = lines.get(item.lineId);
      if (line) line.kind = item.kind;
    }
  }
  return lines;
}

/** Everything an overlay must never show: each attack's full text, link and slur segments, and its keywords. */
function needlesFor(attacks: Truth[]): { whole: string[]; words: string[] } {
  const whole = new Set<string>();
  const words = new Set<string>();
  for (const line of attacks) {
    whole.add(line.text.toLowerCase());
    for (const segment of line.segments) {
      if (segment.kind === 'link' || segment.kind === 'slur') whole.add(segment.text.toLowerCase());
      if (segment.kind === 'text') for (const word of segment.text.split(/[^A-Za-z]+/)) if (word.length >= 4) words.add(word.toLowerCase());
    }
  }
  return { whole: [...whole].filter((needle) => needle.trim().length >= 4), words: [...words] };
}

describe('T-124 safety at the Worker edge: overlay redaction and token leaks', () => {
  it('sends overlays only redacted frames across a full demo loop and leaks no token anywhere', async () => {
    // ---- a demo room, its cookie, and a drill of every tactic (links, spam, bots, placeholder slurs) --------
    const created = await post('/api/demo', null);
    const cookie = (created.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    expect(cookie).toContain('=');
    const demo = await json<{ room: string; joinCode: string; overlayKey: string }>(created);
    const api = (path: string) => `/api/demo/${demo.room}${path}`;
    const stub = env.ROOM.getByName(demoRoomName(demo.room));

    const config = {
      tactics: ['linkscam', 'spam', 'botwave', 'hateraid'], primaryTactic: 'linkscam', attackCount: 8, banterCount: 4,
      intervalMs: 800, slipWindowMs: 5000, seed: 7, simMod: true, chatVote: false, announce: false
    };
    const draft = await json<{ drillId: string; joinCode: string }>(await post(api('/drills'), cookie, config));
    await json(await call(api(`/drills/${draft.drillId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: BASE_URL, Cookie: cookie }, body: JSON.stringify(config)
    }));

    // ---- sockets: console (ground truth), one mod, an overlay before the drill -----------------------------
    const consoleTicket = await json<{ ticket: string }>(await post(api('/ws-ticket'), cookie));
    await openSocket(demo.room, `ticket=${encodeURIComponent(consoleTicket.ticket)}`, 'console', 'console');
    const joined = await json<{ ticket: string }>(await post(api('/mod/join'), null, { code: draft.joinCode, displayName: 'Safety mod' }));
    await openSocket(demo.room, `ticket=${encodeURIComponent(joined.ticket)}`, 'mod', 'mod');
    const overlayQuery = `overlayKey=${encodeURIComponent(demo.overlayKey)}`;
    await openSocket(demo.room, overlayQuery, 'overlay', 'overlay-before');

    // ---- run the drill to its end, one scheduler pass per line --------------------------------------------
    await json(await post(api(`/drills/${draft.drillId}/start`), cookie));
    let lateSocket: WebSocket | null = null;
    for (let pass = 0; pass < 200; pass += 1) {
      if ((await stub.getDrill(draft.drillId)).status === 'ended') break;
      await runInDurableObject(stub, async (room: ChannelRoom, state) => {
        state.storage.sql.exec("UPDATE schedule SET due_at = 0 WHERE kind IN ('line.emit', 'line.slip', 'sim.act', 'drill.end')");
        await room.alarm();
      });
      if (pass === 4 && !lateSocket) lateSocket = await openSocket(demo.room, overlayQuery, 'overlay', 'overlay-during');
    }
    expect((await stub.getDrill(draft.drillId)).status).toBe('ended');

    // ---- the rest of the loop: grade, rules, proof, simulated push and undo, report -----------------------
    await json(await post(api(`/drills/${draft.drillId}/grade`), cookie, { phase: 'A' }));
    const rules = await json<{ accepted: Array<{ term: string }> }>(await post(api(`/drills/${draft.drillId}/rules`), cookie));
    const terms = rules.accepted.slice(0, 2).map((rule) => rule.term);
    expect(terms.length).toBeGreaterThan(0);
    await json(await post(api(`/drills/${draft.drillId}/prove`), cookie, { terms }));
    await json(await post(api(`/drills/${draft.drillId}/push`), cookie, { terms }));
    await json(await post(api(`/drills/${draft.drillId}/undo`), cookie));
    await json(await call(api(`/drills/${draft.drillId}/report`), { headers: { Cookie: cookie } }));

    // An overlay that connects after the end, and a sync request from the early one.
    const after = await openSocket(demo.room, overlayQuery, 'overlay', 'overlay-after');
    after.send(JSON.stringify({ type: 'sync' }));
    await until(
      () => frames.filter((frame) => frame.socket === 'overlay-after' && frame.msg.type === 'drill.state').length >= 2,
      'the late overlay snapshot and its sync reply'
    );
    await until(() => frames.some((frame) => frame.role === 'overlay' && frame.msg.type === 'report.ready'), 'the overlay report card');
    await until(() => frames.some((frame) => frame.role === 'overlay' && frame.msg.type === 'drill.ended'), 'the overlay drill.ended');
    await until(() => frames.some((frame) => frame.role === 'console' && frame.msg.type === 'drill.ended'), 'the console drill.ended');

    // ---- ground truth must be real, or every check below would pass vacuously -----------------------------
    const truth = groundTruth();
    const attacks = [...truth.values()].filter((line) => line.kind === 'attack');
    expect(attacks.length).toBe(8);
    expect(attacks.some((line) => line.segments.some((segment) => segment.kind === 'link'))).toBe(true);
    expect(attacks.some((line) => line.segments.some((segment) => segment.kind === 'slur'))).toBe(true);
    const needles = needlesFor(attacks);
    expect(needles.whole.length).toBeGreaterThan(8);
    expect(needles.words.length).toBeGreaterThan(8);

    // ---- S-02: every link on the wire ends .invalid (any trick: ".invalid", "[.]invalid", " dot invalid") ----
    for (const line of truth.values()) {
      for (const segment of line.segments.filter((item) => item.kind === 'link')) {
        expect(segment.text, `link in ${line.lineId}`).toMatch(/(\.| \.|\[\.\]| dot )invalid$/);
      }
    }

    // ---- S-05, S-06: overlay frames are redacted --------------------------------------------------------
    const overlayFrames = frames.filter((frame) => frame.role === 'overlay');
    for (const socket of ['overlay-before', 'overlay-during', 'overlay-after']) {
      expect(overlayFrames.some((frame) => frame.socket === socket), `${socket} received frames`).toBe(true);
    }
    expect(overlayFrames.filter((frame) => frame.msg.type === 'drill.line').length).toBeGreaterThanOrEqual(8);
    const overlayLines = new Set<string>();

    for (const frame of overlayFrames) {
      const where = `${frame.socket} ${frame.msg.type}`;
      for (const { key, value } of walk(frame.msg)) {
        expect(FORBIDDEN_OVERLAY_KEYS, `${where} carries a "${key}" field`).not.toContain(key);
        if (typeof value !== 'string' || NAME_KEYS.has(key)) continue;
        const lower = value.toLowerCase();
        for (const needle of needles.whole) expect(lower.includes(needle), `${where}.${key} contains attack text`).toBe(false);
        if (key.endsWith('Id')) continue; // random identifiers: skip the short keyword needles only
        for (const word of needles.words) expect(lower.includes(word), `${where}.${key} contains an attack keyword`).toBe(false);
      }

      const redactedLine = (line: unknown, label: string) => {
        const shape = line as { lineId: string; len: number };
        expect(Object.keys(line as object).sort(), label).toEqual(['len', 'lineId', 'user']);
        const readable = truth.get(shape.lineId);
        expect(readable, `${label} refers to a known line`).toBeDefined();
        expect(shape.len, label).toBe(Math.max(4, Math.round((readable as Truth).text.length / 4) * 4));
        overlayLines.add(shape.lineId);
      };
      if (frame.msg.type === 'drill.line') redactedLine(frame.msg.data.line, `${where} line`);
      if (frame.msg.type === 'drill.state') for (const row of frame.msg.data.drill?.lines ?? []) redactedLine(row.line, `${where} snapshot line`);
      if (frame.msg.type === 'drill.ended') expect(Object.keys(frame.msg.data), where).toEqual(['score']);
      if (frame.msg.type === 'drill.state') expect(frame.msg.data.drill?.reveal, where).toBeUndefined();
      if (frame.msg.type === 'report.ready') {
        expect(Object.keys(frame.msg.data.card).sort(), where).toEqual(
          ['attacksShown', 'drillId', 'fresh', 'grade', 'mods', 'slipped', 'termsPushed']
        );
      }
    }
    // The overlay saw redacted placeholders for every attack, not only for banter.
    for (const attack of attacks) expect(overlayLines.has(attack.lineId), `overlay saw ${attack.lineId}`).toBe(true);

    // Control: the console really did receive the readable text the overlay was denied.
    const consoleText = frames.filter((frame) => frame.role === 'console').map((frame) => frame.raw.toLowerCase()).join('\n');
    for (const attack of attacks) expect(consoleText.includes(JSON.stringify(attack.segments).toLowerCase())).toBe(true);
    expect(frames.some((frame) => frame.role === 'console' && frame.msg.type === 'drill.ended' && (frame.msg.data.reveal?.length ?? 0) > 0)).toBe(true);

    // ---- NFR-12: no token shape and no Worker secret value in any response body, header or frame ---------
    const secretValues = Object.entries(env as unknown as Record<string, unknown>)
      .filter(([name, value]) => typeof value === 'string' && value.length >= 8 && /SECRET|KEY|TOKEN/i.test(name))
      .map(([, value]) => value as string);
    expect(secretValues.length).toBeGreaterThanOrEqual(3);
    const seen = [...httpText, ...frames.map((frame) => frame.raw)];
    expect(seen.length).toBeGreaterThan(20);
    for (const text of seen) {
      expect(TOKEN_SHAPES.test(text), 'a response or frame matches a token shape').toBe(false);
      for (const secret of secretValues) expect(text.includes(secret), 'a response or frame contains a Worker secret value').toBe(false);
    }
    lateSocket?.close();
  }, 60_000);
});
