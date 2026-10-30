import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Test-only values for the secrets declared in wrangler.jsonc. Never real secrets.
      miniflare: {
        bindings: {
          PUBLIC_BASE_URL: 'https://mfd.test',
          SESSION_HMAC_KEY: 'test-session-hmac-key',
          TOKEN_ENC_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
          EVENTSUB_SECRET: 'test-eventsub-secret',
          TWITCH_CLIENT_SECRET: 'test-twitch-secret'
        }
      }
    })
  ]
});
