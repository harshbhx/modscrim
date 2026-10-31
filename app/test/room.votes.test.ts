import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@mfd/core';
import migration from '../migrations/0001_init.sql?raw';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('chat tactic votes', () => {
  it('keeps one last vote per chatter and starts with the configured tactic on a tie', async () => {
    const roomName = `ch:votes-${crypto.randomUUID()}`;
    const room = env.ROOM.getByName(roomName);
    await room.bootstrap({ mode: 'live', roomName, broadcasterId: '42', login: 'pixelpanda_tv', displayName: 'PixelPanda', broadcasterType: '' });
    const drill = await room.createDrill({
      ...DEFAULT_CONFIG,
      tactics: ['linkscam', 'spam'],
      primaryTactic: 'linkscam',
      chatVote: true,
      simMod: false,
      seed: 123
    });

    await room.startDrill(drill.drillId);
    expect((await room.getDrill(drill.drillId)).status).toBe('voting');

    const event = (chatter: string, messageId: string, text: string) => ({
      broadcaster_user_id: '42',
      chatter_user_id: chatter,
      chatter_user_login: chatter,
      message_id: messageId,
      message: { text },
      message_type: 'text',
      source_broadcaster_user_id: null
    });
    await room.ingestChat(event('chatter-1', 'vote-1', '!attack spam'));
    await room.ingestChat(event('chatter-1', 'vote-2', '!attack linkscam'));
    await room.ingestChat(event('chatter-2', 'vote-3', '!attack spam'));

    const voteCounts = await runInDurableObject(room, (_instance: ChannelRoom, state) =>
      state.storage.sql.exec<{ tactic: string; count: number }>(
        'SELECT tactic, COUNT(*) AS count FROM votes WHERE drill_id = ? GROUP BY tactic ORDER BY tactic',
        drill.drillId
      ).toArray()
    );
    expect(voteCounts).toEqual([{ tactic: 'linkscam', count: 1 }, { tactic: 'spam', count: 1 }]);

    await runInDurableObject(room, async (instance: ChannelRoom, state) => {
      state.storage.sql.exec("UPDATE schedule SET due_at = 0 WHERE kind = 'vote.close' AND key = ?", drill.drillId);
      await instance.alarm();
    });

    const result = await room.getDrill(drill.drillId);
    expect(result.status).toBe('running');
    expect(result.config.primaryTactic).toBe('linkscam');
  });
});
