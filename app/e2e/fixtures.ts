import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test as base } from '@playwright/test';
import { z } from 'zod';

const DemoStateZ = z.object({
  room: z.string().uuid(),
  joinCode: z.string().regex(/^\d{6}$/),
  overlayKey: z.string().min(1),
  modUrl: z.string().url()
});

export type DemoState = z.infer<typeof DemoStateZ>;
export const demoStatePath = resolve('app/e2e/.state/demo.json');
export const demoStorageStatePath = resolve('app/e2e/.state/storage.json');

type Fixtures = { demo: DemoState };

export const test = base.extend<Fixtures>({
  demo: async ({}, use) => {
    const raw: unknown = JSON.parse(await readFile(demoStatePath, 'utf8'));
    await use(DemoStateZ.parse(raw));
  }
});

export { expect };
