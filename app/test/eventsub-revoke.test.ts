import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import worker from '../worker/index.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

async function signedRequest(body: string, id: string): Promise<Request> {
  const timestamp = new Date().toISOString();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.EVENTSUB_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id + timestamp + body)));
  const hex = Array.from(signature, (value) => value.toString(16).padStart(2, '0')).join('');
  return new Request('https://mfd.test/eventsub', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Twitch-Eventsub-Message-Id': id,
      'Twitch-Eventsub-Message-Timestamp': timestamp,
      'Twitch-Eventsub-Message-Signature': `sha256=${hex}`,
      'Twitch-Eventsub-Message-Type': 'notification'
    },
    body
  });
}

describe('user authorization revoke EventSub', () => {
  it('deletes the revoked user data without calling Twitch revoke', async () => {
    const uid = `revoke-${crypto.randomUUID()}`;
    const roomName = `ch:${uid}`;
    await env.DB.prepare('INSERT INTO users (id, login, display_name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
      .bind(uid, `r${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, 'Revoke Test').run();
    await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, 0)')
      .bind(uid, roomName).run();
    await env.DB.prepare("INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, scopes, expires_at, status) VALUES (?, 'sealed-access', 'sealed-refresh', '[]', 0, 'revoked')")
      .bind(uid).run();
    await env.DB.prepare("INSERT INTO audit_log (broadcaster_id, actor_id, action, at) VALUES (?, ?, 'signin', 0)")
      .bind(uid, uid).run();
    await env.DB.prepare("INSERT INTO report_summaries (report_id, broadcaster_id, drill_id, created_at, attacks, slipped, terms_pushed) VALUES (?, ?, 'drill', 0, 0, 0, 0)")
      .bind(`report-${crypto.randomUUID()}`, uid).run();
    let roomDestroyed = false;
    const bindings = {
      ...env,
      ROOM: { getByName: () => ({ destroy: async () => { roomDestroyed = true; } }) }
    } as unknown as Env;
    const envelope = {
      subscription: {
        id: `revoke-sub-${crypto.randomUUID()}`,
        type: 'user.authorization.revoke',
        version: '1',
        status: 'enabled',
        condition: { client_id: env.TWITCH_CLIENT_ID }
      },
      event: { client_id: env.TWITCH_CLIENT_ID, user_id: uid }
    };
    const request = await signedRequest(JSON.stringify(envelope), crypto.randomUUID());
    const pending: Promise<unknown>[] = [];
    const executionContext = {
      waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
      passThroughOnException: () => undefined
    } as unknown as ExecutionContext;

    const response = await worker.fetch(request, bindings, executionContext);
    expect(response.status).toBe(204);
    await Promise.all(pending);
    expect(roomDestroyed).toBe(true);
    for (const [table, column] of [
      ['users', 'id'], ['channels', 'broadcaster_id'], ['oauth_tokens', 'user_id'],
      ['audit_log', 'broadcaster_id'], ['report_summaries', 'broadcaster_id']
    ]) {
      const row = await env.DB.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).bind(uid).first();
      expect(row).toBeNull();
    }
  });
});
