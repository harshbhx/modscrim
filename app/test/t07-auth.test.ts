import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import { b64u, seal, unseal } from '../worker/auth/crypto.js';
import { clearCookie, COOKIES, readCookie, setCookie } from '../worker/auth/cookies.js';
import { requireJsonSameOrigin } from '../worker/auth/origin.js';
import { readStreamerSession, readToken, signToken } from '../worker/auth/session.js';
import { errorMiddleware } from '../worker/lib/errors.js';

// T-07 acceptance checks. The fuller suite is owned by T-50 (#56).
const KEY = b64u.enc(new Uint8Array(32).fill(7));
const HMAC = 'test-hmac-key';
const NOW = 1_000;

describe('seal and unseal', () => {
  it('round-trips with the user id as additional data and uses the v1 format', async () => {
    const sealed = await seal('secret-token', KEY, 'user-1');
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('secret-token');
    await expect(unseal(sealed, KEY, 'user-1')).resolves.toBe('secret-token');
  });

  it('fails with the wrong additional data', async () => {
    const sealed = await seal('secret-token', KEY, 'user-1');
    await expect(unseal(sealed, KEY, 'user-2')).rejects.toThrow();
  });
});

describe('session tokens', () => {
  it('signs and reads', async () => {
    const token = await signToken({ uid: '1', ep: 0, exp: NOW + 10 }, HMAC);
    await expect(readToken(token, HMAC, NOW)).resolves.toMatchObject({ uid: '1' });
  });

  it('rejects tampering, a wrong key and expiry', async () => {
    const token = await signToken({ uid: '1', ep: 0, exp: NOW + 10 }, HMAC);
    const [body, mac] = token.split('.');
    const forged = `${b64u.enc(new TextEncoder().encode('{"uid":"2","ep":0,"exp":9999}'))}.${mac}`;
    expect(body).toBeTruthy();
    await expect(readToken(forged, HMAC, NOW)).resolves.toBeNull();
    await expect(readToken(token, 'other-key', NOW)).resolves.toBeNull();
    await expect(readToken(token, HMAC, NOW + 10)).resolves.toBeNull();
  });

  it('returns null for malformed tokens instead of throwing', async () => {
    for (const bad of [undefined, '', 'abc', 'a.b', '!!!.???', 'a.b.c']) {
      await expect(readToken(bad, HMAC, NOW)).resolves.toBeNull();
    }
  });
});

describe('cookies', () => {
  it('sets HttpOnly, Secure, SameSite=Lax, Path=/ with the right names and ages', () => {
    for (const kind of ['streamer', 'demo', 'oauth'] as const) {
      const header = setCookie(kind, 'v');
      expect(header.startsWith(`${COOKIES[kind].name}=v;`)).toBe(true);
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Secure');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
      expect(header).not.toContain('Domain');
      expect(header).toContain(`Max-Age=${COOKIES[kind].maxAge}`);
    }
    expect(COOKIES.streamer.name).toBe('__Host-mfd_s');
    expect(COOKIES.streamer.maxAge).toBe(604800);
    expect(COOKIES.demo.maxAge).toBe(7200);
    expect(COOKIES.oauth.maxAge).toBe(600);
    expect(clearCookie('streamer')).toContain('Max-Age=0');
  });

  it('reads a cookie from a header', () => {
    expect(readCookie('a=1; __Host-mfd_s=tok; b=2', 'streamer')).toBe('tok');
    expect(readCookie('a=1', 'streamer')).toBeUndefined();
    expect(readCookie(null, 'streamer')).toBeUndefined();
  });
});

describe('streamer session and session_epoch', () => {
  async function migrate(): Promise<void> {
    await env.DB.prepare('DROP TABLE IF EXISTS users').run();
    for (const statement of migration.split(';').map((s) => s.trim()).filter(Boolean)) {
      if (statement.startsWith('CREATE TABLE users') || statement.startsWith('CREATE UNIQUE INDEX users_login')) {
        await env.DB.prepare(statement).run();
      }
    }
  }

  it('applies the full migration cleanly', async () => {
    const statements = migration.split(';').map((s) => s.trim()).filter(Boolean);
    for (const table of ['oauth_tokens', 'app_state', 'channels', 'eventsub_subscriptions', 'audit_log', 'report_summaries']) {
      await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
    await env.DB.prepare('DROP TABLE IF EXISTS users').run();
    for (const statement of statements) await env.DB.prepare(statement).run();
    const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    for (const table of ['users', 'oauth_tokens', 'app_state', 'channels', 'eventsub_subscriptions', 'audit_log', 'report_summaries']) {
      expect(names).toContain(table);
    }
  });

  it('accepts a matching epoch and rejects a changed epoch or unknown user', async () => {
    await migrate();
    await env.DB.prepare(
      "INSERT INTO users (id, login, display_name, session_epoch, created_at, updated_at) VALUES ('u1','l','L',2,0,0)"
    ).run();
    const good = await signToken({ uid: 'u1', ep: 2, exp: NOW + 10 }, HMAC);
    const stale = await signToken({ uid: 'u1', ep: 1, exp: NOW + 10 }, HMAC);
    const unknown = await signToken({ uid: 'nobody', ep: 2, exp: NOW + 10 }, HMAC);
    await expect(readStreamerSession(env.DB, good, HMAC, NOW)).resolves.toMatchObject({ uid: 'u1' });
    await expect(readStreamerSession(env.DB, stale, HMAC, NOW)).resolves.toBeNull();
    await expect(readStreamerSession(env.DB, unknown, HMAC, NOW)).resolves.toBeNull();
    await expect(readStreamerSession(env.DB, 'garbage', HMAC, NOW)).resolves.toBeNull();
  });
});

describe('Origin and JSON guard', () => {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorMiddleware);
  app.use('*', requireJsonSameOrigin);
  app.all('/x', (c) => c.json({ ok: true }));
  const bindings = { PUBLIC_BASE_URL: 'https://mfd.example.dev' } as Env;
  const call = (method: string, headers: Record<string, string>) =>
    app.request('https://mfd.example.dev/x', { method, headers }, bindings);
  const json = { 'Content-Type': 'application/json' };

  it('gives 403 bad_origin for a missing or foreign Origin on writes', async () => {
    for (const headers of [json, { ...json, Origin: 'https://evil.example' }]) {
      const response = await call('POST', headers);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'bad_origin' } });
    }
  });

  it('rejects a non-JSON write and allows a matching JSON write', async () => {
    const bad = await call('POST', { Origin: 'https://mfd.example.dev', 'Content-Type': 'text/plain' });
    expect(bad.status).toBe(400);
    const ok = await call('DELETE', { ...json, Origin: 'https://mfd.example.dev' });
    expect(ok.status).toBe(200);
  });

  it('does not guard reads', async () => {
    expect((await call('GET', {})).status).toBe(200);
  });
});
