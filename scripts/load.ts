const { performance } = require('node:perf_hooks');
const { z } = require('zod');

const BASE_URL = new URL(process.env.LOAD_BASE_URL ?? 'https://app.modscrim.dualmindlab.tech');
const API = `${BASE_URL.origin}/api`;
const MOD_COUNT = 10;
const ACTION_COUNT = 50;
const INTERVAL_MS = 1500;
const FIRST_DRILL_CONFIG = {
  tactics: ['linkscam', 'spam', 'botwave'],
  primaryTactic: 'linkscam',
  attackCount: 30,
  banterCount: 10,
  intervalMs: INTERVAL_MS,
  slipWindowMs: 9000,
  seed: 20261031,
  simMod: false
};
const SECOND_DRILL_CONFIG = {
  ...FIRST_DRILL_CONFIG,
  attackCount: 6,
  banterCount: 4,
  seed: 20261101
};

const DemoResponseZ = z.object({ room: z.string().uuid(), joinCode: z.string().regex(/^\d{6}$/) });
const DrillResponseZ = z.object({ drillId: z.string().min(1), joinCode: z.string().regex(/^\d{6}$/) });
const JoinResponseZ = z.object({
  participantId: z.string().min(1),
  participantToken: z.string().min(1),
  ticket: z.string().min(1),
  wsUrl: z.string().url()
});
const SocketEnvelopeZ = z.object({ type: z.string(), data: z.unknown() });
const LineMessageZ = z.object({ line: z.object({ lineId: z.string().min(1) }) });
const ActionMessageZ = z.object({ lineId: z.string().min(1) });

