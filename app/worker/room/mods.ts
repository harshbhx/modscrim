import { JoinZ } from '@mfd/core';
import { z } from 'zod';
import { randomId } from '../lib/ids.js';

/**
 * Mod join (FR-22, SRS §5.13, §11.1). Runs synchronously inside the caller's `transactionSync`.
 * Failed attempts are counted per IP per minute in `join_attempts`; after `JOIN_MAX_FAILURES`
 * failures in the current minute every attempt is refused with 429 without checking the code
 * (open-questions G-3: 5 in the room is the rule; `JOIN_LIMITER` is only the outer guard).
 */

type Sql = DurableObjectStorage['sql'];

export const JOIN_MAX_FAILURES = 5;
export const NAME_MAX = 24;
/** Participant tokens `{ room, pid, exp }` are valid for 12 hours. */
export const PARTICIPANT_TOKEN_MS = 12 * 60 * 60 * 1000;

export const JoinInputZ = JoinZ.extend({
  ip: z.string().min(1).max(128),
  twitchUserId: z.string().min(1).max(64).optional()
});
export type JoinInput = z.infer<typeof JoinInputZ>;

export type JoinResult =
  | { ok: true; participantId: string; name: string; drillId: string }
  | { ok: false; reason: 'forbidden' | 'rate_limited' };

const enc = new TextEncoder();

/** Constant-time comparison of two join codes (both are exactly 6 digits after validation). */
export function codesEqual(given: string, expected: string): boolean {
  const a = enc.encode(given);
  const b = enc.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Make a display name unique in the room with a number suffix ("Sam", "Sam 2", ...), at most 24 characters. */
export function uniqueName(sql: Sql, wanted: string): string {
  const taken = new Set(
    sql
      .exec<{ display_name: string }>('SELECT display_name FROM participants')
      .toArray()
      .map((r) => r.display_name.toLowerCase())
  );
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const chars = Array.from(wanted);
    while (chars.length > 0 && chars.join('').length + suffix.length > NAME_MAX) chars.pop();
    const name = `${chars.join('').trimEnd()}${suffix}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

function failures(sql: Sql, ip: string, minute: number): number {
  return sql.exec<{ n: number }>('SELECT n FROM join_attempts WHERE ip = ? AND minute = ?', ip, minute).toArray()[0]?.n ?? 0;
}

function countFailure(sql: Sql, ip: string, minute: number): void {
  sql.exec(
    'INSERT INTO join_attempts (ip, minute, n) VALUES (?, ?, 1) ON CONFLICT(ip, minute) DO UPDATE SET n = n + 1',
    ip,
    minute
  );
}

/** Check the code of the current draft or running drill and add the mod to it. Call inside `transactionSync`. */
export function joinAsMod(sql: Sql, input: JoinInput, now: number): JoinResult {
  const minute = Math.floor(now / 60_000);
  // Counters older than the previous minute are never read again (FR-43 also purges them).
  sql.exec('DELETE FROM join_attempts WHERE minute < ?', minute - 1);
  if (failures(sql, input.ip, minute) >= JOIN_MAX_FAILURES) {
    countFailure(sql, input.ip, minute);
    return { ok: false, reason: 'rate_limited' };
  }

  const drill = sql
    .exec<{ id: string; join_code: string }>(
      "SELECT id, join_code FROM drills WHERE status IN ('draft', 'voting', 'running') ORDER BY created_at DESC, id LIMIT 1"
    )
    .toArray()[0];
  // Always run the comparison so a missing drill costs the same as a wrong code.
  const match = codesEqual(input.code, drill?.join_code ?? '000000') && drill !== undefined;
  if (!match || !drill) {
    countFailure(sql, input.ip, minute);
    return { ok: false, reason: 'forbidden' };
  }

  const participantId = randomId(12);
  const name = uniqueName(sql, input.displayName);
  sql.exec(
    'INSERT INTO participants (id, twitch_user_id, display_name, is_sim, joined_at) VALUES (?, ?, ?, 0, ?)',
    participantId,
    input.twitchUserId ?? null,
    name,
    now
  );
  sql.exec('INSERT OR IGNORE INTO drill_participants (drill_id, participant_id) VALUES (?, ?)', drill.id, participantId);
  return { ok: true, participantId, name, drillId: drill.id };
}
