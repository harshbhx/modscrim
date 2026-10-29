import { blockedBy, tokenize } from '@mfd/core';
import { describe, expect, it } from 'vitest';

describe('@mfd/core in workerd', () => {
  it('runs the matcher unchanged in the Worker test pool', () => {
    expect(blockedBy(['free nitro'], 'NITRO is free')).toBe('free nitro');
    expect(tokenize('bit.ly/x')).toEqual(['bit', 'ly', 'x']);
  });
});
