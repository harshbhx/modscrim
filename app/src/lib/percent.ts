/** `part` as a percentage of `whole`, clamped to 0-100. A zero whole gives 0, never NaN. */
export function percentOf(part: number, whole: number): number {
  if (!(whole > 0) || !Number.isFinite(part)) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}
