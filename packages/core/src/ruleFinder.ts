import { tokenize, termHits, validateTerm } from './matcher.js';
import { NEEDS_BOT_RULE } from './tricks.js';
import type { CleanIndex } from './cleanIndex.js';
import type { WaveLine } from './types.js';

export const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'at', 'is', 'it', 'to', 'of', 'in', 'on', 'your', 'you', 'me', 'my',
  'i', 'are', 'be', 'this', 'that', 'get', 'grab', 'first', '50', 'yours', 'before', 'ends', 'more', 'best',
  'real', 'fast', 'out', 'here', 'now', 'everyone', 'hey', 'hi', 'nice', 'need', 'do', 'check', 'make', 'want',
  'with', 'its'
]);

export interface RuleProposal {
  term: string;
  hits: number;
  gain: number;
  exampleLineId: string;
}

export interface RejectedTerm {
  term: string;
  hits: number;
  fp: number;
  fpExample: string;
}

export interface TagCount {
  tag: string;
  count: number;
  needsBotRule: boolean;
}

export interface RuleFinderResult {
  accepted: RuleProposal[];
  rejected: RejectedTerm[];
  stillPassing: string[];
  stillByTag: TagCount[];
}

export function candidatesFrom(lines: readonly Pick<WaveLine, 'text'>[]): string[] {
  const candidates = new Set<string>();
  for (const line of lines) {
    const tokens = tokenize(line.text);
    tokens.forEach((token, index) => {
      if (token.length >= 3 && !STOP.has(token)) {
        candidates.add(token);
        if (token.length >= 7) {
          candidates.add(`${token.slice(0, 5)}*`);
          candidates.add(`${token.slice(0, 6)}*`);
          candidates.add(`*${token.slice(-5)}`);
        }
      }
      const next = tokens[index + 1];
      if (next !== undefined && token.length >= 2 && next.length >= 2 && !STOP.has(token) && !STOP.has(next)) {
        candidates.add(`${token} ${next}`);
      }
    });
  }
  return [...candidates].filter((term) => validateTerm(term) === null);
}

export function groupByTag(lines: readonly WaveLine[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    for (const tag of line.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count, needsBotRule: NEEDS_BOT_RULE.has(tag) }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));
}

export function findRules(
  passed: readonly WaveLine[],
  clean: CleanIndex,
  opts: { maxTerms?: number; minHits?: number; maxRejected?: number } = {}
): RuleFinderResult {
  const maxTerms = opts.maxTerms ?? 6;
  const minHits = opts.minHits ?? 2;
  const maxRejected = opts.maxRejected ?? 6;
  const tokenLists = passed.map((line) => tokenize(line.text));

  const scored = candidatesFrom(passed)
    .map((term) => {
      const covers: number[] = [];
      tokenLists.forEach((tokens, index) => {
        if (termHits(term, tokens)) covers.push(index);
      });
      const falsePositives = covers.length >= minHits ? clean.match(term) : { count: 0, example: null };
      return { term, covers, fp: falsePositives.count, fpExample: falsePositives.example };
    })
    .filter((candidate) => candidate.covers.length >= minHits);

  const valid = scored.filter((candidate) => candidate.fp === 0);
  const remaining = new Set(passed.map((_, index) => index));
  const used = new Set<string>();
  const accepted: RuleProposal[] = [];

  while (accepted.length < maxTerms) {
    let best: (typeof valid)[number] | null = null;
    let bestGain = 0;
    for (const candidate of valid) {
      if (used.has(candidate.term)) continue;
      const gain = candidate.covers.filter((index) => remaining.has(index)).length;
      const isBetter = gain > bestGain || (gain === bestGain && best !== null &&
        (candidate.term.length > best.term.length ||
          (candidate.term.length === best.term.length && candidate.term < best.term)));
      if (isBetter) {
        best = candidate;
        bestGain = gain;
      }
    }
    if (best === null || bestGain < minHits) break;
    const first = best.covers.find((index) => remaining.has(index)) as number;
    accepted.push({
      term: best.term,
      hits: best.covers.length,
      gain: bestGain,
      exampleLineId: (passed[first] as WaveLine).id
    });
    used.add(best.term);
    for (const index of best.covers) remaining.delete(index);
  }

  const rejected = scored
    .filter((candidate) => candidate.fp > 0)
    .sort((a, b) => b.covers.length - a.covers.length || a.term.length - b.term.length || (a.term < b.term ? -1 : 1))
    .slice(0, maxRejected)
    .map((candidate) => ({
      term: candidate.term,
      hits: candidate.covers.length,
      fp: candidate.fp,
      fpExample: candidate.fpExample ?? ''
    }));

  const still = [...remaining].sort((a, b) => a - b).map((index) => passed[index] as WaveLine);
  return {
    accepted,
    rejected,
    stillPassing: still.map((line) => line.id),
    stillByTag: groupByTag(still)
  };
}
