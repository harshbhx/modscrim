import { blockedBy } from './matcher.js';
import { groupByTag, type TagCount } from './ruleFinder.js';
import type { CleanIndex } from './cleanIndex.js';
import type { WaveLine } from './types.js';

export interface ProofResult {
  total: number;
  blockedBefore: number;
  blockedAfter: number;
  realChat: { term: string; count: number; example: string | null }[];
  pushAllowed: boolean;
  stillByTag: TagCount[];
}

export function proveOnFreshWave(
  waveB: readonly WaveLine[],
  current: readonly string[],
  selected: readonly string[],
  clean: CleanIndex
): ProofResult {
  const after = [...current, ...selected];
  const blockedBefore = waveB.filter((line) => blockedBy(current, line.text) !== null).length;
  const stillThrough = waveB.filter((line) => blockedBy(after, line.text) === null);
  const realChat = selected.map((term) => ({ term, ...clean.match(term) }));
  return {
    total: waveB.length,
    blockedBefore,
    blockedAfter: waveB.length - stillThrough.length,
    realChat,
    pushAllowed: selected.length > 0 && realChat.every((result) => result.count === 0),
    stillByTag: groupByTag(stillThrough)
  };
}
