import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors.js';
import { readCookie } from './cookies.js';
import { readStreamerSession, type StreamerSession } from './session.js';

type Vars = { session: StreamerSession };

/** Require a valid streamer session cookie (FR-05); 401 otherwise. Sets `session` on the context. */
export const requireStreamer = createMiddleware<{ Bindings: Env; Variables: Vars }>(async (context, next) => {
  const token = readCookie(context.req.header('Cookie'), 'streamer');
  const session = await readStreamerSession(context.env.DB, token, context.env.SESSION_HMAC_KEY, Date.now());
  if (!session) throw new AppError('unauthenticated', 'Sign in required.');
  context.set('session', session);
  await next();
});
