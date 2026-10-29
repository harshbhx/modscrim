import { blockedBy, tokenize } from '@mfd/core';
import type { RedactedLine } from '@mfd/core';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('@mfd/core in workerd', () => {
  it('runs the matcher unchanged in the Worker test pool', () => {
    expect(blockedBy(['free nitro'], 'NITRO is free')).toBe('free nitro');
    expect(tokenize('bit.ly/x')).toEqual(['bit', 'ly', 'x']);
  });

  it('shares the redacted overlay shape with the Worker', () => {
    expectTypeOf<RedactedLine>().toEqualTypeOf<{
      lineId: string;
      user: string;
      len: number;
    }>();
    expect(true).toBe(true);
  });
});
