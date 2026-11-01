import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

/**
 * Cheap, dependency-free accessibility and responsiveness audit (T-137). It is
 * Playwright built-ins only: page.evaluate for the DOM checks and the keyboard
 * for focus. No axe, no new package. It checks what a screenshot cannot:
 *
 *   overflow     no sideways scroll
 *   target-size  every visible control is at least 44 x 44 CSS px
 *                (inline links inside a sentence are exempt, as in WCAG 2.5.8)
 *   name         every control has an accessible name (icon-only buttons, chips)
 *   chip-text    chips, badges and plates carry words, never colour alone
 *   headings     exactly one h1, and no level is skipped going down
 *   landmarks    one main, a banner and a footer, labelled navs when there are several
 *   img-alt      every img has an alt attribute
 *   focus-ring   every control reached with Tab shows a visible focus indicator
 *   tab-order    no positive tabindex, no trap, no big jump backwards up the page
 *
 * Findings are appended to app/e2e/ui-final/audit.jsonl (uploaded in the
 * ui-final-screens artifact). The test fails on them only when A11Y_ENFORCE=1.
 */

export const AUDIT_FILE = resolve('app/e2e/ui-final/audit.jsonl');

export type Finding = { rule: string; target: string; detail: string };
export type AuditOptions = {
  /** OBS overlay: no header or footer, may have no h1 while it waits. */
  bare?: boolean;
  /** A transient loading state: a status message stands in for the page heading. */
  loading?: boolean;
  /** Product-preview pages on the website use the app bar and have no site footer on purpose. */
  noFooter?: boolean;
  /** Known open items: findings whose rule matches and whose target or detail contains the text. */
  known?: Array<{ rule: string; match: string; reason: string }>;
  /** Skip the Tab walk (pages that are mid-animation or have no focusable content). */
  noFocus?: boolean;
  /** Controls the audit must not complain about: a CSS selector and the reason it is exempt. */
  allow?: Array<{ rule: string; selector: string; reason: string }>;
};

type StaticResult = Finding[];

