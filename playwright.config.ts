import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
/**
 * Surface specs assert the markup of the branch under test, which is not what
 * the deployed Worker is serving during a pull request. CI therefore builds
 * the SPA, serves it with scripts/serve-static.mjs, and points these specs at
 * that. Unset locally, so they fall back to the dev server like everything else.
 */
const surfaceBaseURL = process.env.PLAYWRIGHT_SURFACE_BASE_URL ?? baseURL;
const isLocal = new URL(baseURL).origin === 'http://localhost:5173';
const statePath = resolve('app/e2e/.state');
const storageState = resolve(statePath, 'storage.json');

export default defineConfig({
  testDir: 'app/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'app/e2e/report', open: 'never' }]],
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  ...(isLocal ? {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:5173/api/health',
      reuseExistingServer: true,
      timeout: 120_000
    }
  } : {}),
  projects: [
    {
      name: 'setup',
      testMatch: /setup\.ts$/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'landing',
      testMatch: /landing\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'shell-surface',
      testMatch: /shell-surface\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'console-surface',
      testMatch: /console-surface\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'report-surface',
      testMatch: /report-surface\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'mod-surface',
      testMatch: /mod-surface\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'overlay-surface',
      testMatch: /overlay-surface\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'shared-states',
      testMatch: /(shared-states|states-gallery)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: surfaceBaseURL }
    },
    {
      name: 'site',
      testMatch: /site-.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: process.env.PLAYWRIGHT_SITE_BASE_URL ?? 'http://127.0.0.1:4174' }
    },
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    {
      name: 'safety',
      testMatch: /safety\.[\w-]+\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    {
      name: 'console',
      testMatch: /console\.(steps|grade)\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    {
      name: 'mod',
      testMatch: /mod\.keyboard\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'demo',
      testMatch: /demo\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    // README GIF capture: only exists when GIFS=1, which only .github/workflows/gifs.yml sets, so a bare
    // `playwright test` never records anything. No retries: a retry would create another demo room, and
    // POST /api/demo allows 5 per minute.
    ...(process.env.GIFS === '1' ? [{
      name: 'gifs',
      testMatch: /gifs\/[\w-]+\.gif\.ts$/,
      retries: 0,
      use: { ...devices['Desktop Chrome'], video: 'off' as const, screenshot: 'off' as const, trace: 'off' as const }
    }] : [])
  ]
});
