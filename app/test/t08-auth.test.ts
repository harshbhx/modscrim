import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import migration from '../migrations/0001_init.sql?raw';
import worker from '../worker/index.js';
import { setCookie } from '../worker/auth/cookies.js';
import { signToken } from '../worker/auth/session.js';

const ACCESS_TOKEN = 'test-access-token';
const REFRESH_TOKEN = 'test-refresh-token';
const APP_TOKEN = 'test-app-token';
const SESSION_KEY = 'test-session-hmac-key';
const BASE_URL = 'https://mfd.test';

let userId = '';
let userLogin = '';

async function resetDatabase(): Promise<void> {
  for (const table of [
    'report_summaries',
    'audit_log',
    'eventsub_subscriptions',
    'channels',
    'app_state',
    'oauth_tokens',
    'users'
  ]) {
    await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
  }
  const statements = migration.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await env.DB.prepare(statement).run();
}

function mockTwitch(subscriptionStatus: 'pending' | 'failed' = 'pending') {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://id.twitch.tv/oauth2/token') {
      const body = init?.body;
      const form = body instanceof URLSearchParams
        ? body
        : typeof body === 'string'
          ? new URLSearchParams(body)
          : new URLSearchParams();
      if (form.get('grant_type') === 'authorization_code') {
        return Response.json({
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
          expires_in: 14_400,
          scope: [
            'moderator:read:blocked_terms',
            'moderator:manage:blocked_terms',
            'moderator:read:automod_settings',
            'moderation:read',
            'user:read:chat',
            'user:bot',
            'channel:bot'
          ],
          token_type: 'bearer'
        });
      }
      if (form.get('grant_type') === 'client_credentials') {
        return Response.json({
          access_token: APP_TOKEN,
          expires_in: 5_184_000,
          scope: [],
          token_type: 'bearer'
        });
      }
      return Response.json({ error: 'unexpected_grant_type' }, { status: 400 });
    }

    if (url === 'https://api.twitch.tv/helix/users') {
      expect(new Headers(init?.headers).get('Client-Id')).toBe('TODO_REPLACE_WITH_TWITCH_CLIENT_ID');
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
      return Response.json({
        data: [{
          id: userId,
          login: userLogin,
          display_name: 'Test Streamer',
          profile_image_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/test.png',
          broadcaster_type: 'affiliate'
        }]
      }, { headers: { 'Ratelimit-Remaining': '799', 'Ratelimit-Reset': '1790000000' } });
    }

    if (url === 'https://api.twitch.tv/helix/eventsub/subscriptions' && init?.method === 'POST') {
      if (subscriptionStatus === 'failed') return Response.json({ error: 'unavailable' }, { status: 500 });
      expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
      return Response.json({
        data: [{
          id: `subscription-${userId}`,
          status: 'webhook_callback_verification_pending',
          type: 'channel.chat.message',
          version: '1'
        }]
      }, { status: 202 });
    }

    return Response.json({ error: 'unexpected_mock_request' }, { status: 404 });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`${BASE_URL}${path}`, init), env, {} as ExecutionContext);
}

function cookiePair(response: Response, name: string): string {
  const header = response.headers.get('Set-Cookie') ?? '';
  const pair = header.split(',').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!pair) throw new Error(`Missing ${name} cookie`);
  return pair.split(';', 1)[0] ?? '';
}

async function startLogin(): Promise<{ state: string; cookie: string; response: Response }> {
  const response = await request('/auth/login');
  const location = response.headers.get('Location');
  if (!location) throw new Error('Missing Twitch redirect');
  const state = new URL(location).searchParams.get('state');
  if (!state) throw new Error('Missing OAuth state');
  return { state, cookie: cookiePair(response, '__Host-mfd_oauth'), response };
}

async function finishLogin(state: string, cookie: string): Promise<Response> {
  return request(`/auth/callback?code=test-code&state=${encodeURIComponent(state)}`, {
    headers: { Cookie: cookie }
  });
}

