import type { ReactNode } from 'react';

/**
 * Small line icons for the console, drawn on a 16 px grid in currentColor.
 * They are decoration: every one is aria-hidden and sits next to real text,
 * so colour and shape are never the only signal (PRD §9.7).
 */
const PATHS = {
  check: ['M3 8.5l3.2 3.2L13 4.8'],
  alert: ['M8 2.2L14.2 13H1.8L8 2.2z', 'M8 6.5v3.2', 'M8 11.4h.01'],
  x: ['M4 4l8 8M12 4L4 12'],
  clock: ['M8 2a6 6 0 100 12A6 6 0 008 2z', 'M8 4.8V8l2.2 1.4'],
  lock: ['M4.5 7.2h7v5.6h-7z', 'M6 7.2V5.4a2 2 0 014 0v1.8'],
  info: ['M8 2a6 6 0 100 12A6 6 0 008 2z', 'M8 7.4v3.6', 'M8 5h.01'],
  shield: ['M8 1.8l5 1.8v4c0 3-2.1 5.2-5 6.4-2.9-1.2-5-3.4-5-6.4v-4l5-1.8z'],
  eye: ['M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z', 'M8 6.2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z'],
  users: ['M6 7.5a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z', 'M2 13c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8', 'M11 3.4a2.2 2.2 0 010 4.1', 'M12.5 9.4c1.2.5 2 1.7 2 3.4'],
  play: ['M5 3.5v9l7-4.5-7-4.5z'],
  dot: ['M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z']
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="console-icon" aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {PATHS[name].map((d) => <path key={d} d={d} />)}
  </svg>;
}

/** A status pill: icon plus text, tone by class. Never colour alone. */
export function Chip({ tone = 'neutral', icon, children }: { tone?: 'ok' | 'warn' | 'info' | 'neutral'; icon?: IconName; children: ReactNode }) {
  return <span className={`console-chip is-${tone}`}>{icon && <Icon name={icon} size={14} />}{children}</span>;
}
