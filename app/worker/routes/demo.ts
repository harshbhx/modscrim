import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { COOKIES, readCookie, setCookie } from '../auth/cookies.js';
import { readToken, signToken, type DemoSession } from '../auth/session.js';
import { drillCall, drillIdOf, readDrillConfig } from '../lib/drillHttp.js';
import { AppError } from '../lib/errors.js';
import { socketUrl } from '../lib/urls.js';
import { DemoIdZ, demoRoomName } from '../room/demo.js';
import { joinRoom, limit, readJoin, readParticipantToken, reconnectTicket } from './mod.js';

/**
 * Public demo rooms (FR-38, SRS §8.2). No Twitch account: `POST /api/demo` creates a room `demo:<uuid>` and a
 * demo cookie bound to it; `/api/demo/:room/...` are the streamer drill routes scoped to that room. Mod join
 * and reconnect need no cookie (the join code or the participant token), so a phone can join from the QR code.
 * Nothing here reads D1, and demo rooms never call Twitch, D1, R2 or the Queue. Mounted under `/api`, so
 * writes keep the JSON and Origin guard.
 */
type DemoVars = { demoId: string };
export const demoRoutes = new Hono<{ Bindings: Env; Variables: DemoVars }>();

const DemoSessionZ = z.object({ room: z.string(), exp: z.number() });
const NOT_FOUND = 'Demo room not found.';

function demoIdOf(raw: string | undefined): string {
  const parsed = DemoIdZ.safeParse(raw);
  if (!parsed.success) throw new AppError('not_found', NOT_FOUND);
  return parsed.data;
}

function baseUrl(env: Env): string {
  return env.PUBLIC_BASE_URL.replace(/\/$/, '');
}

function demoModUrl(env: Env, id: string): string {
  return `${baseUrl(env)}/demo/${encodeURIComponent(id)}/mod`;
}

function roomOf(env: Env, id: string) {
  return env.ROOM.getByName(demoRoomName(id));
}

/** Demo rooms can be switched off with `DEMO_ENABLED` (SRS §12.4). */
const requireDemoEnabled = createMiddleware<{ Bindings: Env }>(async (context, next) => {
  if (context.env.DEMO_ENABLED !== 'true') throw new AppError('not_found', 'Not found.');
  await next();
});

/** The demo cookie `{ room, exp }` must be valid and bound to the room in the path. Sets `demoId`. */
const requireDemoRoom = createMiddleware<{ Bindings: Env; Variables: DemoVars }>(async (context, next) => {
  const id = demoIdOf(context.req.param('room'));
  const raw = await readToken<DemoSession>(
    readCookie(context.req.header('Cookie'), 'demo'),
    context.env.SESSION_HMAC_KEY,
    Date.now()
  );
  const session = DemoSessionZ.safeParse(raw);
  if (!session.success) throw new AppError('unauthenticated', 'Start a demo first.');
  if (session.data.room !== demoRoomName(id)) throw new AppError('forbidden', 'This demo room belongs to someone else.');
  context.set('demoId', id);
  await next();
});

demoRoutes.use('*', requireDemoEnabled);

