import { parseTerm, termHits, tokenize, type Part } from './matcher.js';

export interface CleanIndex {
  size: number;
  match(term: string): { count: number; example: string | null };
}

/** Reference implementation; used in tests and for tiny sets. */
export function bruteForceIndex(lines: readonly string[]): CleanIndex {
  const tokens = lines.map(tokenize);
  return {
    size: lines.length,
    match(term) {
      let count = 0;
      let example: string | null = null;
      tokens.forEach((lineTokens, index) => {
        if (termHits(term, lineTokens)) {
          count++;
          example ??= lines[index] ?? null;
        }
      });
      return { count, example };
    }
  };
}

const reverse = (value: string): string => [...value].reverse().join('');

function lowerBound<T>(items: readonly T[], key: (item: T) => string, prefix: string): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (key(items[middle] as T) < prefix) low = middle + 1;
    else high = middle;
  }
  return low;
}

type ReversedWord = { r: string; t: string };

/** `tokenLists[i]` may supply pre-tokenized chat tokens from ingest. */
export function buildCleanIndex(lines: readonly string[], tokenLists?: readonly (readonly string[])[]): CleanIndex {
  const postings = new Map<string, number[]>();
  lines.forEach((line, index) => {
    for (const token of new Set(tokenLists?.[index] ?? tokenize(line))) {
      const lineIndexes = postings.get(token);
      if (lineIndexes) lineIndexes.push(index);
      else postings.set(token, [index]);
    }
  });

  const vocabulary = [...postings.keys()].sort();
  const reversedVocabulary: ReversedWord[] = vocabulary
    .map((token) => ({ r: reverse(token), t: token }))
    .sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));

  const linesFor = (part: Part): Set<number> => {
    const matchingLines = new Set<number>();
    const addToken = (token: string): void => {
      for (const index of postings.get(token) ?? []) matchingLines.add(index);
    };

    if (part.pre && part.suf) {
      for (const token of vocabulary) if (token.includes(part.p)) addToken(token);
    } else if (part.suf) {
      for (
        let index = lowerBound(vocabulary, (token) => token, part.p);
        index < vocabulary.length && (vocabulary[index] as string).startsWith(part.p);
        index++
      ) {
        addToken(vocabulary[index] as string);
      }
    } else if (part.pre) {
      const reversedPrefix = reverse(part.p);
      for (
        let index = lowerBound(reversedVocabulary, (word) => word.r, reversedPrefix);
        index < reversedVocabulary.length && (reversedVocabulary[index] as ReversedWord).r.startsWith(reversedPrefix);
        index++
      ) {
        addToken((reversedVocabulary[index] as ReversedWord).t);
      }
    } else {
      addToken(part.p);
    }
    return matchingLines;
  };

  return {
    size: lines.length,
    match(term) {
      const [first, ...rest] = parseTerm(term);
      if (first === undefined) return { count: 0, example: null };
      let matchingLines = linesFor(first);
      for (const part of rest) {
        if (matchingLines.size === 0) break;
        const partLines = linesFor(part);
        matchingLines = new Set([...matchingLines].filter((index) => partLines.has(index)));
      }
      if (matchingLines.size === 0) return { count: 0, example: null };
      let firstIndex = Number.POSITIVE_INFINITY;
      for (const index of matchingLines) if (index < firstIndex) firstIndex = index;
      return { count: matchingLines.size, example: lines[firstIndex] ?? null };
    }
  };
}
