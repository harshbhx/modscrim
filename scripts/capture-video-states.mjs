// Capture every demo-room screen state for the ModScrim video, with no Twitch login.
//
// One run drives four browsers against a local (or deployed) ModScrim:
//   console  - the streamer console, 1920x1080, every step from landing to undo
//   harsh    - Harsh's phone (390x844 @3x), joins with the code, clears attacks, makes one false ban
//   dhairya  - Dhairya's laptop, joins with the code, clears attack lines on his own
//   overlay  - the OBS overlay for the same demo room, transparent stills + a video on a plain backdrop
//
// Everything shown is a real demo room: fixture chat, Kai (sim), local estimate, simulated push.
// Nothing here calls Twitch and nothing here produces a "graded by Twitch" number.
//
// Usage:  node scripts/capture-video-states.mjs [baseUrl] [outDir]
//   baseUrl defaults to http://localhost:5173 (run `npm run dev` first)
//   outDir  defaults to ./video-capture
// Demo rooms are rate limited to 5 a minute per IP, so do not loop this.

import { chromium } from 'playwright';
import { mkdir, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const OUT = path.resolve(process.argv[3] ?? 'video-capture');
const SHOTS = path.join(OUT, 'stills');
const DOM = path.join(OUT, 'dom');
const CLIPS = path.join(OUT, 'clips');
const HARSH = 'Harsh';
const DHAIRYA = 'Dhairya';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const shotIndex = { n: 0 };

// A visible cursor and tap ripple, because recorded headless video has no pointer.
const CURSOR_SCRIPT = ({ touch }) => {
  const install = () => {
    if (document.getElementById('__capture_cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__capture_cursor{position:fixed;left:0;top:0;width:${touch ? 44 : 22}px;height:${touch ? 44 : 22}px;margin:${touch ? -22 : -3}px 0 0 ${touch ? -22 : -3}px;
        pointer-events:none;z-index:2147483647;transition:transform .08s ease-out;opacity:${touch ? 0 : 1}}
      #__capture_cursor svg{width:100%;height:100%;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
      #__capture_cursor.touch{border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.9)}
      .__capture_ripple{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;pointer-events:none;z-index:2147483646;
        border:3px solid #ff9a3c;animation:__ripple .55s ease-out forwards}
      @keyframes __ripple{to{transform:scale(4.2);opacity:0}}`;
    document.documentElement.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__capture_cursor';
    if (touch) cursor.className = 'touch';
    else cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    window.addEventListener('mousemove', (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, true);
    window.addEventListener('mousedown', (event) => {
      cursor.style.transform = 'scale(.85)';
      if (touch) { cursor.style.opacity = '1'; setTimeout(() => { cursor.style.opacity = '0'; }, 380); }
      const ripple = document.createElement('div');
      ripple.className = '__capture_ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.documentElement.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }, true);
    window.addEventListener('mouseup', () => { cursor.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

async function shot(page, name, options = {}) {
  shotIndex.n += 1;
  const file = path.join(SHOTS, `${String(shotIndex.n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, ...options });
  // The live markup at this state, so a film can rebuild the real UI instead of using a picture.
  const html = await page.evaluate(() => document.querySelector('#root')?.innerHTML ?? '');
  await writeFile(path.join(DOM, `${String(shotIndex.n).padStart(2, '0')}-${name}.html`), html);
  log('still', path.basename(file));
  return file;
}

/** The page's own CSS with every rule scoped under one class, so lifted UI cannot restyle anything else. */
async function dumpCss(page, name, scopeClass) {
  const css = await page.evaluate((pre) => {
    const out = [];
    const scopeSel = (sel) => sel.split(',').map((s) => {
      s = s.trim();
      if (/^(html|body|:root)$/.test(s)) return pre;
      if (/^(html|body|:root)[\s.:#\[>]/.test(s)) return pre + s.replace(/^(html|body|:root)/, '');
      return pre + ' ' + s;
    }).join(', ');
    const walk = (rules, into) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) into.push(scopeSel(r.selectorText) + ' { ' + r.style.cssText + ' }');
        else if (r instanceof CSSMediaRule) { const inner = []; walk(r.cssRules, inner); if (inner.length) into.push('@media ' + r.conditionText + ' { ' + inner.join('\n') + ' }'); }
        else if (r instanceof CSSSupportsRule) { const inner = []; walk(r.cssRules, inner); if (inner.length) into.push('@supports ' + r.conditionText + ' { ' + inner.join('\n') + ' }'); }
      }
    };
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, out); } catch {} }
    return out.join('\n');
  }, '.' + scopeClass);
  await writeFile(path.join(DOM, name + '.css'), css);
  log('css', name, css.length);
}

