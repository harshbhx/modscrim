import { DEFAULT_CONFIG, DEMO_TERMS, FIXTURE_CHAT, tokenize } from '@mfd/core';
import { z } from 'zod';

export { demoBootstrap } from '@mfd/core';

/**
 * Public demo rooms (FR-38, SRS §3.4, §5.16). A demo room is a `ChannelRoom` named `demo:<uuid>` for the
 * fixture channel `pixelpanda_tv`. Its blocked terms and chat log come from `fixtures.ts` and live in the
 * room's own tables, so a simulated push and undo can edit them later. Demo rooms never call Twitch, D1,
 * R2 or the Queue, and they delete themselves 2 hours after their last activity (`room.gc`).
 */

type Sql = DurableObjectStorage['sql'];

/** The first draft of every demo room: the fixture config, Kai (sim) on (FR-38). */
export const DEMO_DRILL_CONFIG = DEFAULT_CONFIG;

/** A demo room is deleted this long after its last activity. */
export const DEMO_IDLE_MS = 2 * 60 * 60 * 1000;
/** The one `room.gc` job of a demo room (SRS §3.4: key `demo`). */
export const DEMO_GC_KEY = 'demo';

/** The `:room` part of `/api/demo/:room` and `/ws/demo/:room`: a random UUID. */
export const DemoIdZ = z.uuid();

export function demoRoomName(id: string): string {
  return `demo:${id}`;
}

export function isDemoRoomName(name: string): boolean {
  return name.startsWith('demo:') && DemoIdZ.safeParse(name.slice('demo:'.length)).success;
}

/** Fixture chatters: plain placeholder logins, never real chat. */
const FIXTURE_CHATTERS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Store the fixture blocked terms and the 71-line fixture chat log. Call inside `transactionSync`.
 * `INSERT OR IGNORE` with fixed IDs, so a repeat call changes nothing (and never undoes a simulated push).
 */
export function seedDemo(sql: Sql, now: number): void {
  // A day old, so the simulated push sees them as preexisting terms (FR-34).
  const createdAt = new Date(now - DAY_MS).toISOString();
  DEMO_TERMS.forEach((text, i) => {
    sql.exec(
      'INSERT OR IGNORE INTO blocked_terms (id, text, created_at, fetched_at) VALUES (?, ?, ?, ?)',
      `demo-term-${i + 1}`,
      text,
      createdAt,
      now
    );
  });
  // One line a minute, ending a minute ago: well inside the 7-day chat window.
  FIXTURE_CHAT.forEach((text, i) => {
    const chatter = (i % FIXTURE_CHATTERS) + 1;
    sql.exec(
      `INSERT OR IGNORE INTO chat_log (message_id, chatter_id, chatter_login, text, tokens, sent_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      `demo-chat-${i + 1}`,
      `demo-viewer-${chatter}`,
      `demo_viewer_${chatter}`,
      text,
      tokenize(text).join(' '),
      now - (FIXTURE_CHAT.length - i) * 60_000
    );
  });
}

/** When an idle demo room is due for deletion: 2 hours after its last activity. */
export function demoGcDueAt(lastActivity: number): number {
  return lastActivity + DEMO_IDLE_MS;
}
