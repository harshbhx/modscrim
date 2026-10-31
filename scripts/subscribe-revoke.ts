import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const API = 'https://api.twitch.tv/helix/eventsub/subscriptions';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TokenResponseZ = z.object({ access_token: z.string().min(1), expires_in: z.number().int().positive() });
const SubscriptionZ = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  type: z.literal('user.authorization.revoke'),
  version: z.string().min(1),
  condition: z.object({ client_id: z.string().optional() })
});
const SubscriptionListZ = z.object({
  data: z.array(SubscriptionZ),
  pagination: z.object({ cursor: z.string().optional() }).optional()
});
const CreateResponseZ = z.object({
  data: z.array(z.object({ id: z.string().min(1), status: z.string().min(1), type: z.string().min(1), version: z.string().min(1) }))
});

type Config = { clientId: string; clientSecret: string; baseUrl: string; eventSubSecret: string };
type ListedSubscription = z.infer<typeof SubscriptionZ>;

async function localVars(): Promise<Record<string, string>> {
  try {
    const contents = await readFile(new URL('../app/.dev.vars', import.meta.url), 'utf8');
    return Object.fromEntries(contents.split(/\r?\n/u).flatMap((line) => {
      const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) return [];
      const key = match[1];
      const value = match[2];
      if (!key || value === undefined) return [];
      return [[key, value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, (_whole, doubleQuoted: string | undefined, singleQuoted: string | undefined) => doubleQuoted ?? singleQuoted ?? value)]];
    }));
  } catch {
    return {};
  }
}

function rateLimit(response: Response, phase: string): void {
  const number = (name: string): number | null => {
    const value = response.headers.get(name);
    return value !== null && /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  };
  console.log(JSON.stringify({
    event: 'subscription.rate_limit', phase, status: response.status,
    limit: number('Ratelimit-Limit'), remaining: number('Ratelimit-Remaining'), reset: number('Ratelimit-Reset')
  }));
}

async function getAppToken(config: Config): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials'
    })
  });
  if (!response.ok) throw new Error(`Twitch app-token request failed with HTTP ${response.status}.`);
  const parsed = TokenResponseZ.safeParse(await response.json());
  if (!parsed.success) throw new Error('Twitch app-token response was invalid.');
  return parsed.data.access_token;
}

async function listSubscriptions(config: Config, token: string): Promise<ListedSubscription[]> {
  const subscriptions: ListedSubscription[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(API);
    url.searchParams.set('type', 'user.authorization.revoke');
    if (cursor) url.searchParams.set('after', cursor);
    const response = await fetch(url, { headers: { 'Client-Id': config.clientId, Authorization: `Bearer ${token}` } });
    rateLimit(response, 'list');
    if (!response.ok) throw new Error(`Twitch subscription-list request failed with HTTP ${response.status}.`);
    const parsed = SubscriptionListZ.safeParse(await response.json());
    if (!parsed.success) throw new Error('Twitch subscription-list response was invalid.');
    subscriptions.push(...parsed.data.data.filter((item) => item.condition.client_id === config.clientId));
    cursor = parsed.data.pagination?.cursor || undefined;
  } while (cursor);
  return subscriptions;
}

async function createSubscription(config: Config, token: string): Promise<{ id: string; status: string }> {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Client-Id': config.clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'user.authorization.revoke',
      version: '1',
      condition: { client_id: config.clientId },
      transport: {
        method: 'webhook',
        callback: `${config.baseUrl.replace(/\/$/u, '')}/eventsub`,
        secret: config.eventSubSecret
      }
    })
  });
  rateLimit(response, 'create');
  if (response.status === 409) {
    const existing = (await listSubscriptions(config, token))[0];
    if (existing) return { id: existing.id, status: existing.status };
  }
  if (!response.ok) throw new Error(`Twitch subscription-create request failed with HTTP ${response.status}.`);
  const parsed = CreateResponseZ.safeParse(await response.json());
  const subscription = parsed.success ? parsed.data.data[0] : undefined;
  if (!subscription) throw new Error('Twitch subscription-create response was invalid.');
  return { id: subscription.id, status: subscription.status };
}

async function run(): Promise<void> {
  const fileVars = await localVars();
  const get = (name: string): string => process.env[name] ?? fileVars[name] ?? '';
  const config: Config = {
    clientId: get('TWITCH_CLIENT_ID'),
    clientSecret: get('TWITCH_CLIENT_SECRET'),
    baseUrl: get('PUBLIC_BASE_URL'),
    eventSubSecret: get('EVENTSUB_SECRET')
  };
  const missing = Object.entries({
    TWITCH_CLIENT_ID: config.clientId,
    TWITCH_CLIENT_SECRET: config.clientSecret,
    PUBLIC_BASE_URL: config.baseUrl,
    EVENTSUB_SECRET: config.eventSubSecret
  }).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Set required configuration: ${missing.join(', ')}.`);
  const callback = new URL(config.baseUrl);
  if (callback.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use HTTPS for Twitch EventSub.');

  const token = await getAppToken(config);
  let existing = await listSubscriptions(config, token);
  if (existing.length > 0 && existing[0]) {
    console.log(`Revoke subscription already exists (${existing[0].status}).`);
    return;
  }
  const created = await createSubscription(config, token);
  console.log(`Revoke subscription ready (${created.status}).`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected subscription setup failure.';
  console.error(message);
  process.exitCode = 1;
});
