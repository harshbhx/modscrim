import type { DrillScore } from './types.js';

/**
 * Coach's note (FR-42, SRS §5.14): two plain sentences of advice for the mod team after a drill.
 * Pure: built from the score numbers only, never from line text.
 */

/** The only numbers a coach's note is built from, by the template or by Workers AI. */
export interface CoachStats {
  slipped: number;
  attacksShown: number;
  falseBans: number;
  fastestMs: number | null;
}

/** The note's numbers from a drill score: false bans summed over every mod, the fastest mod's average reaction. */
export function coachStats(score: DrillScore): CoachStats {
  let falseBans = 0;
  let fastestMs: number | null = null;
  for (const m of score.mods) {
    falseBans += m.falseBans;
    if (m.avgReactionMs !== null && (fastestMs === null || m.avgReactionMs < fastestMs)) fastestMs = m.avgReactionMs;
  }
  return { slipped: score.slipped, attacksShown: score.attacksShown, falseBans, fastestMs };
}

export function coachNote(s: { slipped: number; attacksShown: number; falseBans: number; fastestMs: number | null }): string {
  const a = s.slipped === 0 ? 'Nothing slipped through, great coverage.'
    : `${s.slipped} of ${s.attacksShown} attacks slipped through; split the chat so each mod watches part of it.`;
  const b = s.falseBans === 0 ? 'No regulars were removed.'
    : `${s.falseBans} regular${s.falseBans === 1 ? ' was' : 's were'} removed; read the whole line before acting on keywords like "free" or "link".`;
  return `${a} ${b}`;
}