/** POST /api/demo: a new demo room with fixtures and its first draft; sets `__Host-mfd_demo` (FR-38). */
demoRoutes.post('/', async (context) => {
  const ip = context.req.header('CF-Connecting-IP') ?? 'unknown';
  const { success } = await context.env.DEMO_LIMITER.limit({ key: `demo:${ip}` });
  if (!success) throw new AppError('rate_limited', 'Too many demo rooms. Try again in a minute.');

  const id = crypto.randomUUID();
  const name = demoRoomName(id);
  let joinCode: string;
  try {
    ({ joinCode } = await roomOf(context.env, id).bootstrapDemo(name));
  } catch {
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  const session: DemoSession = { room: name, exp: Date.now() + COOKIES.demo.maxAge * 1000 };
  context.header('Set-Cookie', setCookie('demo', await signToken(session, context.env.SESSION_HMAC_KEY)));
  return context.json({ room: id, joinCode, modUrl: demoModUrl(context.env, id) });
});

// ---- mods (no cookie) -----------------------------------------------------------------------------

/** POST /api/demo/:room/mod/join `{ code, displayName }`: the join code and the room's failed-attempt limit. */
demoRoutes.post('/:room/mod/join', async (context) => {
  const id = demoIdOf(context.req.param('room'));
  const ip = context.req.header('CF-Connecting-IP') ?? 'unknown';
  await limit(context.env, `join:${ip}:${demoRoomName(id)}`);
  const input = await readJoin(context.req.raw);
  const joined = await joinRoom(context.env, demoRoomName(id), input, ip, NOT_FOUND);
  return context.json({ ...joined, wsUrl: socketUrl(context.env.PUBLIC_BASE_URL, 'demo', id, joined.ticket) });
});

/** POST /api/demo/:room/mod/ticket `{ participantToken }`: a reconnect ticket for this demo room only. */
demoRoutes.post('/:room/mod/ticket', async (context) => {
  const id = demoIdOf(context.req.param('room'));
  const token = await readParticipantToken(context.req.raw, context.env.SESSION_HMAC_KEY);
  if (token.room !== demoRoomName(id)) throw new AppError('unauthenticated', 'Join again with the drill code.');
  await limit(context.env, `ticket:${token.pid}`);
  const ticket = await reconnectTicket(context.env, token.room, token.pid, NOT_FOUND);
  return context.json({ ticket, wsUrl: socketUrl(context.env.PUBLIC_BASE_URL, 'demo', id, ticket) });
});

// ---- console (demo cookie for this room) ----------------------------------------------------------

/** POST /api/demo/:room/ws-ticket: a single-use console ticket and the socket URL `/ws/demo/:room`. */
demoRoutes.post('/:room/ws-ticket', requireDemoRoom, async (context) => {
  const id = context.get('demoId');
  let ticket: string;
  try {
    ticket = await roomOf(context.env, id).issueTicket({ role: 'console' });
  } catch (error) {
    if (error instanceof Error && error.message === 'room_not_bootstrapped') throw new AppError('not_found', NOT_FOUND);
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
  return context.json({ ticket, wsUrl: socketUrl(context.env.PUBLIC_BASE_URL, 'demo', id, ticket) });
});

/** GET /api/demo/:room/filters: the fixture terms from this room's own `blocked_terms` (T-11 `getFilters`), never Twitch. */
demoRoutes.get('/:room/filters', requireDemoRoom, async (context) => {
  const room = roomOf(context.env, context.get('demoId'));
  try {
    // `getFilters` gives an empty view for a room that was never bootstrapped (or was collected); demo routes 404 instead.
    if ((await room.getOverlayKey()) === null) throw new AppError('not_found', NOT_FOUND);
    return context.json(await room.getFilters());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('room_unavailable', 'The room is unavailable.');
  }
});

/** POST /api/demo/:room/drills: create the draft, or return the existing one (FR-20). */
demoRoutes.post('/:room/drills', requireDemoRoom, async (context) => {
  const config = await readDrillConfig(context.req.raw);
  const id = context.get('demoId');
  const { drillId, joinCode } = await drillCall(() => roomOf(context.env, id).createDrill(config), 'A drill is already running.');
  return context.json({ drillId, joinCode, modUrl: demoModUrl(context.env, id) });
});

demoRoutes.patch('/:room/drills/:id', requireDemoRoom, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const config = await readDrillConfig(context.req.raw);
  const room = roomOf(context.env, context.get('demoId'));
  return context.json(await drillCall(() => room.updateDraft(drillId, config), 'Only a draft drill can be edited.'));
});

demoRoutes.post('/:room/drills/:id/cancel', requireDemoRoom, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const room = roomOf(context.env, context.get('demoId'));
  await drillCall(() => room.cancelDraft(drillId), 'Only a draft drill can be cancelled.');
  return context.json({ status: 'cancelled' as const });
});

demoRoutes.post('/:room/drills/:id/start', requireDemoRoom, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const room = roomOf(context.env, context.get('demoId'));
  const { startedAt } = await drillCall(() => room.startDrill(drillId), 'Only a draft drill can be started.');
  return context.json({ startedAt });
});

demoRoutes.post('/:room/drills/:id/stop', requireDemoRoom, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const room = roomOf(context.env, context.get('demoId'));
  const { endedAt } = await drillCall(() => room.stopDrill(drillId), 'Only a running drill can be stopped.');
  return context.json({ endedAt });
});

demoRoutes.get('/:room/drills/:id', requireDemoRoom, async (context) => {
  const drillId = drillIdOf(context.req.param('id'));
  const room = roomOf(context.env, context.get('demoId'));
  return context.json(await drillCall(() => room.getDrill(drillId), 'The drill is unavailable.'));
});

// TODO(T-15): POST /:room/drills/:id/grade and /grade/local, GET /:room/drills/:id/grades. Demo rooms always
//             grade locally (FR-29) and every grade is labelled engine `local` ("local estimate").
// TODO(T-16): POST /:room/drills/:id/rules, /prove, /push and /undo. Push and undo are simulated (FR-34): they
//             add to and remove from the room's own `blocked_terms`, never Twitch, and write no D1 audit row.
// TODO(T-17): GET /:room/drills/:id/report. The report stays in the room: no D1 summary, R2 export or Queue.
