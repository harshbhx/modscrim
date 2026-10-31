import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, simDecision } from '@mfd/core';
import migration from '../migrations/0001_init.sql?raw';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';

const BOOT = { mode: 'live', broadcasterId: '42', login: 'pixelpanda_tv', displayName: 'PixelPanda', broadcasterType: '' } as const;
let sequence = 0;

async function room() {
  const name = `ch:drill-${++sequence}-${crypto.randomUUID()}`;
  const stub = env.ROOM.getByName(name);
  await stub.bootstrap({ ...BOOT, roomName: name });
  return stub;
}

async function create(stub: ReturnType<typeof env.ROOM.getByName>) {
  return stub.createDrill({ ...DEFAULT_CONFIG, tactics: ['linkscam'], primaryTactic: 'linkscam', seed: 7, simMod: false });
}

async function expectFailure(promise: Promise<unknown>, message: string): Promise<void> {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toMatchObject({ message });
}

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('drill lifecycle and mod join', () => {
  it('creates one draft, keeps its join code on edit, then ends the drill', async () => {
    const stub = await room();
    const draft = await create(stub);
    expect(await create(stub)).toEqual(draft);
    const updated = await stub.updateDraft(draft.drillId, { ...DEFAULT_CONFIG, tactics: ['spam'], primaryTactic: 'spam', seed: 7, simMod: false });
    expect(updated.joinCode).toBe(draft.joinCode);
    expect(updated.config.tactics).toEqual(['spam']);
    await stub.startDrill(draft.drillId);
    expect((await stub.getDrill(draft.drillId)).status).toBe('running');
    await stub.stopDrill(draft.drillId);
    expect((await stub.getDrill(draft.drillId)).status).toBe('ended');
  });

  it('rejects a wrong code, rate limits the sixth failure, and suffixes duplicate names', async () => {
    const stub = await room();
    const draft = await create(stub);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectFailure(stub.joinAsMod({ code: '000000', displayName: 'Sam', ip: '192.0.2.1' }), 'join_forbidden');
    }
    await expectFailure(stub.joinAsMod({ code: draft.joinCode, displayName: 'Sam', ip: '192.0.2.1' }), 'join_rate_limited');
    const first = await stub.joinAsMod({ code: draft.joinCode, displayName: 'Sam', ip: '192.0.2.2' });
    const second = await stub.joinAsMod({ code: draft.joinCode, displayName: 'Sam', ip: '192.0.2.3' });
    const names = await runInDurableObject(stub, (_room: ChannelRoom, state) =>
      state.storage.sql.exec<{ display_name: string }>('SELECT display_name FROM participants ORDER BY joined_at, rowid').toArray().map((row) => row.display_name)
    );
    expect(first.participantId).not.toBe(second.participantId);
    expect(names).toEqual(['Sam', 'Sam 2']);
  });

  it('carries joined moderators into the next draft', async () => {
    const stub = await room();
    const first = await create(stub);
    const joined = await stub.joinAsMod({ code: first.joinCode, displayName: 'Returning mod', ip: '192.0.2.4' });
    const ticket = await stub.issueTicket({ role: 'mod', participantId: joined.participantId });
    const socketResponse = await stub.fetch(`https://room.test/ws/ch/x?ticket=${encodeURIComponent(ticket)}`, { headers: { Upgrade: 'websocket' } });
    expect(socketResponse.status).toBe(101);
    (socketResponse.webSocket as WebSocket).accept();
    await stub.cancelDraft(first.drillId);
    const second = await create(stub);
    const view = await stub.getDrill(second.drillId);
    expect(view.participants.map((participant) => participant.name)).toContain('Returning mod');
  });
});

describe('Kai deterministic decisions', () => {
  it('returns the same choice for the same seed and line, with bounded timing and actions', () => {
    const attack = { id: 'line-1', kind: 'attack' as const, text: 'claim your free link' };
    expect(simDecision(123, attack)).toEqual(simDecision(123, attack));
    const decision = simDecision(123, attack);
    if (decision) {
      expect(decision.delayMs).toBeGreaterThanOrEqual(2600);
      expect(decision.delayMs).toBeLessThanOrEqual(6800);
      expect(['delete', 'timeout', 'ban']).toContain(decision.action);
    }
  });

  it('only times out tempting banter', () => {
    const tempting = { id: 'banter-1', kind: 'banter' as const, text: 'free links are fun' };
    const ordinary = { id: 'banter-2', kind: 'banter' as const, text: 'good morning everyone' };
    for (let seed = 0; seed < 100; seed += 1) {
      const choice = simDecision(seed, tempting);
      if (choice) {
        expect(choice.action).toBe('timeout');
        expect(choice.delayMs).toBeGreaterThanOrEqual(2800);
        expect(choice.delayMs).toBeLessThanOrEqual(5400);
      }
      expect(simDecision(seed, ordinary)).toBeNull();
    }
  });
});
