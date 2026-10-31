import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '@mfd/core';
import migration from '../migrations/0001_init.sql?raw';
import { ANNOUNCEMENT_TEXT } from '../worker/room/chatlog.js';
import { claimDrillAnnouncement } from '../worker/room/announce.js';
import { sendDrillAnnouncement } from '../worker/twitch/helix.js';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('fixed drill announcement', () => {
  it('sends only the approved fixed message through Helix', async () => {
    const broadcasterId = `announcement-${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, ?)')
      .bind(broadcasterId, `ch:${broadcasterId}`, 0)
      .run();
    const testEnv = {
      ...env,
      ROOM: { getByName: () => ({ getAccessToken: async () => 'test-access-token' }) }
    } as unknown as Parameters<typeof sendDrillAnnouncement>[0];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [{ is_sent: true }] }));
    try {
      await sendDrillAnnouncement(testEnv, broadcasterId);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe('https://api.twitch.tv/helix/chat/messages');
      expect(JSON.parse(String(init?.body)) as unknown).toEqual({
        broadcaster_id: broadcasterId,
        sender_id: broadcasterId,
        message: ANNOUNCEMENT_TEXT
      });
      expect(ANNOUNCEMENT_TEXT).toBe('Mod fire drill starting. Practice chat only, nothing here is real.');
    } finally {
      fetchMock.mockRestore();
      await env.DB.prepare('DELETE FROM channels WHERE broadcaster_id = ?').bind(broadcasterId).run();
    }
  });

  it('claims an announcement at most once for a drill', async () => {
    const roomName = `ch:announcement-${crypto.randomUUID()}`;
    const room = env.ROOM.getByName(roomName);
    await room.bootstrap({ mode: 'live', roomName, broadcasterId: 'announcement-room', login: 'announcement_room', displayName: 'Announcement Room', broadcasterType: '' });
    const drill = await room.createDrill({ ...DEFAULT_CONFIG, seed: 712, announce: true, simMod: false });
    const claims = await runInDurableObject(room, (_instance: ChannelRoom, state) => state.storage.transactionSync(() => [
      claimDrillAnnouncement(state.storage.sql, drill.drillId, 1_000),
      claimDrillAnnouncement(state.storage.sql, drill.drillId, 2_000)
    ]));
    expect(claims).toEqual([true, false]);
  });
});
