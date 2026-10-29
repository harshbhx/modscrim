/** Lowercase, split on anything that is not a letter or a digit. */
export const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export interface Part {
  p: string;
  pre: boolean;
  suf: boolean;
}

export function parseTerm(term: string): Part[] {
  return term.trim().split(/\s+/).flatMap((word): Part[] => {
    const pre = word.startsWith('*');
    const suf = word.endsWith('*');
    const parts = tokenize(word.replace(/\*/g, ''));
    if (parts.length === 1) {
      return [{ p: parts[0] as string, pre, suf }];
    }
    return parts.map((p) => ({ p, pre: false, suf: false }));
  });
}

/** *foo = a token ends with foo; foo* = starts with foo; *foo* = contains foo. */
export function partHits({ p, pre, suf }: Part, tok: string): boolean {
  if (pre && suf) return tok.includes(p);
  if (pre) return tok.endsWith(p);
  if (suf) return tok.startsWith(p);
  return tok === p;
}

export function termHits(term: string, toks: readonly string[]): boolean {
  const parts = parseTerm(term);
  if (parts.length === 0) return false;
  return parts.every((part) => toks.some((t) => partHits(part, t)));
}

export function blockedBy(terms: readonly string[], text: string): string | null {
  const toks = tokenize(text);
  return terms.find((term) => termHits(term, toks)) ?? null;
}

export function validateTerm(t: string): string | null {
  const s = t.trim();
  if (s.length < 2 || s.length > 500) return 'Terms must be 2 to 500 characters.';
  if (!s.split(/\s+/).every((word) => /^\*?[^*]+\*?$/.test(word))) {
    return 'A * can only go at the start or end of a word.';
  }
  if (parseTerm(s).length === 0) return 'A term needs at least one letter or digit.';
  return null;
}