/** Glide the cursor to an element and click it, so the recording shows the action. */
/** A transparent overlay still: drop the backdrop for one frame, then put it back for the video. */
async function overlayShot(page, name) {
  await page.evaluate(() => document.documentElement.classList.remove('__bd'));
  const file = await shot(page, name, { omitBackground: true });
  await page.evaluate(() => document.documentElement.classList.add('__bd'));
  return file;
}

async function glideClick(page, locator, { pauseBefore = 350, pauseAfter = 700 } = {}) {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('No box for click target');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 28 });
  await sleep(pauseBefore);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await sleep(pauseAfter);
}

async function typeSlow(page, locator, text) {
  await glideClick(page, locator, { pauseAfter: 150 });
  await locator.fill('');
  await page.keyboard.type(text, { delay: 110 });
}

/** Walk any JSON value and remember the newest drill config seen (drillId + config with a seed). */
function collectDraft(value, state) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) collectDraft(item, state); return; }
  if (typeof value.drillId === 'string' && value.config && typeof value.config.seed === 'number') {
    state.drillId = value.drillId;
    state.config = value.config;
  }
  for (const child of Object.values(value)) collectDraft(child, state);
}

/**
 * Wave A is deterministic: buildWaveA(config, drillId) in @mfd/core gives the same lines the room plays,
 * with their kind. Bundle the TypeScript source once with rolldown (already a dependency) and import it,
 * so Harsh and Dhairya know which lines are attacks. The mod view itself never reveals this.
 */
