import { z } from 'zod';
import { seal, unseal } from '../auth/crypto.js';
import { log } from '../lib/log.js';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TOKEN_RESPONSE = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.array(z.string()),
  token_type: z.string().optional()
});

export type OAuthTokens = z.infer<typeof TOKEN_RESPONSE>;
export type UserOAuthTokens = OAuthTokens & { refresh_token: string };

export class TwitchOAuthError extends Error {
  constructor(readonly status: number) {
    super('Twitch OAuth request failed.');
  }
}

async function tokenRequest(env: Env, params: URLSearchParams): Promise<OAuthTokens> {
  params.set('client_id', env.TWITCH_CLIENT_ID);
  params.set('client_secret', env.TWITCH_CLIENT_SECRET);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  if (!response.ok) throw new TwitchOAuthError(response.status);
  const parsed = TOKEN_RESPONSE.safeParse(await response.json());
  if (!parsed.success) throw new TwitchOAuthError(response.status);
  return parsed.data;
}

export async function exchangeCode(env: Env, code: string): Promise<UserOAuthTokens> {
  const result = await tokenRequest(env, new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/auth/callback`
  }));
  if (!result.refresh_token) throw new TwitchOAuthError(502);
  return { ...result, refresh_token: result.refresh_token };
}

export async function refreshToken(env: Env, refresh: string): Promise<OAuthTokens> {
  return tokenRequest(env, new URLSearchParams({
    refresh_token: refresh,
    grant_type: 'refresh_token'
  }));
}

export async function getAppToken(env: Env): Promise<{ token: string; expiresAt: number }> {
  const result = await tokenRequest(env, new URLSearchParams({ grant_type: 'client_credentials' }));
  return { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
}

const VALIDATION_RESPONSE = z.object({
  client_id: z.string().min(1),
  login: z.string().min(1),
  scopes: z.array(z.string()),
  user_id: z.string().min(1),
  expires_in: z.number().int().nonnegative()
});

export async function validateToken(env: Env, accessToken: string): Promise<z.infer<typeof VALIDATION_RESPONSE>> {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${accessToken}` }
  });
  if (!response.ok) throw new TwitchOAuthError(response.status);
  const parsed = VALIDATION_RESPONSE.safeParse(await response.json());
  if (!parsed.success) throw new TwitchOAuthError(response.status);
  return parsed.data;
}

export async function revokeToken(env: Env, accessToken: string): Promise<void> {
  const response = await fetch('https://id.twitch.tv/oauth2/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, token: accessToken })
  });
  if (!response.ok) throw new TwitchOAuthError(response.status);
}

export function authorizeUrl(env: Env, state: string): string {
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.searchParams.set('client_id', env.TWITCH_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/auth/callback`);
  url.searchParams.set('response_type', 'code');
  const scopes = [
    'moderator:read:blocked_terms',
    'moderator:manage:blocked_terms',
    'moderator:read:automod_settings',
    'moderation:read',
    'user:read:chat',
    'user:bot',
    'channel:bot'
  ];
  if (String(env.ANNOUNCE_ENABLED).toLowerCase() === 'true') scopes.push('user:write:chat');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export async function getCachedAppToken(env: Env): Promise<string> {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT value FROM app_state WHERE key = 'app_token'")
    .first<{ value: string }>();
  if (row) {
    try {
      const cached = JSON.parse(await unseal(row.value, env.TOKEN_ENC_KEY, 'app_token')) as {
        token?: unknown;
        expires_at?: unknown;
      };
      if (typeof cached.token === 'string' && typeof cached.expires_at === 'number' && cached.expires_at > now + 5 * 60_000) {
        return cached.token;
      }
    } catch {
      // A corrupt or old cache is replaced with a fresh token.
    }
  }

  const appToken = await getAppToken(env);
  const value = await seal(JSON.stringify({ token: appToken.token, expires_at: appToken.expiresAt }), env.TOKEN_ENC_KEY, 'app_token');
  await env.DB.prepare("INSERT INTO app_state (key, value, updated_at) VALUES ('app_token', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(value, now)
    .run();
  return appToken.token;
}

const SUBSCRIPTION_RESPONSE = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    type: z.string().min(1),
    version: z.string().min(1)
  }))
});

const SUBSCRIPTION_LIST_RESPONSE = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    status: z.string().min(1),
    type: z.string().min(1),
    version: z.string().min(1),
    condition: z.object({ broadcaster_user_id: z.string().optional(), user_id: z.string().optional() })
  })),
  pagination: z.object({ cursor: z.string().optional() }).optional()
});

function rateLimitHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function recordSubscriptionRateLimit(response: Response, phase: 'create' | 'list' | 'delete'): void {
  log('eventsub.subscription', {
    room: 'eventsub',
    subType: `channel.chat.message.${phase}`,
    status: response.ok ? 'http_ok' : 'http_error',
    httpStatus: response.status,
    rateLimit: rateLimitHeader(response, 'Ratelimit-Limit'),
    remaining: rateLimitHeader(response, 'Ratelimit-Remaining'),
    reset: rateLimitHeader(response, 'Ratelimit-Reset')
  });
}

export type ListedSubscription = z.infer<typeof SUBSCRIPTION_LIST_RESPONSE>['data'][number];

/** Every `channel.chat.message` subscription this app holds, across all pages; null when Twitch cannot be read. */
export async function listChatSubscriptions(env: Env, appToken: string): Promise<ListedSubscription[] | null> {
  const all: ListedSubscription[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions');
    url.searchParams.set('type', 'channel.chat.message');
    if (cursor) url.searchParams.set('after', cursor);
    const response = await fetch(url, {
      headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${appToken}` }
    });
    recordSubscriptionRateLimit(response, 'list');
    if (!response.ok) return null;
    const parsed = SUBSCRIPTION_LIST_RESPONSE.safeParse(await response.json());
    if (!parsed.success) return null;
    all.push(...parsed.data.data.filter((item) => item.type === 'channel.chat.message'));
    cursor = parsed.data.pagination?.cursor || undefined;
  } while (cursor);
  return all;
}

