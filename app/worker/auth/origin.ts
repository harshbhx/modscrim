import { createMiddleware } from 'hono/factory';
import { AppError } from '../lib/errors.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** CSRF defence (SRS §11.1): a write needs `Content-Type: application/json` and `Origin` equal to `PUBLIC_BASE_URL`. */
export function checkWrite(request: Request, publicBaseUrl: string): void {
  if (!WRITE_METHODS.has(request.method)) return;

  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(publicBaseUrl).origin) {
    throw new AppError('bad_origin', 'Cross-origin requests are not allowed.');
  }

  const type = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'application/json') {
    throw new AppError('invalid', 'Content-Type must be application/json.');
  }
}

export const requireJsonSameOrigin = createMiddleware<{ Bindings: Env }>(async (context, next) => {
  checkWrite(context.req.raw, context.env.PUBLIC_BASE_URL);
  await next();
});
