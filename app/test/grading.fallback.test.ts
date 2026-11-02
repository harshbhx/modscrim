import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, type GradePhase } from '@mfd/core';
import migration from '../migrations/0001_init.sql?raw';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';
import { GradingEngine } from '../worker/room/grading.js';
import { MAX_ATTEMPTS, Scheduler } from '../worker/room/scheduler.js';

const BOOT = { mode: 'live', broadcasterId: '42', login: 'pixelpanda_tv', displayName: 'PixelPanda', broadcasterType: '' } as const;
const PHASE: GradePhase = 'A';
let sequence = 0;

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Harness = {
  engine: GradingEngine;
  scheduler: Scheduler;
  drillId: string;
  state: DurableObjectState;
  scheduled: Array<{ due: number; payload: unknown }>;
  total: () => number;
};

/**
 * A real room (so the real tables exist) with a grading engine whose Twitch token is fake and whose
 * scheduler writes the real `schedule` table. Twitch itself is the mocked global `fetch`.
 */
async function withEngine(run: (h: Harness) => Promise<void>): Promise<void> {
  const name = `ch:grade-${++sequence}-${crypto.randomUUID()}`;
  const stub = env.ROOM.getByName(name);
  await stub.bootstrap({ ...BOOT, roomName: name });
  const draft = await stub.createDrill({ ...DEFAULT_CONFIG, tactics: ['linkscam'], primaryTactic: 'linkscam', seed: 7, simMod: false });
  await runInDurableObject(stub, async (_room: ChannelRoom, state) => {
    const scheduler = new Scheduler(state, () => name);
    const scheduled: Harness['scheduled'] = [];
    const engine = new GradingEngine({
      ctx: state,
      env: env as Env,
      scheduler,
      roomName: () => name,
      mode: () => 'live',
      broadcasterId: () => '42',
      broadcasterType: () => '',
      getAccessToken: async () => 'fake-token',
      blockedTerms: () => ['free followers'],
      refreshReport: () => undefined
    });
    engine.register((kind, handler) => scheduler.register(kind, handler), (kind, handler) => scheduler.registerDropped(kind, handler));
    // Same table as the real scheduler, but without arming the room's alarm behind the test's back.
    scheduler.schedule = async (kind, key, dueAt, payload = {}) => {
      if (kind === 'grade.tick') scheduled.push({ due: dueAt, payload });
      scheduler.enqueue(kind, key, dueAt, payload);
    };
    const total = (): number => state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM wave_lines WHERE drill_id = ? AND wave = 'A' AND kind = 'attack'", draft.drillId).one().n;
    try {
      await run({ engine, scheduler, drillId: draft.drillId, state, scheduled, total });
    } finally {
      // The room's own alarm must not run these jobs behind the test's back.
      await state.storage.deleteAlarm();
    }
  });
}

function tick(h: Harness, payload: Record<string, unknown> = {}): Promise<void> {
  // A fresh pacing window every time: these tests are about Twitch's answer, not our own quota.
  h.state.storage.sql.exec('DELETE FROM grade_sends');
  return (h.engine as unknown as { tick: (job: unknown) => Promise<void> }).tick({
    kind: 'grade.tick', key: `${h.drillId}:${PHASE}`, payload: { drillId: h.drillId, phase: PHASE, ...payload }, now: Date.now()
  });
}

function gradeEngines(h: Harness): string[] {
  return h.state.storage.sql.exec<{ engine: string }>('SELECT engine FROM grades').toArray().map((row) => row.engine);
}