async function staticAudit(page: Page, options: AuditOptions): Promise<StaticResult> {
  return page.evaluate((opts) => {
    const out: Array<{ rule: string; target: string; detail: string }> = [];
    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className
        ? '.' + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
    };
    const visible = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const allowed = (rule: string, el: Element): boolean =>
      (opts.allow ?? []).some((a) => a.rule === rule && el.matches(a.selector)) ||
      // a reference link alone in a table cell (a file name, an extension) is part of the text of the table, not a stand-alone target
      (rule === 'target-size' && el.tagName === 'A' && !!el.closest('td, th'));
    const push = (rule: string, el: Element | null, detail: string): void => {
      if (el && allowed(rule, el)) return;
      out.push({ rule, target: el ? describe(el) : 'page', detail });
    };

    // overflow
    const doc = document.documentElement;
    if (doc.scrollWidth - doc.clientWidth > 0) push('overflow', null, `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`);

    // controls
    const CONTROLS =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"]';
    const controls = [...document.querySelectorAll(CONTROLS)].filter(visible);
    const nameOf = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return aria.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const text = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
        if (text) return text;
      }
      if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type) && el.value) return el.value;
      const labels = (el as HTMLInputElement).labels;
      if (labels && labels.length) {
        const text = [...labels].map((l) => l.textContent ?? '').join(' ').trim();
        if (text) return text;
      }
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      clone.querySelectorAll('img[alt]').forEach((n) => n.replaceWith(document.createTextNode(n.getAttribute('alt') ?? '')));
      clone.querySelectorAll('svg title').forEach((n) => n.replaceWith(document.createTextNode(n.textContent ?? '')));
      const text = (clone.textContent ?? '').trim();
      if (text) return text;
      return (el.getAttribute('title') ?? '').trim();
    };
    const isInlineInText = (el: Element): boolean => {
      if (el.tagName !== 'A') return false;
      const style = getComputedStyle(el);
      if (style.display !== 'inline') return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const own = [...parent.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 1);
      return own.length > 0;
    };
    for (const el of controls) {
      const name = nameOf(el);
      if (!name) push('name', el, 'no accessible name');
      let box = el.getBoundingClientRect();
      if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) {
        const label = el.closest('label') ?? (el.labels && el.labels[0]) ?? null;
        if (label) box = label.getBoundingClientRect();
      }
      // a skip link parked off screen is measured when it is focused, not here
      if (box.right < 0 || box.bottom < 0 || box.left > window.innerWidth + 1) continue;
      if (isInlineInText(el)) continue;
      if (box.width < 43.5 || box.height < 43.5) {
        push('target-size', el, `${Math.round(box.width)} x ${Math.round(box.height)}`);
      }
    }

    // chips, badges and plates carry words
    for (const el of document.querySelectorAll('[class*="chip"], [class*="badge"], [class*="pill"], [class*="plate"], [role="status"]')) {
      if (!visible(el) || el.children.length > 4) continue;
      if (el.matches('ul, ol, nav, section, div[class*="list"], [class*="chips"], [class*="plates"]')) continue;
      if (!nameOf(el)) push('chip-text', el, 'no text or label: colour or an icon alone');
    }

    // images
    for (const img of document.querySelectorAll('img')) {
      if (!img.hasAttribute('alt') && visible(img)) push('img-alt', img, 'missing alt');
    }

    // headings
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')].filter(visible);
    const levelOf = (h: Element): number => Number(h.getAttribute('aria-level') ?? h.tagName.slice(1)) || 2;
    const h1s = headings.filter((h) => levelOf(h) === 1);
    if (h1s.length > 1) push('headings', h1s[1] ?? null, `${h1s.length} h1 elements`);
    if (h1s.length === 0 && !opts.bare && !opts.loading) push('headings', null, 'no h1');
    let prev = 0;
    for (const h of headings) {
      const level = levelOf(h);
      if (prev > 0 && level > prev + 1) push('headings', h, `h${prev} then h${level}`);
      prev = level;
    }

    // landmarks
    const mains = [...document.querySelectorAll('main, [role="main"]')];
    if (mains.length !== 1 && !(opts.bare && mains.length === 0 && (document.body.innerText ?? '').trim() === '')) push('landmarks', null, `${mains.length} main landmarks`);
    if (!opts.bare) {
      const inSection = 'article, aside, main, nav, section, [role="main"]';
      const banner = [...document.querySelectorAll('header, [role="banner"]')].find((h) => !h.parentElement?.closest(inSection));
      const footer = [...document.querySelectorAll('footer, [role="contentinfo"]')].find((f) => !f.parentElement?.closest(inSection));
      if (!banner) push('landmarks', null, 'no banner (header)');
      if (!footer && !opts.noFooter) push('landmarks', null, 'no contentinfo (footer)');
      const navs = [...document.querySelectorAll('nav, [role="navigation"]')].filter(visible);
      if (navs.length > 1) {
        const labels = navs.map((n) => (n.getAttribute('aria-label') ?? n.getAttribute('aria-labelledby') ?? '').trim());
        navs.forEach((n, i) => {
          if (!labels[i]) push('landmarks', n, 'several navs, this one has no label');
        });
        if (new Set(labels).size !== labels.length) push('landmarks', null, 'two navs share a label');
      }
    }
    return out;
  }, options);
}

type FocusStep = { floating: boolean; target: string; ring: boolean; tabindex: number; top: number; left: number; named: boolean; w: number; h: number };

