import { Hono } from 'hono';
import { z } from 'zod';
import { requireStreamer } from '../auth/streamer.js';
import { requireJsonSameOrigin } from '../auth/origin.js';
import { AppError } from '../lib/errors.js';

export const apiRoutes = new Hono<{ Bindings: Env; Variables: { session: { uid: string; ep: number; exp: number } } }>();

// Writes need JSON and a matching Origin (FR-05).
apiRoutes.use('*', requireJsonSameOrigin);

apiRoutes.get('/health', (context) => context.json({ ok: true }));

apiRoutes.get('/chatlog/stats', requireStreamer, async (context) => {
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  try {
    const stats = await room.chatStats();
    if (!stats) throw new AppError('room_unavailable', 'The room is unavailable.');
    return context.json(stats);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
});

apiRoutes.post('/chatlog/logging', requireStreamer, async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new AppError('invalid', 'Invalid request body.');
  }
  const parsed = z.object({ on: z.boolean() }).safeParse(body);
  if (!parsed.success) throw new AppError('invalid', 'Invalid request body.');
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  try {
    const logging = await room.setLogging(parsed.data.on);
    if (logging === null) throw new AppError('room_unavailable', 'The room is unavailable.');
    return context.json({ logging });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
});

apiRoutes.delete('/chatlog', requireStreamer, async (context) => {
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  try {
    const deleted = await room.deleteChatLog();
    if (deleted === null) throw new AppError('room_unavailable', 'The room is unavailable.');
    return context.json({ deleted });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
});

apiRoutes.get('/me', requireStreamer, async (context) => {
  const uid = context.get('session').uid;
  const row = await context.env.DB.prepare(`SELECT u.id, u.login, u.display_name, u.avatar_url, u.broadcaster_type,
      o.status AS token_status, e.status AS subscription_status, c.room_name
    FROM users u JOIN channels c ON c.broadcaster_id = u.id
    LEFT JOIN oauth_tokens o ON o.user_id = u.id
    LEFT JOIN eventsub_subscriptions e ON e.broadcaster_id = u.id AND e.type = 'channel.chat.message'
    WHERE u.id = ? ORDER BY e.updated_at DESC LIMIT 1`)
    .bind(uid)
    .first<{
      id: string;
      login: string;
      display_name: string;
      avatar_url: string | null;
      broadcaster_type: '' | 'affiliate' | 'partner';
      token_status: string | null;
      subscription_status: string | null;
      room_name: string;
    }>();
  if (!row) throw new AppError('not_found', 'Channel not found.');

  let overlayKey: string | null;
  try {
    overlayKey = await context.env.ROOM.getByName(row.room_name).getOverlayKey();
  } catch {
    throw new AppError('room_unavailable', 'The channel room is unavailable.');
  }
  if (!overlayKey) throw new AppError('room_unavailable', 'The channel room is unavailable.');

  const baseUrl = context.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const channel = {
    id: row.id,
    login: row.login,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    broadcasterType: row.broadcaster_type
  };
  return context.json({
    user: channel,
    channel,
    tokenStatus: row.token_status ?? 'invalid',
    subscriptionStatus: row.subscription_status ?? 'pending',
    overlayUrl: `${baseUrl}/overlay/${encodeURIComponent(row.login)}?key=${encodeURIComponent(overlayKey)}`,
    modUrl: `${baseUrl}/mod/${encodeURIComponent(row.login)}`
  });
});

/** The streamer's room: `ch:<broadcasterId>`, which is the user ID. A missing channel row means not signed in fully. */
async function streamerRoom(env: Env, uid: string) {
  const channel = await env.DB.prepare('SELECT broadcaster_id, room_name FROM channels WHERE broadcaster_id = ?')
    .bind(uid)
    .first<{ broadcaster_id: string; room_name: string }>();
  if (!channel) throw new AppError('not_found', 'Channel not found.');
  return { id: channel.broadcaster_id, room: env.ROOM.getByName(channel.room_name) };
}

/** POST /api/ws-ticket: a single-use console ticket and the socket URL. */
apiRoutes.post('/ws-ticket', requireStreamer, async (context) => {
  const { id, room } = await streamerRoom(context.env, context.get('session').uid);
  let ticket: string;
  try {
    ticket = await room.issueTicket({ role: 'console' });
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  const base = new URL(context.env.PUBLIC_BASE_URL);
  const wsUrl = `${base.protocol === 'https:' ? 'wss' : 'ws'}://${base.host}/ws/ch/${encodeURIComponent(id)}?ticket=${encodeURIComponent(ticket)}`;
  return context.json({ ticket, wsUrl });
});

/** POST /api/overlay/rotate: new overlay key; old overlay sockets are closed by the room. */
apiRoutes.post('/overlay/rotate', requireStreamer, async (context) => {
  const uid = context.get('session').uid;
  const { room } = await streamerRoom(context.env, uid);
  const user = await context.env.DB.prepare('SELECT login FROM users WHERE id = ?').bind(uid).first<{ login: string }>();
  if (!user) throw new AppError('unauthenticated', 'Sign in required.');
  let key: string;
  try {
    key = await room.rotateOverlayKey();
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  const overlayUrl = `${context.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/overlay/${encodeURIComponent(user.login)}?key=${encodeURIComponent(key)}`;
  return context.json({ overlayUrl });
});
