import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import { b64u, seal, unseal } from '../worker/auth/crypto.js';
import { requireJsonSameOrigin } from '../worker/auth/origin.js';
import { readStreamerSession, readToken, signToken } from '../worker/auth/session.js';
import { AppError, errorMiddleware } from '../worker/lib/errors.js';
import { joinCode, overlayKey } from '../worker/lib/ids.js';

const HMAC = 'session-test-hmac-key';
const KEY = b64u.enc(new Uint8Array(32).fill(19));
const NOW = 1_000;

describe('signed sessions and tickets', () => {
  it('reads valid payloads and rejects tampering, wrong keys, expiry, and malformed input', async () => {
    const token = await signToken({ uid: 'u-1', ep: 3, exp: NOW + 1 }, HMAC);
    await expect(readToken(token, HMAC, NOW)).resolves.toEqual({ uid: 'u-1', ep: 3, exp: NOW + 1 });

    const [body, mac] = token.split('.');
    const altered = `${b64u.enc(new TextEncoder().encode('{"uid":"u-2","ep":3,"exp":2000}'))}.${mac}`;
    expect(body).toBeTruthy();
    await expect(readToken(altered, HMAC, NOW)).resolves.toBeNull();
    await expect(readToken(token, 'different-key', NOW)).resolves.toBeNull();
    await expect(readToken(token, HMAC, NOW + 1)).resolves.toBeNull();
    for (const malformed of [undefined, '', 'no-separator', 'a.b.c', '***.???']) {
      await expect(readToken(malformed, HMAC, NOW)).resolves.toBeNull();
    }
  });

  it('rejects unknown users and stale session epochs', async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS users').run();
    for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
      if (statement.startsWith('CREATE TABLE users') || statement.startsWith('CREATE UNIQUE INDEX users_login')) {
        await env.DB.prepare(statement).run();
      }
    }
    await env.DB.prepare(
      "INSERT INTO users (id, login, display_name, session_epoch, created_at, updated_at) VALUES ('u-1','test','Test',3,0,0)"
    ).run();

    const current = await signToken({ uid: 'u-1', ep: 3, exp: NOW + 10 }, HMAC);
    const stale = await signToken({ uid: 'u-1', ep: 2, exp: NOW + 10 }, HMAC);
    const unknown = await signToken({ uid: 'missing', ep: 3, exp: NOW + 10 }, HMAC);
    await expect(readStreamerSession(env.DB, current, HMAC, NOW)).resolves.toMatchObject({ uid: 'u-1', ep: 3 });
    await expect(readStreamerSession(env.DB, stale, HMAC, NOW)).resolves.toBeNull();
    await expect(readStreamerSession(env.DB, unknown, HMAC, NOW)).resolves.toBeNull();
  });
});

describe('token sealing', () => {
  it('uses the versioned IV and ciphertext envelope and binds the ciphertext to its owner', async () => {
    const sealed = await seal('private-token-value', KEY, 'owner-1');
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain('private-token-value');
    await expect(unseal(sealed, KEY, 'owner-1')).resolves.toBe('private-token-value');
    await expect(unseal(sealed, KEY, 'owner-2')).rejects.toThrow();
  });
});

describe('write origin guard and API errors', () => {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorMiddleware);
  app.use('*', requireJsonSameOrigin);
  app.post('/write', (context) => context.json({ ok: true }));
  app.get('/error/:code', (context) => {
    const code = context.req.param('code') as ConstructorParameters<typeof AppError>[0];
    throw new AppError(code, 'Safe test error', 'field');
  });
  const bindings = { PUBLIC_BASE_URL: 'https://mfd.test' } as Env;

  it('returns 403 for missing and foreign origins and rejects non-JSON writes', async () => {
    const invalidHeaders: Array<Record<string, string>> = [
      { 'Content-Type': 'application/json' },
      { 'Content-Type': 'application/json', Origin: 'https://foreign.test' }
    ];
    for (const headers of invalidHeaders) {
      const response = await app.request('https://mfd.test/write', { method: 'POST', headers }, bindings);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'bad_origin' } });
    }
    const nonJson = await app.request('https://mfd.test/write', {
      method: 'POST', headers: { Origin: 'https://mfd.test', 'Content-Type': 'text/plain' }
    }, bindings);
    expect(nonJson.status).toBe(400);
    await expect(nonJson.json()).resolves.toMatchObject({ error: { code: 'invalid' } });
  });

  it.each([
    ['invalid', 400], ['unauthenticated', 401], ['forbidden', 403], ['bad_origin', 403],
    ['not_found', 404], ['conflict', 409], ['rate_limited', 429], ['twitch_error', 502], ['room_unavailable', 503]
  ] as const)('maps %s to status %i and the SRS JSON envelope', async (code, status) => {
    const response = await app.request(`https://mfd.test/error/${code}`, {}, bindings);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code, message: 'Safe test error', field: 'field' } });
  });
});

describe('secure identifier formats', () => {
  it('creates six-digit join codes and 32-character overlay keys', () => {
    expect(joinCode()).toMatch(/^\d{6}$/);
    expect(overlayKey()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
