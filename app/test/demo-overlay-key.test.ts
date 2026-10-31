import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../worker/index.js';

// POST /api/demo returns the room's overlay key so a client (scripts/load.ts, OBS) can open overlay sockets.
const BASE_URL = 'https://mfd.test';

function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`${BASE_URL}${path}`, init), env, {} as ExecutionContext);
}

async function createDemo() {
  const response = await call('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: '{}'
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { room: string; joinCode: string; modUrl: string; overlayKey: string };
}

describe('POST /api/demo overlayKey', () => {
  it('returns { room, joinCode, modUrl, overlayKey } with a 32-character URL-safe key', async () => {
    const body = await createDemo();
    expect(Object.keys(body).sort()).toEqual(['joinCode', 'modUrl', 'overlayKey', 'room']);
    expect(body.overlayKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('gives each room its own key, and only that key opens that room overlay socket', async () => {
    const a = await createDemo();
    const b = await createDemo();
    expect(a.overlayKey).not.toBe(b.overlayKey);

    const open = (room: string, key: string) =>
      call(`/ws/demo/${room}?overlayKey=${encodeURIComponent(key)}`, { headers: { Upgrade: 'websocket' } });

    const good = await open(a.room, a.overlayKey);
    expect(good.status).toBe(101);
    good.webSocket?.accept();
    good.webSocket?.close();

    const wrongRoom = await open(a.room, b.overlayKey);
    expect(wrongRoom.status).not.toBe(101);
    const wrongKey = await open(a.room, 'x'.repeat(32));
    expect(wrongKey.status).not.toBe(101);
  });
});