function parseResponse(schema, value, label) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid ${label} response from the Worker.`);
  return parsed.data;
}

async function post(path, body, cookie) {
  const headers = {
    Origin: BASE_URL.origin,
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {})
  };
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`POST ${path} returned HTTP ${response.status}.`);
  return response;
}

async function postJson(path, body, cookie) {
  const response = await post(path, body, cookie);
  return response.json();
}

function demoCookie(response) {
  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie?.split(';', 1)[0];
  if (!cookie) throw new Error('The Worker did not create a demo session cookie.');
  return cookie;
}

function percentile(samples, fraction) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? null;
}

function printMetric(label, samples) {
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const maximum = samples.length === 0 ? null : Math.max(...samples);
  const values = (value) => value === null ? 'n/a' : `${value.toFixed(1)} ms`;
  console.log(`${label}: p50 ${values(p50)}, p95 ${values(p95)}, max ${values(maximum)} (n=${samples.length})`);
}

function messageData(schema, value) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function connectMod(join, index, tracker) {
  const socket = new WebSocket(join.wsUrl);
  const client = { index, socket, ready: null };
  const heartbeat = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send('ping');
  }, 20000);
  client.ready = new Promise((resolve, reject) => {
    let welcomed = false;
    const timeout = setTimeout(() => reject(new Error(`Mod socket ${index + 1} did not become ready.`)), 15000);
    socket.addEventListener('message', (event) => {
      let raw;
      try {
        raw = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const envelope = SocketEnvelopeZ.safeParse(raw);
      if (!envelope.success) return;
      const { type, data } = envelope.data;

      if (type === 'hello' && !welcomed) {
        welcomed = true;
        clearTimeout(timeout);
        resolve();
      }

      if (type === 'drill.line' && tracker.activeRound) {
        const line = messageData(LineMessageZ, data);
        if (!line) return;
        tracker.recordLine(client, line.line.lineId);
      }

      if (type === 'drill.action') {
        const action = messageData(ActionMessageZ, data);
        if (action) tracker.recordAction(client, action.lineId);
      }

      if (type === 'action.rejected') {
        const rejected = messageData(ActionMessageZ, data);
        if (rejected) tracker.recordRejected(client, rejected.lineId);
      }

      if (type === 'drill.ended' && tracker.activeRound) tracker.finishRound();
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      if (!welcomed) reject(new Error(`Mod socket ${index + 1} failed to connect.`));
    });
    socket.addEventListener('close', () => {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (!welcomed) reject(new Error(`Mod socket ${index + 1} closed before joining.`));
    });
  });
  return client;
}

function createTracker() {
  const tracker = {
    clients: [],
    activeRound: null,
    actionSamples: [],
    lineSpreads: [],
    scheduledActions: 0,
    beginRound() {
      let finish;
      const ended = new Promise((resolve) => { finish = resolve; });
      this.activeRound = {
        ended,
        finish,
        receipts: new Map(),
        spreadRecorded: new Set(),
        actionTargets: new Map(),
        sentActions: new Set()
      };
      return ended;
    },
    recordLine(client, lineId) {
      const round = this.activeRound;
      if (!round) return;

      let receipts = round.receipts.get(lineId);
      if (!receipts) {
        receipts = new Map();
        round.receipts.set(lineId, receipts);
      }
      if (!receipts.has(client.index)) receipts.set(client.index, performance.now());
      if (receipts.size === this.clients.length && !round.spreadRecorded.has(lineId)) {
        round.spreadRecorded.add(lineId);
        const times = [...receipts.values()];
        this.lineSpreads.push(Math.max(...times) - Math.min(...times));
      }

      if (!round.actionTargets.has(lineId) && this.scheduledActions < ACTION_COUNT) {
        round.actionTargets.set(lineId, this.scheduledActions % this.clients.length);
        this.scheduledActions++;
      }
      if (round.actionTargets.get(lineId) !== client.index || round.sentActions.has(lineId)) return;
      round.sentActions.add(lineId);
      tracker.pendingActions.set(lineId, { clientIndex: client.index, sentAt: performance.now() });
      client.socket.send(JSON.stringify({ type: 'mod.action', data: { lineId, action: 'delete' } }));
    },
    recordAction(client, lineId) {
      const pending = tracker.pendingActions.get(lineId);
      if (!pending || pending.clientIndex !== client.index) return;
      this.actionSamples.push(performance.now() - pending.sentAt);
      tracker.pendingActions.delete(lineId);
    },
    recordRejected(client, lineId) {
      const pending = tracker.pendingActions.get(lineId);
      if (!pending || pending.clientIndex !== client.index) return;
      tracker.pendingActions.delete(lineId);
      tracker.actionFailures++;
    },
    finishRound() {
      this.activeRound?.finish();
    },
    pendingActions: new Map(),
    actionFailures: 0
  };
  return tracker;
}

async function runRound(room, cookie, drillId) {
  const ended = tracker.beginRound();
  await postJson(`/demo/${room}/drills/${encodeURIComponent(drillId)}/start`, {}, cookie);
  let timeout;
  try {
    await Promise.race([
      ended,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('drill_timeout')), 120000);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const tracker = createTracker();

async function run() {
  if (BASE_URL.protocol !== 'https:' && BASE_URL.hostname !== 'localhost' && BASE_URL.hostname !== '127.0.0.1') {
    throw new Error('LOAD_BASE_URL must use HTTPS outside localhost.');
  }

  const createResponse = await post('/demo', {});
  const cookie = demoCookie(createResponse);
  const created = parseResponse(DemoResponseZ, await createResponse.json(), 'demo');
  const room = encodeURIComponent(created.room);
  const first = parseResponse(
    DrillResponseZ,
    await postJson(`/demo/${room}/drills`, FIRST_DRILL_CONFIG, cookie),
    'drill'
  );
  const patched = await postJson(`/demo/${room}/drills/${encodeURIComponent(first.drillId)}`, FIRST_DRILL_CONFIG, cookie);
  if (!patched || typeof patched !== 'object') throw new Error('The Worker did not accept the load drill configuration.');

  const clients = [];
  tracker.clients = clients;
  for (let index = 0; index < MOD_COUNT; index++) {
    const joined = parseResponse(
      JoinResponseZ,
      await postJson(`/demo/${room}/mod/join`, { code: first.joinCode, displayName: `Load Mod ${index + 1}` }),
      'mod join'
    );
    clients.push(connectMod(joined, index, tracker));
  }
  await Promise.all(clients.map((client) => client.ready));

  console.log(`Load room: ${created.room}`);
  console.log(`Connected clients: ${MOD_COUNT} mods, 0 overlays (overlay sockets skipped).`);
  await runRound(room, cookie, first.drillId);
  const second = parseResponse(
    DrillResponseZ,
    await postJson(`/demo/${room}/drills`, SECOND_DRILL_CONFIG, cookie),
    'drill'
  );
  await runRound(room, cookie, second.drillId);

  if (tracker.actionSamples.length !== ACTION_COUNT) {
    throw new Error(`Recorded ${tracker.actionSamples.length} of ${ACTION_COUNT} successful action round trips.`);
  }
  console.log(`drill.line spread across ${MOD_COUNT} mod sockets:`);
  printMetric('NFR-01 spread', tracker.lineSpreads);
  console.log('Action round trip (send to own socket update):');
  printMetric('NFR-03 round trip', tracker.actionSamples);
  console.log(`Targets: NFR-01 < 300 ms p95; NFR-03 < 250 ms p95; rejected actions ${tracker.actionFailures}.`);
}

run().catch(() => {
  console.error('Load run failed. Check LOAD_BASE_URL, demo availability, and the Worker connection.');
  process.exitCode = 1;
}).finally(() => {
  for (const client of tracker.clients) {
    try {
      client.socket.close(1000, 'load complete');
    } catch {
      // A socket may already be closed after a failed run.
    }
  }
});

