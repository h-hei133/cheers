export const DURATION_BOUNDS_MS = Object.freeze([
  1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000,
]);

export function durationBucket(value: number): number {
  const index = DURATION_BOUNDS_MS.findIndex(upper => value <= upper);
  return index < 0 ? DURATION_BOUNDS_MS.length : index;
}

export function emptyHistogram(): number[] {
  return Array<number>(DURATION_BOUNDS_MS.length + 1).fill(0);
}

export function readHistogram(value: unknown, count: number, max: number): readonly number[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { version, counts } = value as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(counts) || counts.length !== DURATION_BOUNDS_MS.length + 1
    || !counts.every(item => Number.isSafeInteger(item) && item >= 0)) return undefined;
  if (counts.reduce((sum, item) => sum + item, 0) !== count) return undefined;
  const highest = durationBucket(max);
  if (count > 0 && (max < 0 || counts[highest] <= 0 || counts.slice(highest + 1).some(Boolean))) return undefined;
  return counts;
}

export function histogramQuantile(counts: readonly number[], count: number, quantile: number): { boundMs: number; exceeds: boolean } {
  let rank = Math.ceil(count * quantile);
  for (const [index, upper] of DURATION_BOUNDS_MS.entries()) {
    rank -= counts[index] ?? 0;
    if (rank <= 0) return { boundMs: upper, exceeds: false };
  }
  return { boundMs: DURATION_BOUNDS_MS.at(-1)!, exceeds: true };
}
