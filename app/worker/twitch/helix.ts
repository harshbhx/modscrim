import { z } from 'zod';
import type { FiltersView } from '@mfd/core';
import { log } from '../lib/log.js';

const BLOCKED_TERMS_RESPONSE = z.object({
  data: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), created_at: z.string().optional() })),
  pagination: z.object({ cursor: z.string().optional() }).optional()
});
const AUTOMOD_LEVEL = z.number().int().min(0).max(4).nullable();
const AUTOMOD_SETTINGS_RESPONSE = z.object({
  data: z.array(z.object({
    broadcaster_id: z.string().min(1),
    moderator_id: z.string().min(1),
    overall_level: AUTOMOD_LEVEL,
    disability: z.number().int().min(0).max(4),
    aggression: z.number().int().min(0).max(4),
    sexuality_sex_or_gender: z.number().int().min(0).max(4),
    misogyny: z.number().int().min(0).max(4),
    bullying: z.number().int().min(0).max(4),
    swearing: z.number().int().min(0).max(4),
    race_ethnicity_or_religion: z.number().int().min(0).max(4),
    sex_based_terms: z.number().int().min(0).max(4)
  }))
});
const MODERATORS_RESPONSE = z.object({
  data: z.array(z.object({ user_id: z.string().min(1), user_login: z.string().optional(), user_name: z.string().optional() }))
});

export type AutoModLevels = NonNullable<FiltersView['automod']>;
export type TwitchBlockedTerm = { id: string; text: string; createdAt: string | null };

const USERS_RESPONSE = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    login: z.string().min(1),
    display_name: z.string().min(1),
    profile_image_url: z.string().url().nullable().optional(),
    broadcaster_type: z.enum(['', 'affiliate', 'partner'])
  }))
});

export type TwitchUser = z.infer<typeof USERS_RESPONSE>['data'][number];

export class HelixError extends Error {
  constructor(readonly status: number, readonly ratelimitRemaining: number | null, readonly ratelimitReset: number | null) {
    super('Twitch Helix request failed.');
  }
}

function numberHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function readRateLimitHeaders(response: Response, room: string, endpoint: string): {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
} {
  const headers = {
    limit: numberHeader(response, 'Ratelimit-Limit'),
    remaining: numberHeader(response, 'Ratelimit-Remaining'),
    reset: numberHeader(response, 'Ratelimit-Reset')
  };
  log('twitch.ratelimit', { room, endpoint, httpStatus: response.status, ...headers });
  return headers;
}

export async function getUsers(env: Env, accessToken: string): Promise<TwitchUser> {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Client-Id': env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const limits = readRateLimitHeaders(response, 'twitch', 'users');
  if (!response.ok) throw new HelixError(response.status, limits.remaining, limits.reset);
  const parsed = USERS_RESPONSE.safeParse(await response.json());
  const user = parsed.success ? parsed.data.data[0] : undefined;
  if (!user) throw new HelixError(response.status, limits.remaining, limits.reset);
  return user;
}

/** A Twitch broadcaster may join as a moderator; otherwise check Get Moderators with the broadcaster token. */
export async function isChannelModerator(env: Env, broadcasterId: string, userId: string): Promise<boolean> {
  if (userId === broadcasterId) return true;
  return withUserToken(env, broadcasterId, async (accessToken) => {
    const query = new URLSearchParams({ broadcaster_id: broadcasterId, user_id: userId });
    const response = await fetch(`https://api.twitch.tv/helix/moderation/moderators?${query}`, {
      headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4_000)
    });
    const limits = readRateLimitHeaders(response, `ch:${broadcasterId}`, 'moderation/moderators');
    if (!response.ok) throw new HelixError(response.status, limits.remaining, limits.reset);
    const parsed = MODERATORS_RESPONSE.safeParse(await response.json());
    if (!parsed.success) throw new HelixError(response.status, limits.remaining, limits.reset);
    return parsed.data.data.some((moderator) => moderator.user_id === userId);
  });
}

