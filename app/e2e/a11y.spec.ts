import { expect, test } from '@playwright/test';
import { motionFindings, recordMotion, type Finding } from './lib/audit';
import { installConsoleMock } from './lib/console-mock';
import { mockConsoleDemo, mockModDemo, mockOverlay, mockOverlayFixtureSocket, mockSharedReport, OVERLAY_LONG } from './lib/mock-api';
import { mockModRoom } from './lib/mock-mod-room';

/**
 * Reduced motion (T-137): with prefers-reduced-motion set, no surface may keep
 * an infinite or long animation running, and smooth scrolling is off. Entrance
 * transitions of a few hundred ms are allowed to finish; the audit waits for
 * them before it looks (lib/audit.ts, motionFindings).
 */

const ROOM = 'motion-test';
test.use({ reducedMotion: 'reduce' });

const SURFACES: Array<{ name: string; open: (page: import('@playwright/test').Page, base: string) => Promise<void> }> = [
  { name: 'landing', open: async (page) => { await page.goto('/'); } },
  { name: 'demo-entry', open: async (page) => { await mockConsoleDemo(page, ROOM); await page.goto('/demo'); } },
  { name: 'privacy', open: async (page) => { await page.goto('/privacy'); } },
  { name: 'not-found', open: async (page) => { await page.goto('/no-such-page'); } },
  { name: 'mod-join', open: async (page) => { await mockModDemo(page, ROOM); await page.goto(`/demo/${ROOM}/mod`); } },
  { name: 'mod-practice', open: async (page) => { await mockModRoom(page, ROOM, 'practice'); await page.goto(`/demo/${ROOM}/mod`); } },
  { name: 'mod-ended', open: async (page) => { await mockModRoom(page, ROOM, 'ended'); await page.goto(`/demo/${ROOM}/mod`); } },
  { name: 'share-card', open: async (page) => { await mockSharedReport(page, 'motion-rpt-001'); await page.goto('/r/motion-rpt-001'); } },
  {
    name: 'overlay-live',
    open: async (page) => {
      await mockOverlay(page, 'pixelpanda_tv');
      await mockOverlayFixtureSocket(page, OVERLAY_LONG);
      await page.goto('/overlay/pixelpanda_tv?key=overlay-fixture-key');
    }
  },
  {
    name: 'console-demo',
    open: async (page, base) => {
      const mock = await installConsoleMock(page, { mode: 'demo', staticBase: base });
      await mock.open(page);
    }
  }
];

for (const surface of SURFACES) {
  test(`reduced motion: ${surface.name}`, async ({ page, baseURL }) => {
    await surface.open(page, baseURL ?? 'http://127.0.0.1:4173');
    const findings: Finding[] = await motionFindings(page);
    recordMotion(`motion-${surface.name}`, findings);
    if (process.env.A11Y_ENFORCE === '1') {
      expect(findings.map((f) => `${f.target}: ${f.detail}`), surface.name).toEqual([]);
    }
  });
}
