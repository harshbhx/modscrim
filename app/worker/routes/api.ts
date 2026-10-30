import { Hono } from 'hono';
import { requireStreamer } from '../auth/streamer.js';
import { requireJsonSameOrigin } from '../auth/origin.js';
import { AppError } from '../lib/errors.js';

export const apiRoutes = new Hono<{ Bindings: Env; Variables: { session: { uid: string; ep: number; exp: number } } }>();

// Writes need JSON and a matching Origin (FR-05).
apiRoutes.use('*', requireJsonSameOrigin);

apiRoutes.get('/health', (context) => context.json({ ok: true }));

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
