import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import { signToken } from '../worker/auth/session.js';
import worker from '../worker/index.js';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';

// T-09 acceptance checks. The fuller suite is owned by T-51 (#57).
const BOOT = {
  mode: 'live',
  roomName: 'ch:42',
  broadcasterId: '42',
  login: 'pixelpanda_tv',
  displayName: 'PixelPanda',
  broadcasterType: ''
} as const;

let n = 0;
async function bootstrapped(name = `ch:${++n}-${crypto.randomUUID()}`) {
  const stub = env.ROOM.getByName(name);
  await stub.bootstrap({ ...BOOT, roomName: name });
  return { stub, name };
}

async function tableNames(stub: ReturnType<typeof env.ROOM.getByName>): Promise<string[]> {
  return runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'")
      .toArray()
      .map((r) => r.name)
  );
}

function upgrade(stub: ReturnType<typeof env.ROOM.getByName>, query: string): Promise<Response> {
  return stub.fetch(`https://room.test/ws/ch/x?${query}`, { headers: { Upgrade: 'websocket' } });
}

function collect(ws: WebSocket) {
  const messages: Array<{ type: string; data: unknown }> = [];
  ws.addEventListener('message', (e) => messages.push(JSON.parse(e.data as string)));
  ws.accept();
  return messages;
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeAll(async () => {
  for (const statement of migration.split(';').map((q) => q.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('never-bootstrapped room', () => {
  it('404s a request and a schedule call and stores nothing', async () => {
    const stub = env.ROOM.getByName(`ch:ghost-${crypto.randomUUID()}`);
    const res = await upgrade(stub, 'ticket=abc');
    expect(res.status).toBe(404);
    await stub.schedule('chatlog.purge', 'daily', Date.now() + 3_600_000);
    expect(await tableNames(stub)).toEqual([]);
  });

  it('is not woken by the Worker for an unknown channel', async () => {
    const res = await worker.fetch(
      new Request('https://mfd.test/ws/ch/unknown', { headers: { Upgrade: 'websocket' } }),
      env,
      {} as ExecutionContext
    );
    expect(res.status).toBe(404);
  });
});

describe('bootstrap', () => {
  it('creates the schema, a 32-character overlay key, and keeps the key on a second call', async () => {
    const { stub, name } = await bootstrapped();
    expect(await tableNames(stub)).toEqual(expect.arrayContaining(['meta', 'schedule', 'ws_nonces', 'chat_log', 'drills']));
    const key = await stub.getOverlayKey();
    expect(key).toHaveLength(32);
    await stub.bootstrap({ ...BOOT, roomName: name, displayName: 'Renamed' });
    expect(await stub.getOverlayKey()).toBe(key);
  });
});

describe('tickets and sockets', () => {
  it('works once, then fails; every socket gets hello and drill.state; sync re-sends the state', async () => {
    const { stub } = await bootstrapped();
    const ticket = await stub.issueTicket({ role: 'console' });
    const first = await upgrade(stub, `ticket=${encodeURIComponent(ticket)}`);
    expect(first.status).toBe(101);
    const messages = collect(first.webSocket as WebSocket);
    await until(() => messages.length >= 2);
    expect(messages.map((m) => m.type)).toEqual(['hello', 'drill.state']);
    (first.webSocket as WebSocket).send(JSON.stringify({ type: 'sync' }));
    await until(() => messages.length >= 3);
    expect(messages[2]?.type).toBe('drill.state');

    const second = await upgrade(stub, `ticket=${encodeURIComponent(ticket)}`);
    expect(second.status).toBe(403);
  });

  it('rejects an expired ticket and a ticket for another room', async () => {
    const { stub, name } = await bootstrapped();
    const key = env.SESSION_HMAC_KEY;
    const expired = await signToken({ room: name, role: 'console', n: 'a', exp: Date.now() - 1 }, key);
    const other = await signToken({ room: 'ch:other', role: 'console', n: 'b', exp: Date.now() + 60_000 }, key);
    expect((await upgrade(stub, `ticket=${encodeURIComponent(expired)}`)).status).toBe(403);
    expect((await upgrade(stub, `ticket=${encodeURIComponent(other)}`)).status).toBe(403);
  });

  it('refuses a mod ticket for an unknown participant', async () => {
    const { stub } = await bootstrapped();
    await runInDurableObject(stub, async (room: ChannelRoom) => {
      await expect(room.issueTicket({ role: 'mod', participantId: 'nobody' })).rejects.toThrow('unknown_participant');
    });
  });
});

describe('overlay key', () => {
  it('gives 403 for a wrong key, accepts the right one, and closes overlay sockets on rotate', async () => {
    const { stub } = await bootstrapped();
    const key = (await stub.getOverlayKey()) as string;
    expect((await upgrade(stub, 'overlayKey=wrong')).status).toBe(403);
    expect((await upgrade(stub, '')).status).toBe(403);

    const res = await upgrade(stub, `overlayKey=${key}`);
    expect(res.status).toBe(101);
    const ws = res.webSocket as WebSocket;
    let closed = false;
    ws.addEventListener('close', () => (closed = true));
    ws.accept();

    const next = await stub.rotateOverlayKey();
    expect(next).toHaveLength(32);
    expect(next).not.toBe(key);
    await until(() => closed);
    expect((await upgrade(stub, `overlayKey=${key}`)).status).toBe(403);
    expect((await upgrade(stub, `overlayKey=${next}`)).status).toBe(101);
  });
});

describe('scheduler', () => {
  const HOUR = 3_600_000;

  it('runs drill jobs first, then others, by due time', async () => {
    const { stub } = await bootstrapped();
    const order: string[] = [];
    await runInDurableObject(stub, async (room: ChannelRoom, state) => {
      for (const kind of ['chatlog.purge', 'line.emit', 'grade.tick'] as const) {
        room.registerJob(kind, ({ kind: k }) => void order.push(k));
      }
      await room.schedule('chatlog.purge', 'daily', Date.now() + HOUR);
      await room.schedule('grade.tick', 'A', Date.now() + HOUR);
      await room.schedule('line.emit', 'd:0', Date.now() + HOUR);
      state.storage.sql.exec('UPDATE schedule SET due_at = id');
      await room.alarm();
    });
    expect(order).toEqual(['line.emit', 'chatlog.purge', 'grade.tick']);
  });

  it('keeps a job that reschedules itself, and drops a finished one', async () => {
    const { stub } = await bootstrapped();
    const rows = await runInDurableObject(stub, async (room: ChannelRoom, state) => {
      room.registerJob('chatlog.purge', async () => {
        await room.schedule('chatlog.purge', 'daily', Date.now() + HOUR);
      });
      room.registerJob('room.gc', () => undefined);
      await room.schedule('chatlog.purge', 'daily', Date.now() + HOUR);
      await room.schedule('room.gc', 'demo', Date.now() + HOUR);
      state.storage.sql.exec('UPDATE schedule SET due_at = 1');
      await room.alarm();
      return state.storage.sql.exec<{ kind: string; due_at: number }>('SELECT kind, due_at FROM schedule').toArray();
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('chatlog.purge');
    expect(rows[0]?.due_at).toBeGreaterThan(Date.now());
  });

  it('retries a failing job with backoff and stops after 5 attempts', async () => {
    const { stub } = await bootstrapped();
    const result = await runInDurableObject(stub, async (room: ChannelRoom, state) => {
      let calls = 0;
      room.registerJob('chatlog.purge', () => {
        calls += 1;
        throw new Error('boom');
      });
      await room.schedule('chatlog.purge', 'daily', Date.now() + HOUR);
      for (let i = 0; i < 7; i += 1) {
        state.storage.sql.exec('UPDATE schedule SET due_at = 1');
        await room.alarm();
      }
      return { calls, left: state.storage.sql.exec('SELECT 1 FROM schedule').toArray().length };
    });
    expect(result).toEqual({ calls: 5, left: 0 });
  });
});

describe('streamer routes', () => {
  const call = (path: string, init: RequestInit = {}) =>
    worker.fetch(
      new Request(`https://mfd.test${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://mfd.test' },
        ...init
      }),
      env,
      {} as ExecutionContext
    );

  it('401s ws-ticket and overlay rotate without a session', async () => {
    expect((await call('/api/ws-ticket')).status).toBe(401);
    expect((await call('/api/overlay/rotate')).status).toBe(401);
  });

  it('403s a cross-origin write before anything else', async () => {
    const res = await call('/api/ws-ticket', { headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' } });
    expect(res.status).toBe(403);
  });
});
