import { describe, expectTypeOf, it } from 'vitest';
import type { RedactedLine, ReportCard } from '../src/index.js';

describe('shared contracts', () => {
  it('keeps overlay lines to their redacted shape', () => {
    expectTypeOf<RedactedLine>().toEqualTypeOf<{
      lineId: string;
      user: string;
      len: number;
    }>();
  });

  it('keeps report cards free of terms and source text', () => {
    expectTypeOf<Extract<keyof ReportCard, 'terms' | 'text'>>().toEqualTypeOf<never>();
  });
});
