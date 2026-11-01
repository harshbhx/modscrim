/**
 * API route mocks for surface specs. Each function intercepts fetch calls
 * so the SPA renders without a running Worker or Twitch connection.
 *
 * Safety: no real links (all .invalid), no real slurs (only slurx/slury as
 * blocks), no tokens. Overlay payloads are redacted only (AGENTS.md rule 2).
 */
import type { Page } from '@playwright/test';

export async function mockConsoleDemo(page: Page, room: string): Promise<void> {
  const base = `/api/demo/${room}`;

  await page.route(`${base}/filters`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        terms: [
          { id: 't1', text: 'free followers' },
          { id: 't2', text: 'cheap viewers' },
          { id: 't3', text: 'bit.ly' }
        ],
        automod: {
          overall_level: 2,
          disability: 1,
          aggression: 2,
          sexuality_sex_or_gender: 2,
          misogyny: 1,
          bullying: 2,
          swearing: 1,
          race_ethnicity_or_religion: 3,
          sex_based_terms: 1
        },
        fetchedAt: 1730000000000
      })
    });
  });

  await page.route(`${base}/chatlog/stats`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 71,
        oldest: 1730000000000 - 86400_000,
        newest: 1730000000000 - 300_000,
        logging: false,
        samples: [
          { login: 'viewer_one', text: 'great stream today' },
          { login: 'viewer_two', text: 'love the new emote' },
          { login: 'mod_helper', text: 'welcome everyone' }
        ]
      })
    });
  });

  await page.route(`${base}/**`, async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });
}

export async function mockSharedReport(page: Page, reportId: string): Promise<void> {
  await page.route(`/api/public/reports/${reportId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reportId,
        channel: { login: 'pixelpanda_tv', displayName: 'Pixel Panda' },
        createdAt: 1730000000000,
        card: {
          attacksShown: 18,
          slipped: 3,
          mods: [
            { name: 'Mod 1', isSim: false, caught: 12, falseBans: 1, avgReactionMs: 2400 },
            { name: 'Mod 2', isSim: false, caught: 3, falseBans: 0, avgReactionMs: 3100 },
            { name: 'Kai', isSim: true, caught: 0, falseBans: 0, avgReactionMs: null }
          ],
          grade: { passed: 7, total: 18, engine: 'local' as const },
          termsPushed: 2,
          fresh: { before: 14, after: 17, total: 18 }
        }
      })
    });
  });
}

export async function mockModDemo(page: Page, room: string): Promise<void> {
  await page.route(`/api/public/channel/**`, async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });

  await page.route(`/api/demo/${room}/**`, async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
  });
}

export async function mockOverlay(page: Page, channel: string): Promise<void> {
  await page.route(`/api/public/channel/${channel}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        broadcasterId: 'demo:overlay-test',
        displayName: 'Pixel Panda',
        avatarUrl: null,
        drillOpen: true
      })
    });
  });
}
