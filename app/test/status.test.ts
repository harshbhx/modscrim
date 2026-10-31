import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import { signToken } from '../worker/auth/session.js';
import { errorMiddleware } from '../worker/lib/errors.js';
import { apiRoutes } from '../worker/routes/api.js';

beforeAll(async () => {
  for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
    await env.DB.prepare(statement.replace(/^CREATE (UNIQUE )?(TABLE|INDEX) /, 'CREATE $1$2 IF NOT EXISTS ')).run();
  }
});

async function userSession(): Promise<{ uid: string; cookie: string }> {
  const uid = String(Date.now());
  await env.DB.prepare('INSERT INTO users (id, login, display_name, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
    .bind(uid, `u${uid}`, 'Status Test').run();
  await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, 0)')
    .bind(uid, `ch:${uid}`).run();
  const token = await signToken({ uid, ep: 0, exp: Date.now() + 60_000 }, env.SESSION_HMAC_KEY);
  return { uid, cookie: `__Host-mfd_s=${token}` };
}

function testApp(): Hono {
  const app = new Hono();
  app.onError((error, context) => errorMiddleware(error, context));
  app.route('/api', apiRoutes);
  return app;
}

describe('connection status API', () => {
  it('returns token validation, subscription, chat and minute/hour quota fields', async () => {
    const { uid, cookie } = await userSession();
    const checkedAt = Date.now() - 10_000;
    await env.DB.prepare("INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, scopes, expires_at, validated_at, status) VALUES (?, 'a', 'r', '[]', ?, ?, 'ok')")
      .bind(uid, Date.now() + 60_000, checkedAt).run();
    await env.DB.prepare("INSERT INTO eventsub_subscriptions (id, broadcaster_id, type, version, status, created_at, updated_at) VALUES (?, ?, 'channel.chat.message', '1', 'enabled', 0, 0)")
      .bind(`sub-${uid}`, uid).run();
    const room = {
      chatStats: async () => ({ count: 12, newest: checkedAt, oldest: checkedAt, logging: true, samples: [] }),
      gradingQuotaStatus: async (now: number) => ({ minuteUsed: 2, hourUsed: 13, minuteLimit: 5, hourLimit: 50, nextAllowedAt: now + 60_000 })
    };
    const bindings = { ...env, ROOM: { getByName: () => room } } as unknown as Env;
    const response = await testApp().request('/api/status', { headers: { Cookie: cookie } }, bindings);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: { status: 'ok', validatedAt: checkedAt },
      subscription: { status: 'enabled' },
      chatLog: { count: 12, lastMessageAt: checkedAt },
      quota: {
        minute: { used: 2, limit: 5 },
        hour: { used: 13, limit: 50 },
        nextAllowedAt: expect.any(Number)
      }
    });
  });

  it('repairs a missing chat subscription and records Twitch status', async () => {
    const { uid, cookie } = await userSession();
    await env.DB.prepare("INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, scopes, expires_at, status) VALUES (?, 'a', 'r', '[]', ?, 'ok')")
      .bind(uid, Date.now() + 60_000).run();
    await env.DB.prepare("DELETE FROM app_state WHERE key = 'app_token'").run();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/oauth2/token')) {
        return Response.json({ access_token: 'test-app-token', expires_in: 3600, scope: [], token_type: 'bearer' });
      }
      if (url.includes('/eventsub/subscriptions') && init?.method === 'POST') {
        return Response.json({ data: [{ id: `sub-${uid}`, status: 'webhook_callback_verification_pending', type: 'channel.chat.message', version: '1' }] }, { status: 202 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    try {
      const response = await testApp().request('/api/subscription/repair', {
        method: 'POST',
        headers: { Cookie: cookie, Origin: 'https://mfd.test', 'Content-Type': 'application/json' },
        body: '{}'
      }, env);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'webhook_callback_verification_pending' });
      const row = await env.DB.prepare('SELECT status FROM eventsub_subscriptions WHERE broadcaster_id = ? AND type = ?')
        .bind(uid, 'channel.chat.message').first<{ status: string }>();
      expect(row?.status).toBe('webhook_callback_verification_pending');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
