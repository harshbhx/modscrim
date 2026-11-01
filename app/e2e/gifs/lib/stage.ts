import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';

/**
 * Helpers for the README GIF capture flows (project "gifs", run only by .github/workflows/gifs.yml).
 *
 * A flow records one Playwright video per browser context, with a visible cursor, click ripples,
 * key badges and short captions drawn on the page, plus a timeline of named marks. The converter
 * (scripts/gifs/build.mjs) cuts the video at those marks, as listed in app/e2e/gifs/manifest.json.
 * Nothing here touches the app's own files or styles; the cursor, ripple, key badge and caption
 * are neutral annotations added to the page only while recording.
 */

export const RAW_DIR = resolve('app/e2e/gifs/out/raw');
export const DEBUG_DIR = resolve('app/e2e/gifs/out/debug');

export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** Injected into every page of a recorded context. Fixed overlay, never receives pointer events. */
const ANNOTATION_SCRIPT = `
(() => {
  if (window.__gifAnnotations) return;
  window.__gifAnnotations = true;
  const css = [
    '#__gif-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;transition:transform 40ms linear;display:none}',
    '#__gif-cursor svg{width:22px;height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}',
    '.__gif-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #ffffff;box-shadow:0 0 0 2px rgba(20,20,24,.7);animation:__gif-ripple 520ms ease-out forwards}',
    '@keyframes __gif-ripple{from{transform:scale(.6);opacity:1}to{transform:scale(3.4);opacity:0}}',
    '#__gif-key{position:fixed;right:16px;top:16px;z-index:2147483647;pointer-events:none;min-width:44px;padding:8px 14px;border-radius:10px;background:rgba(20,20,24,.9);color:#fff;font:700 22px/1 ui-monospace,Menlo,Consolas,monospace;text-align:center;opacity:0;transition:opacity 120ms}',
    '#__gif-caption{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;max-width:86%;padding:10px 18px;border-radius:12px;background:rgba(20,20,24,.88);color:#fff;font:600 max(20px,1.5vw)/1.25 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;opacity:0;transition:opacity 180ms}'
  ].join('');
  const install = () => {
    if (document.getElementById('__gif-cursor')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__gif-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l17 8-7.5 2L9.5 20z" fill="#ffffff" stroke="#141418" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const key = document.createElement('div');
    key.id = '__gif-key';
    const caption = document.createElement('div');
    caption.id = '__gif-caption';
    caption.setAttribute('aria-hidden', 'true');
    document.documentElement.append(cursor, key, caption);
    let keyTimer = 0;
    addEventListener('mousemove', (event) => {
      cursor.style.display = 'block';
      cursor.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
    }, true);
    addEventListener('mousedown', (event) => {
      const ripple = document.createElement('div');
      ripple.className = '__gif-ripple';
      ripple.style.left = event.clientX + 'px';
      ripple.style.top = event.clientY + 'px';
      document.documentElement.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }, true);
    addEventListener('keydown', (event) => {
      if (event.key.length !== 1) return;
      key.textContent = event.key.toUpperCase();
      key.style.opacity = '1';
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => { key.style.opacity = '0'; }, 700);
    }, true);
    window.__gifCaption = (text) => {
      caption.textContent = text || '';
      caption.style.opacity = text ? '1' : '0';
    };
  };
  if (document.documentElement) install();
  else document.addEventListener('DOMContentLoaded', install);
})();
`;

export type Mark = { name: string; t: number };

/** Marks are milliseconds since the recording page was created, which is when its video starts. */
export class Timeline {
  readonly marks: Mark[] = [];
  private readonly t0 = Date.now();
  mark(name: string): void {
    this.marks.push({ name, t: Date.now() - this.t0 });
    console.log(`[gif] mark ${name} @ ${(Date.now() - this.t0) / 1000}s`);
  }
}

export type Recording = {
  context: BrowserContext;
  page: Page;
  timeline: Timeline;
  /** Close the context so the video is flushed, then write `<name>.webm` and `<name>.timeline.json`. */
  finish: () => Promise<void>;
  caption: (text: string) => Promise<void>;
};

export type RecordOptions = {
  name: string;
  width: number;
  height: number;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: 'reduce' | 'no-preference';
};

/** A fresh browser context that records video at exactly the requested size. */
export async function startRecording(browser: Browser, baseURL: string | undefined, opts: RecordOptions): Promise<Recording> {
  mkdirSync(RAW_DIR, { recursive: true });
  const dir = resolve(RAW_DIR, `.tmp-${opts.name}`);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
    colorScheme: opts.colorScheme ?? 'light',
    reducedMotion: opts.reducedMotion ?? 'no-preference',
    recordVideo: { dir, size: { width: opts.width, height: opts.height } }
  });
  await context.addInitScript(ANNOTATION_SCRIPT);
  const page = await context.newPage();
  const timeline = new Timeline();
  const caption = async (text: string): Promise<void> => {
    await page.evaluate((value) => {
      (window as unknown as { __gifCaption?: (text: string) => void }).__gifCaption?.(value);
    }, text).catch(() => undefined);
  };
  const finish = async (): Promise<void> => {
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(resolve(RAW_DIR, `${opts.name}.webm`));
    writeFileSync(resolve(RAW_DIR, `${opts.name}.timeline.json`), JSON.stringify({ name: opts.name, width: opts.width, height: opts.height, marks: timeline.marks }, null, 2));
    console.log(`[gif] saved ${opts.name}.webm with ${timeline.marks.length} marks`);
  };
  return { context, page, timeline, finish, caption };
}

/** Move the visible cursor to the middle of a locator in small steps, like a hand would. */
export async function glideTo(page: Page, target: Locator, opts: { steps?: number; settleMs?: number } = {}): Promise<void> {
  await target.scrollIntoViewIfNeeded({ timeout: 10_000 });
  const box = await target.boundingBox();
  if (!box) throw new Error('glideTo: target has no box');
  const x = box.x + Math.min(box.width / 2, 120);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: opts.steps ?? 28 });
  await sleep(opts.settleMs ?? 260);
}

/** Glide, pause, click, pause. */
export async function humanClick(page: Page, target: Locator, opts: { afterMs?: number } = {}): Promise<void> {
  await glideTo(page, target);
  await target.click({ timeout: 10_000 });
  await sleep(opts.afterMs ?? 500);
}

/** Type with a per-key delay so the field visibly fills in. */
export async function humanType(page: Page, target: Locator, text: string): Promise<void> {
  await glideTo(page, target);
  await target.click({ timeout: 10_000 });
  await target.pressSequentially(text, { delay: 110 });
  await sleep(400);
}

/** Smooth scroll with the wheel in small increments. */
export async function slowScroll(page: Page, totalPx: number, steps = 14, stepMs = 70): Promise<void> {
  const each = totalPx / steps;
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, each);
    await sleep(stepMs);
  }
}

/**
 * Run one step of a flow. A step that cannot find its target logs, keeps a screenshot for debugging and
 * returns false, so a UI that changed shape degrades the GIF instead of hiding every later frame.
 * `critical` steps throw instead, because nothing after them can work.
 */
export async function step(page: Page, label: string, fn: () => Promise<void>, opts: { critical?: boolean } = {}): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.log(`[gif] STEP FAILED: ${label}: ${message}`);
    try {
      mkdirSync(DEBUG_DIR, { recursive: true });
      await page.screenshot({ path: resolve(DEBUG_DIR, `${label.replace(/[^\w-]+/g, '_')}.png`) });
    } catch {
      /* the page may be gone */
    }
    if (opts.critical) throw error;
    return false;
  }
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}
