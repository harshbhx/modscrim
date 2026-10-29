import type { Context } from 'hono';

export type ErrorCode =
  | 'invalid'
  | 'unauthenticated'
  | 'forbidden'
  | 'bad_origin'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'twitch_error'
  | 'room_unavailable';

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  bad_origin: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  twitch_error: 502,
  room_unavailable: 503
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

export function errorResponse(code: ErrorCode, message: string, field?: string): Response {
  const error = field === undefined ? { code, message } : { code, message, field };
  return Response.json({ error }, { status: STATUS[code] });
}

export function errorMiddleware(error: Error, context: Context): Response {
  if (error instanceof AppError) {
    return errorResponse(error.code, error.message, error.field);
  }

  return Response.json(
    { error: { code: 'room_unavailable', message: 'The service is temporarily unavailable.' } },
    { status: 503 }
  );
}
