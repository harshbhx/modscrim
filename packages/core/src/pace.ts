export interface Limits {
  perMinute: number;
  perHour: number;
}

export interface Send {
  ts: number;
  units: number;
}

export const LIMITS: Record<'' | 'affiliate' | 'partner', Limits> = {
  '': { perMinute: 5, perHour: 50 },
  affiliate: { perMinute: 10, perHour: 100 },
  partner: { perMinute: 30, perHour: 300 }
};

const unitsIn = (sends: readonly Send[], from: number, to: number): number =>
  sends.reduce((total, send) => (send.ts > from && send.ts <= to ? total + send.units : total), 0);

/** Earliest time a call costing `units` may be sent, given past sends and an optional 429 block. */
export function nextAllowedAt(
  sends: readonly Send[],
  now: number,
  limits: Limits,
  units = 1,
  blockedUntil = 0
): number {
  if (units > limits.perMinute) throw new Error('Batch is larger than the per-minute limit.');
  const fits = (time: number): boolean =>
    unitsIn(sends, time - 60_000, time) + units <= limits.perMinute &&
    unitsIn(sends, time - 3_600_000, time) + units <= limits.perHour;
  const start = Math.max(now, blockedUntil);
  const candidates = [start, ...sends.flatMap((send) => [send.ts + 60_000, send.ts + 3_600_000])]
    .filter((time) => time >= start)
    .sort((a, b) => a - b);
  for (const time of candidates) if (fits(time)) return time === now ? now : time + 250;
  return start + 3_600_000;
}
