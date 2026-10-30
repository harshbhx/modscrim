import { readFile } from 'node:fs/promises';
import {
  DEMO_TERMS,
  FIXTURE_CHAT,
  blockedBy,
  buildCleanIndex,
  buildWaveA,
  buildWaveB,
  findRules,
  proveOnFreshWave,
  type DrillConfig,
  type WaveLine
} from '@mfd/core';
import { z } from 'zod';

const API = 'https://api.twitch.tv/helix';
const TWO_WORD_TERM = 'nitrodrop invalid';
const A01_MESSAGES = [
  'nitrodrop.invalid',
  'nitrodrop[.]invalid',
  'nitrodrop dot invalid',
  'invalid nitrodrop'
] as const;

const UsersResponse = z.object({
  data: z.array(z.object({ id: z.string(), broadcaster_type: z.enum(['', 'affiliate', 'partner']) }))
});
const BlockedTermsResponse = z.object({
  data: z.array(z.object({ id: z.string(), text: z.string() })),
  pagination: z.object({ cursor: z.string().optional() }).optional()
});
const AddedTermResponse = z.object({
  data: z.array(z.object({ id: z.string(), text: z.string(), created_at: z.string().optional() }))
});
const GradeResponse = z.object({ data: z.array(z.object({ msg_id: z.string(), is_permitted: z.boolean() })) });

type BroadcasterType = '' | 'affiliate' | 'partner';
type GradeLine = { msg_id: string; msg_text: string };
type GradeCall = {
  status: number;
  elapsedMs: number;
  headers: Record<string, string | null>;
  body: unknown;
  shape: string;
};

const perMinuteLimit: Record<BroadcasterType, number> = { '': 5, affiliate: 10, partner: 30 };
const clock = (): number => Date.now();

function redact(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') {
    return secrets.reduce((text, secret) => secret ? text.split(secret).join('[REDACTED]') : text, value);
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, secrets)]));
  }
  return value;
}

function row(step: string, measure: string, result: string, notes = ''): void {
  const cells = [step, measure, result, notes].map((value) => value.replaceAll('|', '\\|').replaceAll('\n', ' '));
  console.log(`| ${cells.join(' | ')} |`);
}

function padChat(source: readonly string[]): { lines: string[]; supplied: number; fixture: number } {
  const lines = source.map((line) => line.trim()).filter(Boolean);
  const supplied = lines.length;
  for (let cursor = 0; lines.length < 300; cursor++) {
    lines.push(FIXTURE_CHAT[cursor % FIXTURE_CHAT.length] as string);
  }
  return { lines, supplied, fixture: lines.length - supplied };
}

function twitchHeaders(token: string, clientId: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Client-Id': clientId,
    ...(json ? { 'Content-Type': 'application/json' } : {})
  };
}

async function twitchFetch(url: string, token: string, clientId: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...twitchHeaders(token, clientId, init.body !== undefined), ...init.headers }
  });
}

async function readBody(response: Response): Promise<{ value: unknown; shape: string }> {
  const text = await response.text();
  if (!text) return { value: null, shape: 'empty' };
  try {
    const value: unknown = JSON.parse(text);
    const keys = value !== null && typeof value === 'object' ? Object.keys(value).join(',') || '(none)' : typeof value;
    return { value, shape: `${Array.isArray(value) ? 'array' : 'object'} keys: ${keys}` };
  } catch {
    return { value: text, shape: 'text' };
  }
}

async function grade(
  lines: readonly GradeLine[], broadcasterId: string, token: string, clientId: string, secrets: readonly string[]
): Promise<GradeCall> {
  const started = clock();
  const response = await twitchFetch(`${API}/moderation/enforcements/status?broadcaster_id=${encodeURIComponent(broadcasterId)}`, token, clientId, {
    method: 'POST',
    body: JSON.stringify({ data: lines })
  });
  const parsed = await readBody(response);
  return {
    status: response.status,
    elapsedMs: clock() - started,
    headers: {
      'Ratelimit-Limit': response.headers.get('Ratelimit-Limit'),
      'Ratelimit-Remaining': response.headers.get('Ratelimit-Remaining'),
      'Ratelimit-Reset': response.headers.get('Ratelimit-Reset')
    },
    body: redact(parsed.value, secrets),
    shape: parsed.shape
  };
}

