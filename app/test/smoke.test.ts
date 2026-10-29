import { describe, expect, it } from 'vitest';
import worker from '../worker/index.js';

describe('worker scaffold', () => {
  it('returns a health response', async () => {
    const response = await worker.fetch(
      new Request('https://example.test/api/health'),
      {} as Env,
      {} as ExecutionContext
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
