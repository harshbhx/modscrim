import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
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
      name: 'smoke',
      testMatch: /smoke\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    {
      name: 'safety',
      testMatch: /safety\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    {
      name: 'console',
      testMatch: /console\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    },
    {
      name: 'demo',
      testMatch: /demo\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState }
    }
  ]
});