describe('Twitch grading when Twitch limits or fails', () => {
  it('waits and flags the phase on the first 429, without grading anything', async () => {
    await withEngine(async (h) => {
      expect(h.total()).toBeGreaterThan(0);
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
      await h.engine.requestGrading(h.drillId, PHASE);
      h.scheduled.length = 0;
      await tick(h);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(h.scheduled).toHaveLength(1);
      expect(h.scheduled[0]?.payload).toEqual({ drillId: h.drillId, phase: PHASE, limited: 1 });
      expect(gradeEngines(h)).toEqual([]);
      const phase = h.engine.getGrades(h.drillId).phases.A;
      expect(phase).toMatchObject({ done: 0, total: h.total(), limited: true });
      expect(phase?.nextAt).toBeGreaterThan(Date.now());
    });
  });

  it('falls back to a labelled local estimate after repeated 429s and stops calling Twitch', async () => {
    await withEngine(async (h) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
      await h.engine.requestGrading(h.drillId, PHASE);
      await tick(h);
      await tick(h, { limited: 1 });
      await tick(h, { limited: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const view = h.engine.getGrades(h.drillId);
      const phase = view.phases.A;
      expect(phase).toMatchObject({ done: h.total(), total: h.total(), engine: 'local', limited: true });
      expect(phase?.nextAt).toBeUndefined();
      expect(view.lines.length).toBe(h.total());
      expect(new Set(view.lines.map((line) => line.engine))).toEqual(new Set(['local']));
      const leftover = h.state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM schedule WHERE kind = 'grade.tick'").one().n;
      expect(leftover).toBe(0);
    });
  });

  it('clears the limited flag when Twitch grades successfully after a 429', async () => {
    await withEngine(async (h) => {
      await h.engine.requestGrading(h.drillId, PHASE);
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 429 }));
      await tick(h);
      expect(h.engine.getGrades(h.drillId).phases.A?.limited).toBe(true);
      // Twitch answers exactly the lines it was sent; with GRADING_QUOTA_UNIT "line" a batch is a few lines.
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        const sent = JSON.parse(String(init?.body)) as { data: Array<{ msg_id: string }> };
        return Response.json({ data: sent.data.map((row) => ({ msg_id: row.msg_id, is_permitted: true })) });
      });
      await tick(h, { limited: 1 });
      expect(h.engine.getGrades(h.drillId).phases.A?.limited).toBeUndefined();
      for (let round = 0; round < h.total() && (h.engine.getGrades(h.drillId).phases.A?.done ?? 0) < h.total(); round += 1) await tick(h);
      const phase = h.engine.getGrades(h.drillId).phases.A;
      expect(phase).toMatchObject({ done: h.total(), engine: 'twitch' });
      expect(phase?.limited).toBeUndefined();
    });
  });

  it('falls back to a local estimate when the scheduler drops the job after its last attempt', async () => {
    await withEngine(async (h) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
      await h.engine.requestGrading(h.drillId, PHASE);
      let now = Date.now();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        h.state.storage.sql.exec('DELETE FROM grade_sends');
        expect(h.state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM schedule WHERE kind = 'grade.tick'").one().n).toBe(1);
        now += 60_000;
        await h.scheduler.runDueJobs(now);
        await h.state.storage.deleteAlarm();
      }
      expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
      const phase = h.engine.getGrades(h.drillId).phases.A;
      expect(phase).toMatchObject({ done: h.total(), total: h.total(), engine: 'local', limited: true });
      expect(h.state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM schedule WHERE kind = 'grade.tick'").one().n).toBe(0);
    });
  });

  it('falls back to a local estimate for an invalid Helix answer once the job is dropped', async () => {
    await withEngine(async (h) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ nope: true }));
      await h.engine.requestGrading(h.drillId, PHASE);
      let now = Date.now();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        h.state.storage.sql.exec('DELETE FROM grade_sends');
        now += 60_000;
        await h.scheduler.runDueJobs(now);
        await h.state.storage.deleteAlarm();
      }
      expect(h.engine.getGrades(h.drillId).phases.A).toMatchObject({ done: h.total(), engine: 'local', limited: true });
    });
  });

  it('does not call a user-chosen local estimate "limited"', async () => {
    await withEngine(async (h) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }));
      await h.engine.requestGrading(h.drillId, PHASE);
      await tick(h);
      expect(h.engine.getGrades(h.drillId).phases.A?.limited).toBe(true);
      await h.engine.gradeLocally(h.drillId, PHASE);
      const phase = h.engine.getGrades(h.drillId).phases.A;
      expect(phase).toMatchObject({ done: h.total(), engine: 'local' });
      expect(phase?.limited).toBeUndefined();
    });
  });
});
