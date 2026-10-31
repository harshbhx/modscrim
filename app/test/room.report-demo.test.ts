import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_TERMS, demoBootstrap } from '@mfd/core';
import migration from '../migrations/0001_init.sql?raw';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';
import { reportCard } from '../worker/room/report.js';
import { DEMO_IDLE_MS, demoGcDueAt, demoRoomName } from '../worker/room/demo.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('demo room fixtures and expiry', () => {
  it('creates an isolated room with fixture filters and a two-hour cleanup job', async () => {
    const name = demoRoomName(crypto.randomUUID());
    const stub = env.ROOM.getByName(name);
    const created = await stub.bootstrapDemo(name);
    const filters = await stub.getFilters();
    expect(filters.terms.map((term) => term.text)).toEqual(DEMO_TERMS);
    const due = await runInDurableObject(stub, (_room: ChannelRoom, state) =>
      state.storage.sql.exec<{ due_at: number }>("SELECT due_at FROM schedule WHERE kind = 'room.gc' AND key = 'demo'").one().due_at
    );
    expect(due).toBeGreaterThanOrEqual(demoGcDueAt(Date.now() - 1000));
    expect(due).toBeLessThanOrEqual(Date.now() + DEMO_IDLE_MS + 1000);
    expect(created.joinCode).toMatch(/^\d{6}$/);
  });

  it('returns separate fixtures for separate visitor rooms', async () => {
    const firstName = demoRoomName(crypto.randomUUID());
    const secondName = demoRoomName(crypto.randomUUID());
    const first = env.ROOM.getByName(firstName);
    const second = env.ROOM.getByName(secondName);
    const firstRoom = await first.bootstrapDemo(firstName);
    const secondRoom = await second.bootstrapDemo(secondName);
    expect(firstRoom.drillId).not.toBe(secondRoom.drillId);
    expect(firstName).not.toBe(secondName);
    expect((await first.getOverlayKey())).not.toBe(await second.getOverlayKey());
  });
});

describe('demo full loop and report redaction', () => {
  it('grades, finds and proves rules, simulates push/undo, and saves a report without outbound fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const name = demoRoomName(crypto.randomUUID());
    const stub = env.ROOM.getByName(name);
    try {
      const { drillId } = await stub.bootstrapDemo(name);
      const drill = await stub.getDrill(drillId);
      await stub.startDrill(drillId);
      await stub.stopDrill(drillId);
      const grade = await stub.gradeLocally(drillId, 'A');
      expect(grade.total).toBeGreaterThan(0);
      const rules = await stub.findRules(drillId);
      const terms = rules.accepted.slice(0, 1).map((rule) => rule.term);
      expect(terms).toHaveLength(1);
      const proof = await stub.proveFreshWave(drillId, terms);
      expect(proof.pushAllowed).toBe(true);
      expect(proof.realChat.every((match) => match.count === 0)).toBe(true);
      expect((await stub.push(drillId, terms, 'demo')).some((result) => result.status === 'added')).toBe(true);
      expect((await stub.undo(drillId, 'demo')).some((result) => result.status === 'removed')).toBe(true);

      const report = await stub.getReport(drillId);
      expect(report).toMatchObject({ drillId, grading: [{ phase: 'A', engine: 'local' }] });
      expect(report?.rules).toBeDefined();
      expect(report?.proof).toBeDefined();
      expect(report?.pushes[0]?.status).toBe('removed');
      const card = reportCard(report!);
      expect(JSON.stringify(card)).not.toMatch(/"(?:term|lineText|chatLine)"/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