/** True when the subscription is the broadcaster's own chat subscription (FR-08). */
export function isChatSubscriptionFor(subscription: ListedSubscription, broadcasterId: string): boolean {
  return subscription.condition.broadcaster_user_id === broadcasterId && subscription.condition.user_id === broadcasterId;
}

/** Delete one EventSub subscription with the app token. A 404 means it is already gone. */
export async function deleteSubscription(env: Env, appToken: string, id: string): Promise<boolean> {
  const url = new URL('https://api.twitch.tv/helix/eventsub/subscriptions');
  url.searchParams.set('id', id);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${appToken}` }
  });
  recordSubscriptionRateLimit(response, 'delete');
  return response.ok || response.status === 404;
}

async function findExistingChatSubscription(env: Env, appToken: string, broadcasterId: string) {
  const listed = await listChatSubscriptions(env, appToken);
  return listed?.find((item) => isChatSubscriptionFor(item, broadcasterId)) ?? null;
}

/** Create the broadcaster's chat subscription after sign-in; subscription failure is non-fatal. */
export async function ensureChatSubscription(env: Env, broadcasterId: string): Promise<string> {
  const now = Date.now();
  const saveStatus = async (id: string, status: string): Promise<void> => {
    await env.DB.prepare("INSERT INTO eventsub_subscriptions (id, broadcaster_id, type, version, status, created_at, updated_at) VALUES (?, ?, 'channel.chat.message', '1', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at")
      .bind(id, broadcasterId, status, now, now)
      .run();
  };

  try {
    if (new URL(env.PUBLIC_BASE_URL).protocol !== 'https:') {
      await saveStatus(`skipped:${broadcasterId}`, 'skipped');
      return 'skipped';
    }
    const appToken = await getCachedAppToken(env);
    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Client-Id': env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'channel.chat.message',
        version: '1',
        condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId },
        transport: {
          method: 'webhook',
          callback: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/eventsub`,
          secret: env.EVENTSUB_SECRET
        }
      })
    });
    recordSubscriptionRateLimit(response, 'create');
    if (response.status === 409) {
      const existing = await findExistingChatSubscription(env, appToken, broadcasterId);
      if (!existing) throw new TwitchOAuthError(response.status);
      await env.DB.prepare('INSERT INTO eventsub_subscriptions (id, broadcaster_id, type, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at')
        .bind(existing.id, broadcasterId, existing.type, existing.version, existing.status, now, now)
        .run();
      return existing.status;
    }
    if (!response.ok) throw new TwitchOAuthError(response.status);
    const parsed = SUBSCRIPTION_RESPONSE.safeParse(await response.json());
    const subscription = parsed.success ? parsed.data.data[0] : undefined;
    if (!subscription) throw new TwitchOAuthError(response.status);
    await env.DB.prepare('INSERT INTO eventsub_subscriptions (id, broadcaster_id, type, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at')
      .bind(subscription.id, broadcasterId, subscription.type, subscription.version, subscription.status, now, now)
      .run();
    return subscription.status;
  } catch {
    await saveStatus(`failed:${broadcasterId}`, 'failed').catch(() => undefined);
    return 'failed';
  }
}
