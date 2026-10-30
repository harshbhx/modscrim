import { z } from 'zod';

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

export async function getUsers(env: Env, accessToken: string): Promise<TwitchUser> {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Client-Id': env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const remaining = numberHeader(response, 'Ratelimit-Remaining');
  const reset = numberHeader(response, 'Ratelimit-Reset');
  if (!response.ok) throw new HelixError(response.status, remaining, reset);
  const parsed = USERS_RESPONSE.safeParse(await response.json());
  const user = parsed.success ? parsed.data.data[0] : undefined;
  if (!user) throw new HelixError(response.status, remaining, reset);
  return user;
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
