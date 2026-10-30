import { simDecision, type ModAction, type WaveLine } from '@mfd/core';

/**
 * Kai (sim), the simulated co-mod (FR-39, SRS §5.9). Kai is one room participant with `is_sim = 1`,
 * added to a drill when its config has `simMod` on. Its actions come from `simDecision` and go through
 * the same first-action-wins path as human mods, so Kai never acts on a line already taken or slipped.
 */

type Sql = DurableObjectStorage['sql'];

/** Fixed per room, so two runs with the same seed give identical Kai actions, participant ID included. */
export const SIM_PARTICIPANT_ID = 'sim-kai';
export const SIM_NAME = 'Kai (sim)';

/** Create Kai once per room. */
export function ensureSim(sql: Sql, now: number): void {
  sql.exec(
    'INSERT OR IGNORE INTO participants (id, twitch_user_id, display_name, is_sim, joined_at) VALUES (?, NULL, ?, 1, ?)',
    SIM_PARTICIPANT_ID,
    SIM_NAME,
    now
  );
}

/** Add Kai to the drill when `simMod` is on, or take Kai out of it when off. Call inside `transactionSync`. */
export function syncSimMembership(sql: Sql, drillId: string, simMod: boolean, now: number): void {
  if (simMod) {
    ensureSim(sql, now);
    sql.exec('INSERT OR IGNORE INTO drill_participants (drill_id, participant_id) VALUES (?, ?)', drillId, SIM_PARTICIPANT_ID);
  } else {
    sql.exec('DELETE FROM drill_participants WHERE drill_id = ? AND participant_id = ?', drillId, SIM_PARTICIPANT_ID);
  }
}

/**
 * Kai's decision for one line. The key is the line's place in the wave (`A-<idx>`), not its ID, because
 * line IDs contain the random drill ID: this way the same seed gives the same Kai actions in every drill.
 */
export function simPlan(seed: number, line: Pick<WaveLine, 'wave' | 'idx' | 'kind' | 'text'>): { delayMs: number; action: ModAction } | null {
  return simDecision(seed, { id: `${line.wave}-${line.idx}`, kind: line.kind, text: line.text });
}