async function focusAudit(page: Page, options: AuditOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const steps: FocusStep[] = [];
  const seen = new Map<string, number>();
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const step = await page.evaluate((): (FocusStep & { id: string; body: boolean }) | null => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      if (el === document.body || el === document.documentElement) return { floating: false, id: 'body', body: true, target: 'body', ring: true, tabindex: 0, top: 0, left: 0, named: true, w: 0, h: 0 };
      const style = getComputedStyle(el);
      const outlineOn = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'rgba(0, 0, 0, 0)';
      const shadowOn = style.boxShadow !== 'none';
      const r = el.getBoundingClientRect();
      // sticky, fixed and inner-scrolling ancestors make "top on the page" meaningless for the order check
      let floating = false;
      for (let p: HTMLElement | null = el; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === 'sticky' || cs.position === 'fixed' || ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight)) {
          floating = true;
          break;
        }
      }
      const text = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      const target = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} "${text.slice(0, 24)}"`;
      return {
        floating,
        id: target + `@${Math.round(r.top + window.scrollY)}x${Math.round(r.left)}`,
        body: false,
        target,
        ring: outlineOn || shadowOn,
        tabindex: el.tabIndex,
        top: r.top + window.scrollY,
        left: r.left,
        named: true,
        w: r.width,
        h: r.height
      };
    });
    if (!step) break;
    if (step.body) break; // wrapped round to the browser chrome
    const count = (seen.get(step.id) ?? 0) + 1;
    seen.set(step.id, count);
    if (count >= 2) {
      // back on an element already visited: the cycle is complete, unless it is a trap
      if (steps.length > 0 && steps[steps.length - 1]?.target === step.target && steps.length > 1 && count >= 3) {
        findings.push({ rule: 'tab-order', target: step.target, detail: 'keyboard trap' });
      }
      break;
    }
    steps.push(step);
  }
  let prev: FocusStep | undefined;
  for (const step of steps) {
    const skip = /skip to/i.test(step.target);
    if (!step.ring) findings.push({ rule: 'focus-ring', target: step.target, detail: 'no outline or box-shadow when focused by keyboard' });
    if (step.tabindex > 0) findings.push({ rule: 'tab-order', target: step.target, detail: `positive tabindex ${step.tabindex}` });
    if (skip && (step.w < 44 || step.h < 44)) findings.push({ rule: 'target-size', target: step.target, detail: `skip link ${Math.round(step.w)} x ${Math.round(step.h)} when focused` });
    if (prev && !prev.floating && !step.floating && prev.top - step.top > 240) findings.push({ rule: 'tab-order', target: step.target, detail: `jumps up the page by ${Math.round(prev.top - step.top)}px after "${prev.target}"` });
    prev = step;
  }
  if (steps.length === 0 && !options.noFocus) {
    // a page with controls must be reachable by keyboard
    const count = await page.locator('a[href], button:not([disabled]), input:not([disabled])').count();
    if (count > 0) findings.push({ rule: 'tab-order', target: 'page', detail: 'Tab reaches nothing although the page has controls' });
  }
  return findings;
}

/** Run the audit, record it, and fail on it when A11Y_ENFORCE=1. */
export async function audit(page: Page, label: string, options: AuditOptions = {}): Promise<Finding[]> {
  const findings = [...(await staticAudit(page, options))];
  if (!options.noFocus) findings.push(...(await focusAudit(page, options)));
  const allowed = options.allow ?? [];
  const unique = new Map<string, Finding>();
  const known = options.known ?? [];
  for (const f of findings) if (!known.some((k) => k.rule === f.rule && (f.target + f.detail).includes(k.match))) unique.set(`${f.rule}|${f.target}|${f.detail}`, f);
  const list = [...unique.values()];
  mkdirSync(dirname(AUDIT_FILE), { recursive: true });
  const line = JSON.stringify({ label, viewport: page.viewportSize(), url: new URL(page.url()).pathname, findings: list, allowed });
  appendFileSync(AUDIT_FILE, `${line}\n`);
  if (process.env.A11Y_ENFORCE === '1') {
    expect.soft(list.map((f) => `${f.rule}: ${f.target}: ${f.detail}`), `a11y audit of ${label}`).toEqual([]);
  }
  return list;
}

/** Reduced motion: nothing may keep animating, and smooth scrolling is off. */
export async function motionFindings(page: Page): Promise<Finding[]> {
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const out: Array<{ rule: string; target: string; detail: string }> = [];
    if (getComputedStyle(document.documentElement).scrollBehavior === 'smooth') {
      out.push({ rule: 'reduced-motion', target: 'html', detail: 'scroll-behavior is smooth' });
    }
    for (const a of document.getAnimations()) {
      if (a.playState !== 'running') continue;
      const timing = a.effect?.getComputedTiming();
      const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? 'animation';
      const infinite = timing?.iterations === Infinity;
      const long = typeof timing?.duration === 'number' && timing.duration > 120;
      if (infinite || long) {
        out.push({
          rule: 'reduced-motion',
          target: target ? `${target.tagName.toLowerCase()}${typeof target.className === 'string' && target.className ? '.' + target.className.trim().split(/\s+/)[0] : ''}` : 'unknown',
          detail: `${name} still running (${infinite ? 'infinite' : `${Math.round(Number(timing?.duration))}ms`})`
        });
      }
    }
    return out;
  });
}

export function recordMotion(label: string, findings: Finding[]): void {
  mkdirSync(dirname(AUDIT_FILE), { recursive: true });
  appendFileSync(AUDIT_FILE, `${JSON.stringify({ label, viewport: null, url: 'reduced-motion', findings, allowed: [] })}\n`);
}
