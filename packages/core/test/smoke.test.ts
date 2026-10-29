import { describe, expect, it } from 'vitest';
import { coreName } from '../src/index.js';

describe('@mfd/core', () => {
  it('is available to Node tests', () => {
    expect(coreName).toBe('mod-fire-drill');
  });
});
