import { Hono } from 'hono';
import { z } from 'zod';
import { clearCookie, readCookie, setCookie } from '../auth/cookies.js';
import { seal } from '../auth/crypto.js';
import { deleteUserData } from '../auth/deletion.js';
import { requireJsonSameOrigin } from '../auth/origin.js';
import { requireStreamer } from '../auth/streamer.js';
import { randomId } from '../lib/ids.js';
import { AppError, errorResponse } from '../lib/errors.js';
import { log } from '../lib/log.js';
import { readToken, signToken, STREAMER_SESSION_SECONDS, type StreamerSession } from '../auth/session.js';
import { ensureChatSubscription, exchangeCode, authorizeUrl } from '../twitch/oauth.js';
import { getUsers } from '../twitch/helix.js';

export const authRoutes = new Hono<{ Bindings: Env }>();

const OAUTH_STATE_SECONDS = 10 * 60;
const TWITCH_CALLBACK = z.object({ code: z.string().min(1), state: z.string().min(1) });
const STATE_COOKIE = z.object({ state: z.string().min(1), exp: z.number() });

function badCallback(): Response {
  const response = errorResponse('invalid', 'The Twitch sign-in request expired or could not be verified.');
  response.headers.append('Set-Cookie', clearCookie('oauth'));
  return response;
}

authRoutes.get('/login', async (context) => {
  const ip = context.req.header('CF-Connecting-IP') ?? 'unknown';
  const limited = await context.env.AUTH_LIMITER.limit({ key: ip });
  if (!limited.success) return errorResponse('rate_limited', 'Too many sign-in attempts. Try again shortly.');

  const state = randomId(32);
  const expiresAt = Date.now() + OAUTH_STATE_SECONDS * 1000;
  const cookie = await signToken({ state, exp: expiresAt }, context.env.SESSION_HMAC_KEY);
  const response = context.redirect(authorizeUrl(context.env, state), 302);
  response.headers.append('Set-Cookie', setCookie('oauth', cookie));
  return response;
});

authRoutes.get('/callback', async (context) => {
  const params = TWITCH_CALLBACK.safeParse({
    code: context.req.query('code'),
    state: context.req.query('state')
  });
  if (!params.success) return badCallback();

  const oauthCookie = readCookie(context.req.header('Cookie'), 'oauth');
  const stateCookie = await readToken<z.infer<typeof STATE_COOKIE>>(
    oauthCookie,
    context.env.SESSION_HMAC_KEY,
    Date.now()
  );
  const validState = STATE_COOKIE.safeParse(stateCookie);
  if (!validState.success || !(await sameSecret(validState.data.state, params.data.state))) return badCallback();

  try {
    const tokens = await exchangeCode(context.env, params.data.code);
    const user = await getUsers(context.env, tokens.access_token);
    const now = Date.now();
    const expiresAt = now + tokens.expires_in * 1000;
    const accessSealed = await seal(tokens.access_token, context.env.TOKEN_ENC_KEY, user.id);
    const refreshSealed = await seal(tokens.refresh_token, context.env.TOKEN_ENC_KEY, user.id);
    const existing = await context.env.DB.prepare('SELECT session_epoch FROM users WHERE id = ?')
      .bind(user.id)
      .first<{ session_epoch: number }>();
    // A first sign-in (or one after "Sign out and delete my data") starts a fresh epoch, so a
    // session cookie issued before the deletion never becomes valid again (FR-04, FR-05).
    const epoch = existing?.session_epoch ?? now;

    await context.env.DB.batch([
      context.env.DB.prepare(`INSERT INTO users (id, login, display_name, avatar_url, broadcaster_type, session_epoch, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET login = excluded.login, display_name = excluded.display_name,
          avatar_url = excluded.avatar_url, broadcaster_type = excluded.broadcaster_type, updated_at = excluded.updated_at`)
        .bind(user.id, user.login, user.display_name, user.profile_image_url ?? null, user.broadcaster_type, epoch, now, now),
      context.env.DB.prepare(`INSERT INTO oauth_tokens (user_id, access_sealed, refresh_sealed, scopes, expires_at, validated_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'ok')
        ON CONFLICT(user_id) DO UPDATE SET access_sealed = excluded.access_sealed, refresh_sealed = excluded.refresh_sealed,
          scopes = excluded.scopes, expires_at = excluded.expires_at, validated_at = excluded.validated_at, status = 'ok'`)
        .bind(user.id, accessSealed, refreshSealed, JSON.stringify(tokens.scope), expiresAt, now),
      context.env.DB.prepare(`INSERT INTO channels (broadcaster_id, room_name, connected_at)
        VALUES (?, ?, ?) ON CONFLICT(broadcaster_id) DO UPDATE SET room_name = excluded.room_name, connected_at = excluded.connected_at`)
        .bind(user.id, `ch:${user.id}`, now)
    ]);

    const room = context.env.ROOM.getByName(`ch:${user.id}`);
    await room.bootstrap({
      mode: 'live',
      roomName: `ch:${user.id}`,
      broadcasterId: user.id,
      login: user.login,
      displayName: user.display_name,
      broadcasterType: user.broadcaster_type
    });
    const subscriptionStatus = await ensureChatSubscription(context.env, user.id);
    const session: StreamerSession = {
      uid: user.id,
      ep: epoch,
      exp: now + STREAMER_SESSION_SECONDS * 1000
    };
    const sessionCookie = await signToken(session, context.env.SESSION_HMAC_KEY);
    log('auth.signin', { room: `ch:${user.id}`, subscriptionStatus });

    const response = context.redirect('/console', 302);
    response.headers.append('Set-Cookie', setCookie('streamer', sessionCookie));
    response.headers.append('Set-Cookie', clearCookie('oauth'));
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    return badCallback();
  }
});

async function sameSecret(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** POST /auth/logout: "Sign out and delete my data" (FR-04). 204 once everything is deleted. */
authRoutes.post('/logout', requireJsonSameOrigin, requireStreamer, async (context) => {
  const uid = context.get('session').uid;
  const room = `ch:${uid}`;
  const started = Date.now();
  try {
    await deleteUserData(context.env, uid, { callTwitch: true });
  } catch {
    log('auth.signout', { room, uid, ok: false });
    throw new AppError('room_unavailable', 'Your data could not be deleted. Try again.');
  }
  log('auth.signout', { room, uid, ok: true, ms: Date.now() - started });
  const response = context.body(null, 204);
  response.headers.append('Set-Cookie', clearCookie('streamer'));
  response.headers.append('Set-Cookie', clearCookie('oauth'));
  return response;
});
