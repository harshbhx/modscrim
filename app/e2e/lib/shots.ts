import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const SHOTS = resolve('app/e2e/screenshots');
mkdirSync(SHOTS, { recursive: true });

export const WIDTHS = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 }
] as const;
