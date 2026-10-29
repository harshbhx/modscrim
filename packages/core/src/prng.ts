export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly nextFn: () => number;

  constructor(seed: number) {
    this.nextFn = mulberry32(seed >>> 0);
  }

  next(): number {
    return this.nextFn();
  }

  int(n: number): number {
    return Math.floor(this.nextFn() * n);
  }

  pick<T>(a: readonly T[]): T {
    return a[this.int(a.length)] as T;
  }

  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = a[i] as T;
      a[i] = a[j] as T;
      a[j] = t;
    }
    return a;
  }
}

/** Stable 32-bit hash for deriving sub-seeds (FNV-1a). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
