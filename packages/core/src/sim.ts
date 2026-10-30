import { hash32, Rng } from './prng.js';
import type { ModAction, WaveLine } from './types.js';

const TEMPTING = /scam|kill|free|link|menace|dm/;
const ACTIONS: readonly ModAction[] = ['delete', 'timeout', 'ban'];

/** Kai (sim): deterministic per (seed, line). Returns null when Kai ignores the line. */
export function simDecision(
  seed: number,
  line: Pick<WaveLine, 'id' | 'kind' | 'text'>
): { delayMs: number; action: ModAction } | null {
  const rng = new Rng(hash32(`${seed}:${line.id}`));
  if (line.kind === 'attack') {
    if (rng.next() >= 0.6) return null;
    return { delayMs: Math.round(2600 + rng.next() * 4200), action: rng.pick(ACTIONS) };
  }
  if (TEMPTING.test(line.text.toLowerCase()) && rng.next() < 0.3) {
    return { delayMs: Math.round(2800 + rng.next() * 2600), action: 'timeout' };
  }
  return null;
}