function parseGrade(call: GradeCall): Map<string, boolean> | null {
  const parsed = GradeResponse.safeParse(call.body);
  return parsed.success ? new Map(parsed.data.data.map((item) => [item.msg_id, item.is_permitted])) : null;
}

async function getBroadcasterType(id: string, token: string, clientId: string): Promise<BroadcasterType> {
  const response = await twitchFetch(`${API}/users?id=${encodeURIComponent(id)}`, token, clientId);
  if (!response.ok) throw new Error(`Get Users failed with HTTP ${response.status}.`);
  const parsed = UsersResponse.safeParse(await response.json());
  const user = parsed.success ? parsed.data.data[0] : undefined;
  if (!user || user.id !== id) throw new Error('Get Users returned an invalid broadcaster response.');
  return user.broadcaster_type;
}

async function getBlockedTerms(
  broadcasterId: string, token: string, clientId: string
): Promise<{ id: string; text: string }[]> {
  const results: { id: string; text: string }[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId, first: '100' });
    if (cursor) query.set('after', cursor);
    const response = await twitchFetch(`${API}/moderation/blocked_terms?${query}`, token, clientId);
    if (!response.ok) throw new Error(`Get Blocked Terms failed with HTTP ${response.status}.`);
    const parsed = BlockedTermsResponse.safeParse(await response.json());
    if (!parsed.success) throw new Error('Get Blocked Terms returned an invalid response.');
    results.push(...parsed.data.data);
    cursor = parsed.data.pagination?.cursor;
  } while (cursor);
  return results;
}

async function probeQuota(
  broadcasterId: string, token: string, clientId: string, perMinute: number, secrets: readonly string[]
): Promise<'request' | 'line' | 'unknown'> {
  console.log('| Probe | HTTP | ms | Response shape | Rate headers | Response body |');
  let requestLimitAtExpectedCount = false;
  for (let count = 1; count <= perMinute + 1; count++) {
    const call = await grade([{ msg_id: `day0-quota-${count}`, msg_text: 'hello there' }], broadcasterId, token, clientId, secrets);
    const headers = Object.entries(call.headers).map(([key, value]) => `${key}=${value ?? '—'}`).join(', ');
    console.log(`| one-line-${count} | ${call.status} | ${call.elapsedMs} | ${call.shape} | ${headers} | ${JSON.stringify(call.body)} |`);
    if (call.status === 429) {
      requestLimitAtExpectedCount = count === perMinute + 1;
      break;
    }
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 61_000));
  const lines = Array.from({ length: perMinute + 1 }, (_, idx) => ({
    msg_id: `day0-quota-batch-${idx}`, msg_text: 'hello there'
  }));
  const batchCall = await grade(lines, broadcasterId, token, clientId, secrets);
  const headers = Object.entries(batchCall.headers).map(([key, value]) => `${key}=${value ?? '—'}`).join(', ');
  console.log(`| batch-${lines.length}-lines | ${batchCall.status} | ${batchCall.elapsedMs} | ${batchCall.shape} | ${headers} | ${JSON.stringify(batchCall.body)} |`);
  if (!requestLimitAtExpectedCount) return 'unknown';
  return batchCall.status === 429 ? 'line' : 'request';
}

async function measureBatchSize(
  broadcasterId: string,
  token: string,
  clientId: string,
  secrets: readonly string[],
  unit: 'request' | 'line' | 'unknown',
  perMinute: number
): Promise<number> {
  await new Promise<void>((resolve) => setTimeout(resolve, 61_000));
  const count = unit === 'line' ? perMinute : 100;
  const lines = Array.from({ length: count }, (_, idx) => ({ msg_id: `day0-batch-${idx}`, msg_text: 'hello there' }));
  const call = await grade(lines, broadcasterId, token, clientId, secrets);
  console.log(`| batch-cap-probe-${count}-lines | ${call.status} | ${call.elapsedMs} | ${call.shape} | ${JSON.stringify(call.headers)} | ${JSON.stringify(call.body)} |`);
  return call.status === 200 ? count : 0;
}

