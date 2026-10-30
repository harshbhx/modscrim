import type { LinkTrick, Trick } from './types.js';

const LEET: Record<string, string> = { a: '4', e: '3', i: '1', o: '0', s: '5' };
const HOMO: Record<string, string> = {
  a: '\u0430', e: '\u0435', o: '\u043e', c: '\u0441', p: '\u0440', i: '\u0456', x: '\u0445'
};

export const TRICK: Record<Trick, (word: string) => string> = {
  plain: (word) => word,
  caps: (word) => word.toUpperCase(),
  leet: (word) => {
    let count = 0;
    return word.replace(/[aeios]/g, (character) => (count++ < 2 ? LEET[character] ?? character : character));
  },
  stretch: (word) => word.replace(/[aeiou]/, (vowel) => vowel + vowel + vowel),
  emoji: (word) => {
    const middle = Math.ceil(word.length / 2);
    return word.slice(0, middle) + '\u{1F381}' + word.slice(middle);
  },
  spaced: (word) => word.split('').join(' '),
  dotted: (word) => word.split('').join('.'),
  zerowidth: (word) => word.slice(0, 2) + '\u200b' + word.slice(2),
  lookalike: (word) => word.replace(/[aeocpix]/, (character) => HOMO[character] ?? character)
};

export const LINK_TRICK: Record<LinkTrick, (host: string) => string> = {
  plain: (host) => `${host}.invalid`,
  spaced: (host) => `${host} .invalid`,
  bracket: (host) => `${host}[.]invalid`,
  leet: (host) => `${TRICK.leet(host)}.invalid`,
  dotword: (host) => `${host} dot invalid`
};

export const TRICK_LABEL: Record<Trick, string> = {
  plain: '',
  caps: 'all caps',
  leet: 'number swaps',
  stretch: 'stretched letters',
  emoji: 'emoji inside word',
  spaced: 'spaced letters',
  dotted: 'dotted letters',
  zerowidth: 'zero-width character',
  lookalike: 'look-alike letters'
};

export const LINK_LABEL: Record<LinkTrick, string> = {
  plain: '',
  spaced: 'space in link',
  bracket: '[.] in link',
  leet: 'number swaps in link',
  dotword: '"dot" spelled out'
};

/** Tags that blocked terms cannot express and therefore need a bot rule. */
export const NEEDS_BOT_RULE = new Set([
  'spaced letters',
  'dotted letters',
  'zero-width character',
  'emoji inside word',
  'look-alike letters',
  'space in link',
  '[.] in link',
  '"dot" spelled out'
]);

export const TRAIN_TRICKS: readonly Trick[] = [
  'plain', 'plain', 'caps', 'leet', 'stretch', 'emoji', 'spaced', 'zerowidth'
];
export const TRAIN_LINK_TRICKS: readonly LinkTrick[] = ['plain', 'plain', 'spaced', 'bracket'];
export const HELDOUT_TRICKS: readonly Trick[] = [
  'plain', 'leet', 'stretch', 'lookalike', 'dotted', 'emoji', 'lookalike', 'dotted'
];
export const HELDOUT_LINK_TRICKS: readonly LinkTrick[] = ['plain', 'leet', 'dotword', 'bracket'];