export async function getBlockedTerms(
  env: Env,
  broadcasterId: string,
  accessToken: string
): Promise<TwitchBlockedTerm[]> {
  const terms: TwitchBlockedTerm[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId, first: '100' });
    if (cursor) query.set('after', cursor);
    const response = await fetch(`https://api.twitch.tv/helix/moderation/blocked_terms?${query}`, {
      headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4_000)
    });
    const limits = readRateLimitHeaders(response, `ch:${broadcasterId}`, 'moderation/blocked_terms');
    if (!response.ok) throw new HelixError(response.status, limits.remaining, limits.reset);
    const parsed = BLOCKED_TERMS_RESPONSE.safeParse(await response.json());
    if (!parsed.success) throw new HelixError(response.status, limits.remaining, limits.reset);
    terms.push(...parsed.data.data.map((term) => ({ id: term.id, text: term.text, createdAt: term.created_at ?? null })));
    cursor = parsed.data.pagination?.cursor;
  } while (cursor);
  return terms;
}

/** Add one blocked term. Callers serialize mutations and require streamer approval (FR-34). */
export async function addBlockedTerm(
  env: Env,
  broadcasterId: string,
  accessToken: string,
  text: string
): Promise<TwitchBlockedTerm> {
  const query = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId });
  const response = await fetch(`https://api.twitch.tv/helix/moderation/blocked_terms?${query}`, {
    method: 'POST',
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(4_000)
  });
  const limits = readRateLimitHeaders(response, `ch:${broadcasterId}`, 'moderation/blocked_terms');
  if (!response.ok) throw new HelixError(response.status, limits.remaining, limits.reset);
  const parsed = BLOCKED_TERMS_RESPONSE.safeParse(await response.json());
  const term = parsed.success ? parsed.data.data[0] : undefined;
  if (!term) throw new HelixError(response.status, limits.remaining, limits.reset);
  return { id: term.id, text: term.text, createdAt: term.created_at ?? null };
}

/** Remove one blocked term previously added by this drill (FR-35). */
export async function removeBlockedTerm(
  env: Env,
  broadcasterId: string,
  accessToken: string,
  termId: string
): Promise<void> {
  const query = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId, id: termId });
  const response = await fetch(`https://api.twitch.tv/helix/moderation/blocked_terms?${query}`, {
    method: 'DELETE',
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(4_000)
  });
  const limits = readRateLimitHeaders(response, `ch:${broadcasterId}`, 'moderation/blocked_terms');
  if (!response.ok) throw new HelixError(response.status, limits.remaining, limits.reset);
}

export async function getAutoModSettings(
  env: Env,
  broadcasterId: string,
  accessToken: string
): Promise<AutoModLevels> {
  const query = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId });
  const response = await fetch(`https://api.twitch.tv/helix/moderation/automod/settings?${query}`, {
    headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${accessToken}` }
  });
  const limits = readRateLimitHeaders(response, `ch:${broadcasterId}`, 'moderation/automod/settings');
  if (!response.ok) throw new HelixError(response.status, limits.remaining, limits.reset);
  const parsed = AUTOMOD_SETTINGS_RESPONSE.safeParse(await response.json());
  const settings = parsed.success ? parsed.data.data[0] : undefined;
  if (!settings || settings.broadcaster_id !== broadcasterId || settings.moderator_id !== broadcasterId) {
    throw new HelixError(response.status, limits.remaining, limits.reset);
  }
  return {
    overall_level: settings.overall_level,
    disability: settings.disability,
    aggression: settings.aggression,
    sexuality_sex_or_gender: settings.sexuality_sex_or_gender,
    misogyny: settings.misogyny,
    bullying: settings.bullying,
    swearing: settings.swearing,
    race_ethnicity_or_religion: settings.race_ethnicity_or_religion,
    sex_based_terms: settings.sex_based_terms
  };
}

/** Run a Helix request with the room-managed token; on one 401 refresh and retry the request once. */
export async function withUserToken<T>(env: Env, userId: string, request: (accessToken: string) => Promise<T>): Promise<T> {
  const channel = await env.DB.prepare('SELECT room_name FROM channels WHERE broadcaster_id = ?')
    .bind(userId)
    .first<{ room_name: string }>();
  if (!channel) throw new Error('channel_not_found');
  const room = env.ROOM.getByName(channel.room_name);
  const token = await room.getAccessToken();
  try {
    return await request(token);
  } catch (error) {
    if (!(error instanceof HelixError) || error.status !== 401) throw error;
    return request(await room.getAccessToken(token));
  }
}
