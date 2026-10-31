// T-44 (#48): browser-driven end-to-end check for the public demo loop.
// Usage: node scripts/demo-e2e.mjs [base-url]
import { chromium } from 'playwright';

const baseUrl = (process.argv[2] ?? process.env.DEMO_BASE_URL ?? 'https://app.modscrim.dualmindlab.tech').replace(/\/$/, '');
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

async function request(path, options = {}) {
  const response = await page.evaluate(async ({ path: requestPath, method, data }) => {
    const result = await fetch(requestPath, {
      method,
      credentials: 'same-origin',
      ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    });
    return { status: result.status, body: await result.text() };
  }, { path, method: options.method ?? 'GET', data: options.data });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${response.body}`);
  }
  return JSON.parse(response.body);
}

try {
  const startedAt = Date.now();
  await page.goto(`${baseUrl}/demo`, { waitUntil: 'domcontentloaded' });

  const created = await request('/api/demo', { method: 'POST', data: {} });
  if (typeof created.room !== 'string' || typeof created.joinCode !== 'string') {
    throw new Error('Demo creation did not return a room and join code.');
  }

  const roomPath = `/api/demo/${encodeURIComponent(created.room)}`;
  const draft = await request(`${roomPath}/drills`, {
    method: 'POST',
    data: {
      tactics: ['linkscam'],
      primaryTactic: 'linkscam',
      attackCount: 6,
      banterCount: 4,
      intervalMs: 800,
      slipWindowMs: 10000,
      simMod: false
    }
  });

  const joined = await request(`${roomPath}/mod/join`, {
    method: 'POST',
    data: { code: draft.joinCode, displayName: 'Playwright mod' }
  });
  if (typeof joined.wsUrl !== 'string' || typeof joined.participantToken !== 'string') {
    throw new Error('Moderator join did not return a socket URL and participant token.');
  }

  const socketUrl = new URL(joined.wsUrl);
  await page.evaluate(async (url) => {
    const socket = new WebSocket(url);
    window.__demoSocket = socket;
    window.__demoMessages = [];
    socket.addEventListener('message', (event) => window.__demoMessages.push(JSON.parse(String(event.data))));
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out connecting the demo moderator.')), 15000);
      socket.addEventListener('open', () => { window.clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('Demo moderator socket failed.')); }, { once: true });
    });
  }, socketUrl.toString());

  await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/start`, { method: 'POST', data: {} });
  const socketResult = await page.evaluate(async () => {
    const socket = window.__demoSocket;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out waiting for demo chat lines.')), 30000);
      let actionSent = false;
      const observe = () => {
        const line = window.__demoMessages.find((message) => message.type === 'drill.line');
        if (line && !actionSent) {
          actionSent = true;
          socket.send(JSON.stringify({ type: 'mod.action', data: { lineId: line.data.line.lineId, action: 'delete' } }));
        }
        if (window.__demoMessages.some((message) => message.type === 'drill.action')) {
          window.clearTimeout(timeout);
          socket.removeEventListener('message', observe);
          resolve();
        }
      };
      socket.addEventListener('message', observe);
      observe();
    });
    socket.close();
    return window.__demoMessages.map((message) => message.type);
  });
  if (!socketResult.includes('drill.line') || !socketResult.includes('drill.action')) {
    throw new Error('Moderator did not receive a line and action acknowledgement.');
  }

  await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/stop`, { method: 'POST', data: {} });
  const grade = await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/grade/local`, { method: 'POST', data: { phase: 'A' } });
  if (grade.engine !== 'local' || grade.total < 1) throw new Error('The demo drill was not graded with the local estimate.');
  const rules = await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/rules`, { method: 'POST', data: {} });
  const proposed = rules.accepted?.slice(0, 1).map((rule) => rule.term) ?? [];
  if (proposed.length === 0) throw new Error('The demo rule finder returned no safe term to prove.');
  const proof = await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/prove`, { method: 'POST', data: { terms: proposed } });
  if (!proof.pushAllowed || proof.realChat.some((match) => match.count !== 0)) {
    throw new Error('The selected demo term did not pass the fresh-wave safety proof.');
  }
  const pushed = await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/push`, { method: 'POST', data: { terms: proposed } });
  if (!pushed.some((result) => result.status === 'added')) throw new Error('The demo push was not simulated.');
  const undone = await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/undo`, { method: 'POST', data: {} });
  if (!undone.some((result) => result.status === 'removed')) throw new Error('The simulated demo push was not undone.');
  const report = await request(`${roomPath}/drills/${encodeURIComponent(draft.drillId)}/report`);
  if (!report || report.drillId !== draft.drillId || !report.grading.some((phase) => phase.engine === 'local') || !report.proof || !report.rules || !report.pushes.some((result) => result.status === 'removed')) {
    throw new Error('The finished demo report did not contain the expected loop results.');
  }
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 120000) throw new Error(`The demo loop took ${elapsedMs} ms; M-05 requires under 120000 ms.`);

  console.log(JSON.stringify({ room: created.room, drillId: draft.drillId, actionsReceived: socketResult.includes('drill.action'), report: 'available', elapsedMs }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