async function loadWaveBuilder(outDir) {
  const { rolldown } = await import('rolldown');
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const bundle = await rolldown({ input: path.join(repo, 'packages/core/src/waves.ts'), platform: 'node', logLevel: 'silent' });
  const file = path.join(outDir, 'waves.bundle.mjs');
  await bundle.write({ file, format: 'esm' });
  await bundle.close();
  return (await import(file)).buildWaveA;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(DOM, { recursive: true });
  await mkdir(CLIPS, { recursive: true });
  // CHROME_PATH lets you point at any installed Chromium when Playwright's own build is missing.
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const kinds = new Map();
  const draftState = { drillId: null, config: null };
  const buildWaveA = await loadWaveBuilder(OUT);
  let room = null;
  let joinCode = null;
  let overlayKey = null;

  // Console: 1280x720 CSS at 1.5x, so stills are 1920x1080 and text reads like 150% zoom.
  const consoleCtx = await browser.newContext({
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'dark',
    recordVideo: { dir: CLIPS, size: { width: 1920, height: 1080 } }
  });
  await consoleCtx.addInitScript(CURSOR_SCRIPT, { touch: false });
  const consolePage = await consoleCtx.newPage();
  consolePage.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    try {
      const body = await response.json();
      if (body?.room) room = body.room;
      if (body?.joinCode) joinCode = body.joinCode;
      if (body?.overlayKey) overlayKey = body.overlayKey;
      collectDraft(body, draftState);
    } catch { /* not JSON */ }
  });
  consolePage.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      try { collectDraft(JSON.parse(String(payload)), draftState); } catch { /* binary or non-JSON */ }
    });
  });

  // 1. Landing.
  log('landing');
  await consolePage.goto(`${BASE}/`);
  await consolePage.getByRole('heading', { name: /Raid drills for your mod team/ }).first().waitFor();
  await consolePage.mouse.move(640, 600);
  await sleep(1800);
  await shot(consolePage, 'landing');
  await consolePage.mouse.wheel(0, 650);
  await sleep(1400);
  await shot(consolePage, 'landing-scrolled');
  await consolePage.mouse.wheel(0, -650);
  await sleep(900);

  // 2. Demo start page.
  await glideClick(consolePage, consolePage.getByRole('link', { name: /Try the demo/i }).first());
  await consolePage.getByRole('button', { name: /Start a demo drill/i }).waitFor();
  await sleep(1400);
  await shot(consolePage, 'demo-start');
  await glideClick(consolePage, consolePage.getByRole('button', { name: /Start a demo drill/i }));

  // 3. Console step 1: Read filters.
  await consolePage.waitForURL(/\/demo\/[^/]+$/);
  await consolePage.getByRole('button', { name: 'Continue to configure' }).waitFor();
  if (!room) room = decodeURIComponent(new URL(consolePage.url()).pathname.split('/')[2]);
  await sleep(2000);
  await shot(consolePage, 'console-step1-read-filters');
  await dumpCss(consolePage, 'app', 'ms-ui');
  await consolePage.mouse.wheel(0, 500);
  await sleep(1200);
  await shot(consolePage, 'console-step1-filters-detail');
  await consolePage.mouse.wheel(0, -500);
  await sleep(600);

  // 4. Step 2: Configure. A draft (and its join code) exists from here.
  await glideClick(consolePage, consolePage.getByRole('button', { name: 'Continue to configure' }));
  await consolePage.getByRole('heading', { name: 'Configure' }).waitFor();
  await sleep(1500);
  if (!joinCode) {
    const text = await consolePage.locator('body').innerText();
    joinCode = text.match(/\b\d{6}\b/)?.[0] ?? null;
  }
  if (!joinCode) throw new Error('No join code found on the console');
  log('room', room, 'join code', joinCode);
  await shot(consolePage, 'console-step2-configure');

  // 5. Overlay: same room, real overlay page. The overlay page asks the API for a channel and opens
  //    /ws/ch/<id>; for a demo room we answer the channel lookup locally and point the socket at /ws/demo/<room>.
  const overlayCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
    recordVideo: { dir: CLIPS, size: { width: 1920, height: 1080 } }
  });
  const overlayPage = await overlayCtx.newPage();
  await overlayPage.route('**/api/public/channel/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ broadcasterId: room, displayName: 'Pixel Panda (demo)', avatarUrl: null, drillOpen: true })
  }));
  await overlayPage.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url, protocols) { super(String(url).replace('/ws/ch/', '/ws/demo/'), protocols); }
    };
  });
  if (overlayKey) {
    await overlayPage.goto(`${BASE}/overlay/pixelpanda_tv?key=${encodeURIComponent(overlayKey)}`);
    // A plain dark backdrop for the video copy only; the stills drop it and keep a transparent background.
    await overlayPage.addStyleTag({ content: 'html.__bd,html.__bd body,html.__bd #root{background:radial-gradient(1200px 700px at 30% 40%,#1d2b3a,#0b0f16 70%) fixed!important}' });
    await overlayPage.evaluate(() => document.documentElement.classList.add('__bd'));
  } else {
    log('no overlay key returned; skipping overlay');
  }

  // 6. Harsh joins on a phone, on camera.
  const harshCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark',
    recordVideo: { dir: CLIPS, size: { width: 780, height: 1688 } }
  });
  await harshCtx.addInitScript(CURSOR_SCRIPT, { touch: true });
  const harsh = await harshCtx.newPage();
  await harsh.goto(`${BASE}/demo/${encodeURIComponent(room)}/mod`);
  await harsh.getByLabel('6-digit code').waitFor();
  await sleep(1200);
  await shot(harsh, 'harsh-phone-join-empty');
  await typeSlow(harsh, harsh.getByLabel('6-digit code'), joinCode);
  await typeSlow(harsh, harsh.getByLabel('Display name'), HARSH);
  await sleep(500);
  await shot(harsh, 'harsh-phone-join-filled');
  await glideClick(harsh, harsh.getByRole('button', { name: 'Join' }));
  await harsh.getByRole('heading', { name: /Practice room|Moderator console|pixelpanda|Pixel Panda/i }).first().waitFor({ timeout: 15_000 }).catch(() => {});
  await sleep(1500);
  await shot(harsh, 'harsh-phone-waiting');

  // 7. Dhairya joins from a laptop (off camera, he acts on his own).
  const dhairyaCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const dhairya = await dhairyaCtx.newPage();
  await dhairya.goto(`${BASE}/demo/${encodeURIComponent(room)}/mod`);
  await dhairya.getByLabel('6-digit code').fill(joinCode);
  await dhairya.getByLabel('Display name').fill(DHAIRYA);
  await dhairya.getByRole('button', { name: 'Join' }).click();
  await sleep(2500);
  await shot(consolePage, 'console-step2-team-joined');

  // 8. Start the drill.
  await glideClick(consolePage, consolePage.getByRole('button', { name: 'Start drill' }));
  await consolePage.getByRole('heading', { name: 'Run the drill' }).waitFor();
  const drillStart = Date.now();
  if (draftState.drillId && draftState.config) {
    for (const line of buildWaveA(draftState.config, draftState.drillId)) kinds.set(line.id, line.kind);
  }
  log('drill running', draftState.drillId, `${kinds.size} known lines`);
  if (kinds.size === 0) log('warning: drill config not seen, mods will not act');

  // Mod behaviour. Harsh: fast on attacks, one deliberate false ban on a regular around 10 s.
  // Dhairya: steady on attacks, a little slower. Kai (sim) plays itself.
  const acted = new Set();
  let harshFalseBanDone = false;
  let harshFalseBanShot = false;
  async function actOn(page, who, { falseBan }) {
    const lines = await page.locator('button[data-line-id][aria-label^="Delete"]:not([disabled])').all();
    for (const button of lines) {
      const id = await button.getAttribute('data-line-id');
      if (!id || acted.has(id)) continue;
      const kind = kinds.get(id);
      if (falseBan && kind === 'banter') {
        acted.add(id);
        const ban = page.locator(`button[data-line-id="${id}"][aria-label^="Ban"]`);
        if (who === HARSH) await glideClick(page, ban, { pauseAfter: 200 }); else await ban.click();
        return 'falseBan';
      }
      if (kind !== 'attack') continue;
      acted.add(id);
      if (who === HARSH) await glideClick(page, button, { pauseBefore: 250, pauseAfter: 150 });
      else await button.click().catch(() => {});
      return 'attack';
    }
    return null;
  }
  let consoleRunShots = 0;
  while (Date.now() - drillStart < 48_000) {
    const elapsed = Date.now() - drillStart;
    if (kinds.size === 0 && draftState.drillId && draftState.config) {
      for (const line of buildWaveA(draftState.config, draftState.drillId)) kinds.set(line.id, line.kind);
      log(`${kinds.size} known lines`);
    }
    const harshTurn = Math.floor(elapsed / 1000) % 3 !== 2; // Harsh acts 2 seconds in 3
    if (harshTurn) {
      const result = await actOn(harsh, HARSH, { falseBan: !harshFalseBanDone && elapsed > 10_000 }).catch(() => null);
      if (result === 'falseBan') {
        harshFalseBanDone = true;
        await sleep(350);
        await shot(harsh, 'harsh-phone-false-ban');
        harshFalseBanShot = true;
      }
    } else {
      await actOn(dhairya, DHAIRYA, { falseBan: false }).catch(() => null);
    }
    if (elapsed > 8_000 && consoleRunShots === 0) { consoleRunShots++; await shot(consolePage, 'console-step3-drill-running'); await shot(harsh, 'harsh-phone-drill'); if (overlayKey) await overlayShot(overlayPage, 'overlay-drill-running-transparent'); }
    if (elapsed > 20_000 && consoleRunShots === 1) { consoleRunShots++; await consolePage.getByText(/Team scoreboard/i).first().evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {}); await sleep(300); await shot(consolePage, 'console-step3-scoreboard'); if (overlayKey) await overlayShot(overlayPage, 'overlay-scoreboard-transparent'); }
    if (elapsed > 30_000 && consoleRunShots === 2) { consoleRunShots++; await shot(harsh, 'harsh-phone-busy'); }
    const ended = await consolePage.getByRole('heading', { name: 'Drill complete' }).isVisible().catch(() => false);
    if (ended) break;
    await sleep(700 + Math.random() * 600);
  }
  if (!harshFalseBanShot) log('warning: no banter line reached Harsh for the false-ban shot');

  // 9. End the drill if it is still running.
  const stop = consolePage.getByRole('button', { name: 'Stop' });
  if (await stop.isVisible().catch(() => false)) await glideClick(consolePage, stop);
  await consolePage.getByRole('heading', { name: 'Drill complete' }).waitFor({ timeout: 30_000 });
  await sleep(1800);
  await shot(consolePage, 'console-drill-complete');
  await shot(harsh, 'harsh-phone-result');
  if (overlayKey) { await sleep(800); await overlayShot(overlayPage, 'overlay-report-transparent'); }

  // 10. Step 4: local estimate (demo rooms never call Twitch).
  await glideClick(consolePage, consolePage.getByRole('button', { name: 'Continue to local estimate' }));
  await consolePage.getByRole('heading', { name: 'Local filter estimate' }).waitFor();
  await sleep(1200);
  await glideClick(consolePage, consolePage.getByRole('button', { name: 'Run local estimate' }));
  await consolePage.getByRole('button', { name: 'Find better rules' }).waitFor({ state: 'visible' });
  await sleep(2400);
  await shot(consolePage, 'console-step4-grade-local-estimate');

  // 11. Step 5: Fix the rules.
  await glideClick(consolePage, consolePage.getByRole('button', { name: 'Find better rules' }));
  const selected = consolePage.getByRole('heading', { name: /Selected terms \([1-9]\d*\)/ });
  await selected.waitFor();
  await selected.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  await sleep(2200);
  await shot(consolePage, 'console-step5-selected-terms');
  const rejected = consolePage.getByText(/but also matches/).first();
  if (await rejected.isVisible().catch(() => false)) {
    await rejected.scrollIntoViewIfNeeded();
    await sleep(1400);
    await shot(consolePage, 'console-step5-rejected-term');
  }

  // 12. Step 6: fresh wave, simulated push, undo.
  await glideClick(consolePage, consolePage.getByRole('button', { name: 'Test on a fresh wave' }));
  await consolePage.getByRole('heading', { name: 'Fresh wave and simulated push' }).waitFor();
  await consolePage.getByText(/0 real-chat matches/).first().waitFor();
  const centre = (locator) => locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await centre(consolePage.getByRole('heading', { name: 'Fresh wave and simulated push' }));
  await sleep(1600);
  await shot(consolePage, 'console-step6-fresh-wave');
  await centre(consolePage.locator('.console-proof-safe').first());
  await sleep(1600);
  await shot(consolePage, 'console-step6-zero-real-chat-matches');
  const pushButton = consolePage.getByRole('button', { name: /Simulate push of \d+ terms/ });
  await centre(pushButton);
  await sleep(1000);
  await glideClick(consolePage, pushButton);
  await consolePage.getByText('Added to this demo only', { exact: true }).first().waitFor();
  await centre(consolePage.getByText('Added to this demo only', { exact: true }).first());
  await sleep(1800);
  await shot(consolePage, 'console-step6-pushed');
  const undo = consolePage.getByRole('button', { name: 'Undo simulated push' });
  await centre(undo);
  await sleep(800);
  await glideClick(consolePage, undo);
  await consolePage.getByText('Removed from this demo', { exact: true }).first().waitFor();
  await centre(consolePage.getByText('Removed from this demo', { exact: true }).first());
  await sleep(1800);
  await shot(consolePage, 'console-step6-undone');
  const summary = consolePage.getByRole('heading', { name: 'Drill summary' });
  if (await summary.isVisible().catch(() => false)) {
    await summary.scrollIntoViewIfNeeded();
    await sleep(1600);
    await shot(consolePage, 'console-drill-summary');
  }
  await sleep(1500);

  // 13. Close and name the clips.
  const named = [
    [consolePage, 'console-full-run'],
    [harsh, 'harsh-phone-full-run'],
    ...(overlayKey ? [[overlayPage, 'overlay-full-run']] : [])
  ];
  const videos = named.map(([page, name]) => [page.video(), name]);
  await consoleCtx.close();
  await harshCtx.close();
  await overlayCtx.close();
  await dhairyaCtx.close();
  for (const [video, name] of videos) {
    if (!video) continue;
    const from = await video.path();
    await rename(from, path.join(CLIPS, `${name}.webm`));
  }
  await browser.close();
  const manifest = {
    capturedAt: new Date().toISOString(), base: BASE, room, mods: [HARSH, DHAIRYA, 'Kai (sim)'],
    note: 'Demo room: fixture chat, local estimate, simulated push. No Twitch calls. Do not present these numbers as graded by Twitch.',
    stills: (await readdir(SHOTS)).sort(), clips: (await readdir(CLIPS)).sort()
  };
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  log('done', OUT);
}

main().catch((error) => { console.error(error); process.exit(1); });
