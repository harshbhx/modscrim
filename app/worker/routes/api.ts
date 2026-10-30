import { Hono } from 'hono';
import { z } from 'zod';
import { requireStreamer } from '../auth/streamer.js';
import { requireJsonSameOrigin } from '../auth/origin.js';
import { drillCall, drillIdOf, readDrillConfig } from '../lib/drillHttp.js';
import { AppError } from '../lib/errors.js';
import { socketUrl } from '../lib/urls.js';
import { demoRoutes } from './demo.js';
import { modRoutes, publicRoutes } from './mod.js';

export const apiRoutes = new Hono<{ Bindings: Env; Variables: { session: { uid: string; ep: number; exp: number } } }>();

// Writes need JSON and a matching Origin (FR-05).
apiRoutes.use('*', requireJsonSameOrigin);

apiRoutes.get('/health', (context) => context.json({ ok: true }));

// Mods and public (no session; rate-limited): T-13.
apiRoutes.route('/mod', modRoutes);
apiRoutes.route('/public', publicRoutes);

// Public demo rooms (no Twitch account; demo cookie bound to one room): T-18.
apiRoutes.route('/demo', demoRoutes);

apiRoutes.get('/filters', requireStreamer, async (context) => {
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  try {
    const filters = await room.getFilters();
    return context.json(filters);
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
});

apiRoutes.post('/filters/refresh', requireStreamer, async (context) => {
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  try {
    const filters = await room.refreshFilters();
    return context.json(filters);
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
});

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
  return context.json({ ticket, wsUrl: socketUrl(context.env.PUBLIC_BASE_URL, 'ch', id, ticket) });
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

// ---- drills (T-12: FR-16 to FR-21) ------------------------------------------------------------

/** POST /api/drills: create the draft, or return the existing one (FR-20). */
apiRoutes.post('/drills', requireStreamer, async (context) => {
  const config = await readDrillConfig(context.req.raw);
  const uid = context.get('session').uid;
  const { room } = await streamerRoom(context.env, uid);
  const user = await context.env.DB.prepare('SELECT login FROM users WHERE id = ?').bind(uid).first<{ login: string }>();
  if (!user) throw new AppError('unauthenticated', 'Sign in required.');
  const { drillId, joinCode } = await drillCall(() => room.createDrill(config), 'A drill is already running.');
  const modUrl = `${context.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/mod/${encodeURIComponent(user.login)}`;
  return context.json({ drillId, joinCode, modUrl });
});

/** PATCH /api/drills/:id: replace a draft's configuration; 409 unless the drill is a draft. */
apiRoutes.patch('/drills/:id', requireStreamer, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const config = await readDrillConfig(context.req.raw);
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  const view = await drillCall(() => room.updateDraft(drillId, config), 'Only a draft drill can be edited.');
  return context.json(view);
});

apiRoutes.post('/drills/:id/cancel', requireStreamer, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  await drillCall(() => room.cancelDraft(drillId), 'Only a draft drill can be cancelled.');
  return context.json({ status: 'cancelled' as const });
});

apiRoutes.post('/drills/:id/start', requireStreamer, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  const { startedAt } = await drillCall(() => room.startDrill(drillId), 'Only a draft drill can be started.');
  return context.json({ startedAt });
});

apiRoutes.post('/drills/:id/stop', requireStreamer, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  const { endedAt } = await drillCall(() => room.stopDrill(drillId), 'Only a running drill can be stopped.');
  return context.json({ endedAt });
});

apiRoutes.get('/drills/:id', requireStreamer, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const { room } = await streamerRoom(context.env, context.get('session').uid);
  const view = await drillCall(() => room.getDrill(drillId), 'The drill is unavailable.');
  return context.json(view);
});
