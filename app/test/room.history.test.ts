import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('moderator history', () => {
  it('aggregates a moderator across two saved drill reports', async () => {
    const roomName = `ch:history-${crypto.randomUUID()}`;
    const room = env.ROOM.getByName(roomName);
    await room.bootstrap({ mode: 'live', roomName, broadcasterId: 'history-room', login: 'history_room', displayName: 'History Room', broadcasterType: '' });
    const modIds = ['history-mod-a', 'history-mod-b'];
    const drillIds = ['history-drill-a', 'history-drill-b'];
    const fixtures = [
      { createdAt: 1_000, caught: 3, falseBans: 1, avgReactionMs: 850 },
      { createdAt: 2_000, caught: 5, falseBans: 0, avgReactionMs: 625 }
    ];
    await runInDurableObject(room, (_instance: ChannelRoom, state) => state.storage.transactionSync(() => {
      const sql = state.storage.sql;
      for (let index = 0; index < fixtures.length; index += 1) {
        const fixture = fixtures[index];
        const participantId = modIds[index];
        const drillId = drillIds[index];
        if (!fixture || !participantId || !drillId) continue;
        sql.exec('INSERT INTO participants (id, twitch_user_id, display_name, is_sim, joined_at) VALUES (?, ?, ?, 0, ?)', participantId, 'twitch-user-123', 'Mod One', fixture.createdAt);
        sql.exec('INSERT INTO drill_participants (drill_id, participant_id) VALUES (?, ?)', drillId, participantId);
        const report = {
          drillId,
          createdAt: fixture.createdAt,
          score: { mods: [{ participantId, name: 'Mod One', isSim: false, caught: fixture.caught, falseBans: fixture.falseBans, avgReactionMs: fixture.avgReactionMs }] }
        };
        sql.exec('INSERT INTO reports (drill_id, report_id, report, created_at) VALUES (?, ?, ?, ?)', drillId, drillId, JSON.stringify(report), fixture.createdAt);
      }
    }));

    await expect(room.getModHistory(modIds[0])).resolves.toEqual([{
      name: 'Mod One',
      drills: [
        { drillId: drillIds[0], createdAt: 1_000, caught: 3, falseBans: 1, avgReactionMs: 850 },
        { drillId: drillIds[1], createdAt: 2_000, caught: 5, falseBans: 0, avgReactionMs: 625 }
      ]
    }]);
  });
});
