import { describe, expect, it } from 'vitest';
import { blockedBy, termHits, tokenize, validateTerm } from '../src/matcher.js';
import { Rng, hash32, mulberry32 } from '../src/prng.js';

describe('blocked-term matcher', () => {
  it.each([
    ['free nitro', 'NITRO is free', true],
    ['nitrod*', 'nitrodrop.invalid', true],
    ['*odrop', 'nitrodrop', true],
    ['*itrod*', 'nitrodrop', true],
    ['free', 'f r e e nitro', false],
    ['free', 'fr33 nitro', false],
    ['free', `fr${'\u0435\u0435'}`, false],
    ['free', `fr\u200bee`, false],
    ['bit.ly', 'go to bit.ly/x', true]
  ])('matches %s against %s as %s', (term, message, expected) => {
    expect(termHits(term, tokenize(message))).toBe(expected);
  });

  it('matches every word in a multi-word term in any order', () => {
    expect(blockedBy(['free nitro'], 'NITRO is free')).toBe('free nitro');
  });

  it('returns the first matching blocked term', () => {
    expect(blockedBy(['buy followers', 'free nitro'], 'get free nitro now')).toBe('free nitro');
  });

  it('rejects invalid wildcard placement', () => {
    expect(validateTerm('fr*ee')).toBe('A * can only go at the start or end of a word.');
    expect(validateTerm('*')).not.toBeNull();
  });

  it('rejects empty, short, overlong, and non-token terms', () => {
    expect(validateTerm('a')).toBe('Terms must be 2 to 500 characters.');
    expect(validateTerm('a'.repeat(501))).toBe('Terms must be 2 to 500 characters.');
    expect(validateTerm('..')).toBe('A term needs at least one letter or digit.');
  });
});

describe('seeded randomness', () => {
  it('repeats the same sequence for the same seed', () => {
    const first = new Rng(7);
    const second = new Rng(7);

    expect([first.next(), first.next(), first.next()]).toEqual([second.next(), second.next(), second.next()]);
  });

  it('keeps integer selection within bounds and shuffles in place', () => {
    const rng = new Rng(7);
    const values = [1, 2, 3, 4];

    expect(rng.int(4)).toBeGreaterThanOrEqual(0);
    expect(rng.int(4)).toBeLessThan(4);
    expect(rng.shuffle(values)).toBe(values);
    expect([...values].sort()).toEqual([1, 2, 3, 4]);
  });

  it('derives stable FNV-1a sub-seeds', () => {
    expect(hash32('hello')).toBe(0x4f9f2cab);
    expect(mulberry32(7)()).toBe(new Rng(7).next());
  });
});
