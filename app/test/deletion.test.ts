import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import { seal } from '../worker/auth/crypto.js';
import { deleteUserData } from '../worker/auth/deletion.js';
import { hourly } from '../worker/jobs/hourly.js';
import type { ChannelRoom } from '../worker/room/ChannelRoom.js';
import { demoRoomName } from '../worker/room/demo.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

describe('room retention', () => {
  it('removes expired chat, drills, ticket nonces and join counters while keeping fresh data', async () => {
    const name = demoRoomName(crypto.randomUUID());
    const stub = env.ROOM.getByName(name);
    const { drillId } = await stub.bootstrapDemo(name);
    const now = Date.now();
    const retention = 7 * 24 * 60 * 60 * 1000;
    const old = now - retention - 1;
    const boundary = now - retention;
    const oldDrill = now - 31 * 24 * 60 * 60 * 1000;
    const fresh = now - 60_000;
    const ticket = await stub.issueTicket({ role: 'console' });
    await runInDurableObject(stub, (_room: ChannelRoom, state) => {
      const sql = state.storage.sql;
      sql.exec("INSERT INTO chat_log VALUES ('old-chat','u','old','old text','old text',?)", old);
      sql.exec("INSERT INTO chat_log VALUES ('boundary-chat','u','boundary','boundary text','boundary text',?)", boundary);
      sql.exec("INSERT INTO chat_log VALUES ('fresh-chat','u','fresh','fresh text','fresh text',?)", fresh);
      sql.exec('UPDATE drills SET created_at = ? WHERE id = ?', oldDrill, drillId);
      sql.exec('UPDATE ws_nonces SET exp = 0');
      sql.exec('INSERT INTO join_attempts VALUES (?, ?, ?)', '198.51.100.8', Math.floor((now - 3 * 60_000) / 60_000), 1);
    });
    const result = await stub.purge(now);
    expect(result?.chatDeleted).toBe(1);
    expect(result?.drillsDeleted).toBe(1);
    const remaining = await runInDurableObject(stub, (_room: ChannelRoom, state) => ({
      chat: state.storage.sql.exec<{ message_id: string }>('SELECT message_id FROM chat_log').toArray().map((row) => row.message_id),
      drills: state.storage.sql.exec('SELECT id FROM drills').toArray().length,
      nonces: state.storage.sql.exec('SELECT nonce FROM ws_nonces').toArray().length,
      joins: state.storage.sql.exec('SELECT ip FROM join_attempts').toArray().length
    }));
    expect(remaining.chat).toContain('boundary-chat');
    expect(remaining.chat).toContain('fresh-chat');
    expect(remaining.chat).not.toContain('old-chat');
    expect(remaining.chat).toHaveLength(73);
    expect(remaining).toMatchObject({ drills: 0, nonces: 0, joins: 0 });
    expect(ticket).toBeTruthy();
  });
});

describe('sign-out deletion', () => {
  it('destroys room storage and removes user, channel, tokens, audit and report rows', async () => {
    const id = `delete-${crypto.randomUUID()}`;
    const roomName = `ch:${id}`;
    const stub = env.ROOM.getByName(roomName);
    await stub.bootstrap({ mode: 'demo', roomName, broadcasterId: id, login: 'delete_test', displayName: 'Delete Test', broadcasterType: '' });
    await env.DB.prepare("INSERT INTO users (id, login, display_name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)").bind(id, `d${id.slice(-8)}`, 'Delete Test').run();
    await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, 0)').bind(id, roomName).run();
    await env.DB.prepare("INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, expires_at, scopes, status) VALUES (?, 'a', 'r', 9999999999999, '[]', 'ok')").bind(id).run();
    await env.DB.prepare("INSERT INTO audit_log (broadcaster_id, actor_id, action, at) VALUES (?, ?, 'push', 0)").bind(id, id).run();
    await env.DB.prepare("INSERT INTO report_summaries (report_id, broadcaster_id, drill_id, created_at, attacks, slipped, terms_pushed) VALUES (?, ?, ?, 0, 0, 0, 0)").bind(`report-${id}`, id, 'drill-1').run();

    const reports = (env as unknown as { REPORTS?: R2Bucket }).REPORTS;
    expect(reports).toBeDefined();
    await reports!.put(`reports/${id}/report.json`, '{"private":"test"}');
    await reports!.put(`reports/${id}/report.md`, 'private test');

    const result = await deleteUserData(env, id, { callTwitch: false });
    expect(result.twitch).toBeNull();
    expect(result.r2Deleted).toBe(2);
    expect((await reports!.list({ prefix: `reports/${id}/` })).objects).toHaveLength(0);
    for (const [table, column] of [
      ['users', 'id'], ['channels', 'broadcaster_id'], ['oauth_tokens', 'user_id'],
      ['audit_log', 'broadcaster_id'], ['report_summaries', 'broadcaster_id']
    ]) {
      const row = await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).bind(id).first();
      expect(row).toBeNull();
    }
    const tableCount = await runInDurableObject(stub, (_room: ChannelRoom, state) =>
      state.storage.sql.exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").one().n
    ).catch(() => 0);
    expect(tableCount).toBe(0);
  });
});

describe('hourly token validation', () => {
  it('marks a token invalid when Twitch validation returns 401', async () => {
    const id = `hourly-${crypto.randomUUID()}`;
    const roomName = `ch:${id}`;
    const now = Date.now();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 401 }));
    try {
      await env.DB.prepare('INSERT INTO users (id, login, display_name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
        .bind(id, `h${id.slice(-8)}`, 'Hourly Test').run();
      await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, 0)').bind(id, roomName).run();
      await env.DB.prepare("INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, scopes, expires_at, status) VALUES (?, ?, ?, '[]', ?, 'ok')")
        .bind(id, await seal('test-access', env.TOKEN_ENC_KEY, id), await seal('test-refresh', env.TOKEN_ENC_KEY, id), now + 60 * 60_000).run();
      const stub = env.ROOM.getByName(roomName);
      await stub.bootstrap({ mode: 'live', roomName, broadcasterId: id, login: 'hourly_test', displayName: 'Hourly Test', broadcasterType: '' });

      await hourly(env, now);

      const token = await env.DB.prepare('SELECT status, validated_at FROM oauth_tokens WHERE user_id = ?').bind(id)
        .first<{ status: string; validated_at: number | null }>();
      expect(token?.status).toBe('invalid');
      expect(token?.validated_at).toBeGreaterThanOrEqual(now);
      expect(token?.validated_at).toBeLessThanOrEqual(Date.now());
    } finally {
      fetchMock.mockRestore();
    }
  });
});