async function testTwoWordTerm(
  broadcasterId: string,
  token: string,
  clientId: string,
  existing: readonly { id: string; text: string }[],
  secrets: readonly string[]
): Promise<string> {
  if (process.env.DAY0_ALLOW_BLOCKED_TERM_WRITE !== '1') {
    return 'skipped; set DAY0_ALLOW_BLOCKED_TERM_WRITE=1 to temporarily add and remove the test term';
  }
  if (existing.some((term) => term.text.toLowerCase() === TWO_WORD_TERM)) {
    return 'skipped; test term already exists and was left untouched';
  }

  const query = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId });
  const response = await twitchFetch(`${API}/moderation/blocked_terms?${query}`, token, clientId, {
    method: 'POST', body: JSON.stringify({ text: TWO_WORD_TERM })
  });
  if (!response.ok) return `add failed with HTTP ${response.status}`;
  const parsed = AddedTermResponse.safeParse(await response.json());
  const added = parsed.success ? parsed.data.data[0] : undefined;
  if (!added) return 'add returned an invalid response; no cleanup ID available';

  let result: string;
  try {
    const lines = A01_MESSAGES.map((msg_text, idx) => ({ msg_id: `day0-a01-${idx}`, msg_text }));
    const call = await grade(lines, broadcasterId, token, clientId, secrets);
    const twitch = parseGrade(call);
    result = twitch === null
      ? `grade failed with HTTP ${call.status} (${call.shape})`
      : A01_MESSAGES.map((message, idx) => {
        const permitted = twitch.get(`day0-a01-${idx}`);
        const twitchResult = permitted === undefined ? 'missing' : permitted ? 'permitted' : 'blocked';
        const localResult = blockedBy([TWO_WORD_TERM], message) ? 'blocked' : 'permitted';
        return `${message}: local ${localResult}, Twitch ${twitchResult}`;
      }).join('; ');
  } finally {
    const deleteQuery = new URLSearchParams({ broadcaster_id: broadcasterId, moderator_id: broadcasterId, id: added.id });
    const deleted = await twitchFetch(`${API}/moderation/blocked_terms?${deleteQuery}`, token, clientId, { method: 'DELETE' });
    if (!deleted.ok && deleted.status !== 404) result = `${result!}; cleanup failed with HTTP ${deleted.status} (term id ${added.id})`;
    else result = `${result!}; temporary term removed`;
  }
  return redact(result!, secrets) as string;
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run') || process.env.DAY0_DRY_RUN === '1';
  const seed = 20261030;
  const config: DrillConfig = {
    tactics: ['linkscam', 'spam', 'botwave'], primaryTactic: 'linkscam', attackCount: 30, banterCount: 0,
    intervalMs: 1500, slipWindowMs: 9000, seed, simMod: false
  };
  const waveA = [
    ...buildWaveA(config, 'day0-a-1'),
    ...buildWaveA({ ...config, attackCount: 20, seed: seed + 1 }, 'day0-a-2')
  ].map((line, idx) => ({ ...line, id: `day0-A-${idx}`, wave: 'A' as const, idx }));
  const waveB = buildWaveB(config, 'day0', 50);
  console.log('| Step | Measure | Result | Notes |');
  console.log('|---|---|---|---|');
  row('1-2', 'Training and held-out waves', `${waveA.length} / ${waveB.length} attack lines`);

  let token = '';
  let clientId = '';
  let broadcasterId = '';
  let secrets: string[] = [];
  let terms = [...DEMO_TERMS];
  let chat: string[];
  if (dryRun) {
    chat = padChat(FIXTURE_CHAT).lines;
    row('2', 'Channel data', 'fixture-only dry run', 'No network requests made.');
  } else {
    token = process.env.DAY0_ACCESS_TOKEN ?? '';
    clientId = process.env.TWITCH_CLIENT_ID ?? '';
    broadcasterId = process.env.DAY0_BROADCASTER_ID ?? '';
    const chatFile = process.env.DAY0_CHAT_FILE ?? '';
    if (!token || !clientId || !broadcasterId || !chatFile) {
      throw new Error('Set DAY0_ACCESS_TOKEN, TWITCH_CLIENT_ID, DAY0_BROADCASTER_ID, and DAY0_CHAT_FILE.');
    }
    secrets = [token];
    const suppliedChat = (await readFile(chatFile, 'utf8')).split(/\r?\n/u);
    const padded = padChat(suppliedChat);
    chat = padded.lines;
    const broadcasterType = await getBroadcasterType(broadcasterId, token, clientId);
    const blockedTerms = await getBlockedTerms(broadcasterId, token, clientId);
    terms = blockedTerms.map((term) => term.text);
    row('2', 'Chat corpus', `${chat.length} lines`, `${padded.supplied} supplied; ${padded.fixture} padded from fixture chat.`);
    row('2', 'Broadcaster and current blocked terms', broadcasterType || 'normal', `${terms.length} public blocked terms`);
  }

  const clean = buildCleanIndex(chat);
  const passedA = waveA.filter((line) => blockedBy(terms, line.text) === null);
  const rules = findRules(passedA, clean);
  const proposed = rules.accepted.map((rule) => rule.term);
  const proof = proveOnFreshWave(waveB, terms, proposed, clean);
  const before = proof.total === 0 ? 0 : proof.blockedBefore / proof.total * 100;
  const after = proof.total === 0 ? 0 : proof.blockedAfter / proof.total * 100;
  row('3-4', 'Fresh-wave blocked before / after', `${before.toFixed(1)}% / ${after.toFixed(1)}%`, `${(after - before).toFixed(1)} points; ${proposed.length} proposed terms`);
  row('4', 'Real-chat matches', `${proof.realChat.reduce((sum, item) => sum + item.count, 0)}`, `${proof.realChat.length} proposals checked; zero required for push safety.`);

  if (dryRun) {
    row('5', 'Quota unit and batch size', 'not measured in dry run');
    row('5', 'Twitch/local agreement', 'not measured in dry run');
    row('6', `Two-word term ${TWO_WORD_TERM}`, 'not measured in dry run');
    return;
  }

  const broadcasterType = await getBroadcasterType(broadcasterId, token, clientId);
  const perMinute = perMinuteLimit[broadcasterType];
  const sample = waveB.slice(0, 20).map((line) => ({ msg_id: line.id, msg_text: line.text }));
  const sampleCall = await grade(sample, broadcasterId, token, clientId, secrets);
  const twitch = parseGrade(sampleCall);
  let agreed = 0;
  let compared = 0;
  if (twitch) {
    for (const line of sample) {
      const twitchPermitted = twitch.get(line.msg_id);
      if (twitchPermitted !== undefined) {
        compared++;
        if ((blockedBy(terms, line.msg_text) === null) === twitchPermitted) agreed++;
      }
    }
  }
  row('5', 'Twitch/local agreement on 20 lines', compared ? `${(agreed / compared * 100).toFixed(1)}% (${agreed}/${compared})` : 'unavailable', `HTTP ${sampleCall.status}; ${sampleCall.elapsedMs} ms; ${sampleCall.shape}`);
  const unit = await probeQuota(broadcasterId, token, clientId, perMinute, secrets);
  const batchSize = await measureBatchSize(broadcasterId, token, clientId, secrets, unit, perMinute);
  row('5', 'Quota unit', unit, '429 response headers, body, shape, and request timing appear in the probe table above.');
  row('5', 'Max accepted batch size', batchSize ? `${batchSize} lines observed` : 'not determined');
  row('5', 'Set deployment vars', `GRADING_QUOTA_UNIT=${unit}; GRADING_BATCH_SIZE=${batchSize || 'TODO'}`);
  const currentTerms = await getBlockedTerms(broadcasterId, token, clientId);
  const a01 = await testTwoWordTerm(broadcasterId, token, clientId, currentTerms, secrets);
  row('6', `Two-word term ${TWO_WORD_TERM}`, a01, `A-01 messages: ${A01_MESSAGES.join(' | ')}`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown day-0 failure.';
  console.error(redact(message, [process.env.DAY0_ACCESS_TOKEN ?? '']));
  process.exitCode = 1;
});