async function createSessionCookie(): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO users (id, login, display_name, avatar_url, broadcaster_type, session_epoch, created_at, updated_at)
    VALUES (?, ?, 'Test Streamer', 'https://static-cdn.jtvnw.net/jtv_user_pictures/test.png', 'affiliate', 0, ?, ?)`)
    .bind(userId, userLogin, now, now)
    .run();
  await env.DB.prepare(`INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, scopes, expires_at, validated_at, status)
    VALUES (?, 'sealed-access', 'sealed-refresh', '[]', ?, ?, 'ok')`)
    .bind(userId, now + 60_000, now)
    .run();
  await env.DB.prepare('INSERT INTO channels (broadcaster_id, room_name, connected_at) VALUES (?, ?, ?)')
    .bind(userId, `ch:${userId}`, now)
    .run();
  const room = env.ROOM.getByName(`ch:${userId}`);
  await room.bootstrap({
    mode: 'live',
    roomName: `ch:${userId}`,
    broadcasterId: userId,
    login: userLogin,
    displayName: 'Test Streamer',
    broadcasterType: 'affiliate'
  });
  const signed = await signToken({ uid: userId, ep: 0, exp: now + 60_000 }, SESSION_KEY);
  return setCookie('streamer', signed).split(';', 1)[0] ?? '';
}

describe('T-08 Twitch authentication', () => {
  beforeEach(async () => {
    userId = `test-user-${crypto.randomUUID()}`;
    userLogin = `test_streamer_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    await resetDatabase();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts Twitch OAuth with the signed state cookie and all seven broadcaster scopes', async () => {
    const { response } = await startLogin();
    const location = response.headers.get('Location');
    expect(response.status).toBe(302);
    expect(location).toContain('https://id.twitch.tv/oauth2/authorize?');
    const oauthCookie = response.headers.get('Set-Cookie') ?? '';
    expect(oauthCookie).toContain('__Host-mfd_oauth=');
    expect(oauthCookie).toContain('HttpOnly');
    expect(oauthCookie).toContain('Secure');
    const scopes = new URL(location ?? BASE_URL).searchParams.get('scope')?.split(' ');
    expect(scopes).toEqual([
      'moderator:read:blocked_terms',
      'moderator:manage:blocked_terms',
      'moderator:read:automod_settings',
      'moderation:read',
      'user:read:chat',
      'user:bot',
      'channel:bot'
    ]);
  });

  it('exchanges the code, stores the user and sealed tokens, bootstraps the room and sets a session', async () => {
    mockTwitch();
    const login = await startLogin();
    const response = await finishLogin(login.state, login.cookie);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/console');
    expect(response.headers.get('Set-Cookie')).toContain('__Host-mfd_s=');

    await expect(env.DB.prepare('SELECT id, login FROM users WHERE id = ?').bind(userId).first())
      .resolves.toMatchObject({ id: userId, login: userLogin });
    const token = await env.DB.prepare('SELECT access_sealed, refresh_sealed FROM oauth_tokens WHERE user_id = ?')
      .bind(userId)
      .first<{ access_sealed: string; refresh_sealed: string }>();
    expect(token?.access_sealed).not.toContain(ACCESS_TOKEN);
    expect(token?.refresh_sealed).not.toContain(REFRESH_TOKEN);
    await expect(env.DB.prepare('SELECT broadcaster_id, room_name FROM channels WHERE broadcaster_id = ?')
      .bind(userId)
      .first())
      .resolves.toMatchObject({ broadcaster_id: userId, room_name: `ch:${userId}` });
  });

  it.each([
    ['missing state cookie', 'test-state', ''],
    ['mismatched state', 'other-state', 'valid-cookie']
  ])('rejects a %s without writing to D1', async (_label, state, cookieValue) => {
    let cookie = cookieValue;
    if (cookieValue === 'valid-cookie') {
      const signed = await signToken({ state: 'expected-state', exp: Date.now() + 60_000 }, SESSION_KEY);
      cookie = `__Host-mfd_oauth=${signed}`;
    }
    const response = await finishLogin(state, cookie);
    expect(response.status).toBe(400);
    await expect(env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()).resolves.toMatchObject({ n: 0 });
    await expect(env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_tokens').first<{ n: number }>()).resolves.toMatchObject({ n: 0 });
    await expect(env.DB.prepare('SELECT COUNT(*) AS n FROM channels').first<{ n: number }>()).resolves.toMatchObject({ n: 0 });
  });

  it('keeps sign-in successful when Twitch subscription creation fails and exposes failed status', async () => {
    mockTwitch('failed');
    const login = await startLogin();
    const response = await finishLogin(login.state, login.cookie);
    expect(response.status).toBe(302);
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('__Host-mfd_s=');

    const subscription = await env.DB.prepare('SELECT status FROM eventsub_subscriptions WHERE broadcaster_id = ?')
      .bind(userId)
      .first<{ status: string }>();
    expect(subscription?.status).toBe('failed');

    const sessionCookie = cookiePair(response, '__Host-mfd_s');
    const me = await request('/api/me', { headers: { Cookie: sessionCookie } });
    await expect(me.json()).resolves.toMatchObject({ subscriptionStatus: 'failed' });
  });

  it('never returns an access or refresh token in a body or cookie', async () => {
    mockTwitch();
    const login = await startLogin();
    const response = await finishLogin(login.state, login.cookie);
    const sessionCookie = cookiePair(response, '__Host-mfd_s');
    const me = await request('/api/me', { headers: { Cookie: sessionCookie } });
    const responses = [login.response, response, me];
    for (const item of responses) {
      const body = await item.clone().text();
      const cookies = item.headers.get('Set-Cookie') ?? '';
      expect(body).not.toContain(ACCESS_TOKEN);
      expect(body).not.toContain(REFRESH_TOKEN);
      expect(body).not.toContain('access_token');
      expect(body).not.toContain('refresh_token');
      expect(cookies).not.toContain(ACCESS_TOKEN);
      expect(cookies).not.toContain(REFRESH_TOKEN);
      expect(cookies).not.toContain('access_token');
      expect(cookies).not.toContain('refresh_token');
    }
  });

  it('returns the signed-in user and channel details from GET /api/me', async () => {
    const sessionCookie = await createSessionCookie();
    const response = await request('/api/me', { headers: { Cookie: sessionCookie } });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      user: { id: string; login: string; displayName: string };
      channel: { id: string; login: string };
      tokenStatus: string;
      subscriptionStatus: string;
      overlayUrl: string;
      modUrl: string;
    };
    expect(body).toMatchObject({
      user: { id: userId, login: userLogin, displayName: 'Test Streamer' },
      channel: { id: userId, login: userLogin },
      tokenStatus: 'ok',
      subscriptionStatus: 'pending',
      modUrl: `${BASE_URL}/mod/${userLogin}`
    });
    expect(body.overlayUrl).toMatch(new RegExp(`^${BASE_URL}/overlay/${userLogin}\\?key=[A-Za-z0-9_-]{32}$`));
  });

  it('requires a valid session for GET /api/me', async () => {
    const response = await request('/api/me');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unauthenticated' } });
  });
});
