import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';

const DemoResponseZ = z.object({
  room: z.string().uuid(),
  joinCode: z.string().regex(/^\d{6}$/),
  overlayKey: z.string().min(1),
  modUrl: z.string().url()
});
export type DemoRoom = z.infer<typeof DemoResponseZ>;

/**
 * Create one demo room through `request`, so the demo cookie lands in the same browser context as the
 * page under test. POST /api/demo allows 5 per 60 s per IP: a 429 waits for the window instead of
 * hammering it, and callers create at most one room per spec.
 */
export async function createDemoRoom(request: APIRequestContext, baseURL: string | undefined): Promise<DemoRoom> {
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(new URL('/api/demo', origin).toString(), { headers: { Origin: origin }, data: {} });
    if (response.status() === 429) {
      await new Promise((done) => setTimeout(done, 20_000));
      continue;
    }
    expect(response.ok(), `POST /api/demo failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
    return DemoResponseZ.parse(await response.json());
  }
  throw new Error('POST /api/demo stayed rate limited (429) for 80 s');
}
