import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { AppError, errorMiddleware } from '../worker/lib/errors.js';
import { joinCode, overlayKey, reportId } from '../worker/lib/ids.js';
import { log } from '../worker/lib/log.js';

describe('Worker foundations', () => {
  it.each([
    ['invalid', 400],
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['bad_origin', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['rate_limited', 429],
    ['twitch_error', 502],
    ['room_unavailable', 503]
  ] as const)('returns the SRS error shape for %s', async (code, status) => {
    const app = new Hono();
    app.onError(errorMiddleware);
    app.get('/', () => {
      throw new AppError(code, 'Test message', 'field');
    });

    const response = await app.request('https://example.test/');

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message: 'Test message', field: 'field' }
    });
  });

  it('drops token and chat-text-like fields before logging', () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    log('auth.signin', {
      room: 'ch:123',
      access_token: 'must-not-appear',
      chatText: 'must-not-appear',
      nested: { token: 'must-not-appear', result: 'stored' },
      ok: true
    });

    const line = String(write.mock.calls[0]?.[0]);
    write.mockRestore();

    expect(line).toContain('"evt":"auth.signin"');
    expect(line).toContain('"room":"ch:123"');
    expect(line).toContain('"ok":true');
    expect(line).not.toContain('must-not-appear');
  });

  it('generates correctly shaped cryptographic IDs', () => {
    expect(joinCode()).toMatch(/^\d{6}$/);
    expect(overlayKey()).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(reportId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
