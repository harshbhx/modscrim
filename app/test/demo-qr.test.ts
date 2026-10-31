import { describe, expect, it } from 'vitest';
import { createDemoQrMatrix } from '../src/lib/demoQr.js';

describe('demo moderator QR', () => {
  it('encodes the room-specific phone link as a local QR matrix', () => {
    const qr = createDemoQrMatrix('https://app.modscrim.dualmindlab.tech/demo/room-123/mod');

    expect(qr.size).toBeGreaterThan(20);
    expect(qr.path).toContain('M');
    expect(qr.path).not.toContain('http');
  });
});
