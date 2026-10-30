import { Hono } from 'hono';
import { z } from 'zod';
import { JoinZ } from '@mfd/core';
import { readToken, signToken, type ParticipantToken } from '../auth/session.js';
import { AppError } from '../lib/errors.js';
import { socketUrl } from '../lib/urls.js';
import { PARTICIPANT_TOKEN_MS } from '../room/mods.js';

/**
 * Mod and public routes (SRS §8.2, FR-22). No session: a mod proves itself with the drill's code once,
 * then with its signed participant token. Mounted under `/api`, so writes keep the JSON and Origin guard.
 */
export const modRoutes = new Hono<{ Bindings: Env }>();
export const publicRoutes = new Hono<{ Bindings: Env }>();

const LoginZ = z
  .string()
  .regex(/^[A-Za-z0-9_]{1,25}$/)
  .transform((login) => login.toLowerCase());
const TicketBodyZ = z.object({ participantToken: z.string().min(1).max(2048) });
const ParticipantTokenZ = z.object({
  room: z.string().regex(/^ch:[A-Za-z0-9_-]{1,64}$/),
  pid: z.string().min(1).max(64),
  exp: z.number()
});

type ChannelRow = { broadcaster_id: string; room_name: string; display_name: string; avatar_url: string | null };

function loginOf(raw: string | undefined): string {
  const parsed = LoginZ.safeParse(raw);
  if (!parsed.success) throw new AppError('not_found', 'Channel not found.');
  return parsed.data;
}

/** Look the channel up in D1 first, so an unknown login never wakes a room. */
async function channelByLogin(env: Env, login: string): Promise<ChannelRow> {
  const row = await env.DB.prepare(
    `SELECT c.broadcaster_id, c.room_name, u.display_name, u.avatar_url
       FROM users u JOIN channels c ON c.broadcaster_id = u.id WHERE u.login = ?`
  )
    .bind(login)
    .first<ChannelRow>();
  if (!row) throw new AppError('not_found', 'Channel not found.');
  return row;
}

async function limit(env: Env, key: string): Promise<void> {
  const { success } = await env.JOIN_LIMITER.limit({ key });
  if (!success) throw new AppError('rate_limited', 'Too many attempts. Try again in a minute.');
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError('invalid', 'Invalid request body.');
  }
}

/** GET /api/public/channel/:login: what the mod join page and the overlay need. */
publicRoutes.get('/channel/:login', async (context) => {
  const login = loginOf(context.req.param('login'));
  const ip = context.req.header('CF-Connecting-IP') ?? 'unknown';
  await limit(context.env, `public:${ip}:${login}`);
  const channel = await channelByLogin(context.env, login);
  let drillOpen: boolean | null;
  try {
    drillOpen = await context.env.ROOM.getByName(channel.room_name).isDrillOpen();
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  if (drillOpen === null) throw new AppError('not_found', 'Channel not found.');
  return context.json({
    broadcasterId: channel.broadcaster_id,
    displayName: channel.display_name,
    avatarUrl: channel.avatar_url,
    drillOpen
  });
});

/** POST /api/mod/:login/join `{ code, displayName }` (FR-22). */
modRoutes.post('/:login/join', async (context) => {
  const login = loginOf(context.req.param('login'));
  const ip = context.req.header('CF-Connecting-IP') ?? 'unknown';
  // Outer guard only (approximate, per location). The rule is 5 failures per IP per minute in the room.
  await limit(context.env, `join:${ip}:${login}`);
  const body = JoinZ.safeParse(await readJson(context.req.raw));
  if (!body.success) {
    const issue = body.error.issues[0];
    const field = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : undefined;
    throw new AppError('invalid', issue?.message ?? 'Invalid request body.', field);
  }
  const channel = await channelByLogin(context.env, login);
  const room = context.env.ROOM.getByName(channel.room_name);

  let participantId: string;
  try {
    ({ participantId } = await room.joinAsMod({ code: body.data.code, displayName: body.data.displayName, ip }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'join_forbidden') throw new AppError('forbidden', 'That join code is not right.', 'code');
    if (message === 'join_rate_limited') throw new AppError('rate_limited', 'Too many wrong codes. Try again in a minute.');
    if (message === 'join_invalid') throw new AppError('invalid', 'Invalid request body.');
    if (message === 'room_not_bootstrapped') throw new AppError('not_found', 'Channel not found.');
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }

  const token: ParticipantToken = { room: channel.room_name, pid: participantId, exp: Date.now() + PARTICIPANT_TOKEN_MS };
  const participantToken = await signToken(token, context.env.SESSION_HMAC_KEY);
  let ticket: string;
  try {
    ticket = await room.issueTicket({ role: 'mod', participantId });
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  return context.json({
    participantId,
    participantToken,
    ticket,
    wsUrl: socketUrl(context.env.PUBLIC_BASE_URL, 'ch', channel.broadcaster_id, ticket)
  });
});

/** POST /api/mod/ticket `{ participantToken }`: a fresh single-use ticket for a reconnect. */
modRoutes.post('/ticket', async (context) => {
  const body = TicketBodyZ.safeParse(await readJson(context.req.raw));
  if (!body.success) throw new AppError('invalid', 'Invalid request body.', 'participantToken');
  const raw = await readToken<ParticipantToken>(body.data.participantToken, context.env.SESSION_HMAC_KEY, Date.now());
  const token = ParticipantTokenZ.safeParse(raw);
  if (!token.success) throw new AppError('unauthenticated', 'Join again with the drill code.');
  // Per participant, so mods behind one address do not share a reconnect budget.
  await limit(context.env, `ticket:${token.data.pid}`);

  const broadcasterId = token.data.room.slice('ch:'.length);
  const known = await context.env.DB.prepare('SELECT 1 FROM channels WHERE broadcaster_id = ? AND room_name = ?')
    .bind(broadcasterId, token.data.room)
    .first();
  if (!known) throw new AppError('not_found', 'Channel not found.');

  let ticket: string;
  try {
    ticket = await context.env.ROOM.getByName(token.data.room).issueTicket({ role: 'mod', participantId: token.data.pid });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'unknown_participant') throw new AppError('unauthenticated', 'Join again with the drill code.');
    if (message === 'room_not_bootstrapped') throw new AppError('not_found', 'Channel not found.');
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  return context.json({ ticket, wsUrl: socketUrl(context.env.PUBLIC_BASE_URL, 'ch', broadcasterId, ticket) });
});
