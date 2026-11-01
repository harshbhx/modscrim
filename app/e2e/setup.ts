import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { demoStatePath, demoStorageStatePath } from './fixtures.js';

const DemoResponseZ = z.object({
  room: z.string().uuid(),
  joinCode: z.string().regex(/^\d{6}$/),
  overlayKey: z.string().min(1),
  modUrl: z.string().url()
});

test('warm the app and create one shared demo room', async ({ page, baseURL }) => {
  const base = baseURL ?? 'http://localhost:5173';
  const health = await page.request.get(new URL('/api/health', base).toString());
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toEqual({ ok: true });

  const response = await page.request.post(new URL('/api/demo', base).toString(), {
    headers: { Origin: new URL(base).origin },
    data: {}
  });
  expect(response.ok(), `POST /api/demo failed with ${response.status()}: ${await response.text()}`).toBeTruthy();
  const result = DemoResponseZ.parse(await response.json());
  expect(new URL(result.modUrl).origin).toBe(new URL(base).origin);
  await mkdir(resolve('app/e2e/.state'), { recursive: true });
  await writeFile(demoStatePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await page.context().storageState({ path: demoStorageStatePath });
});
