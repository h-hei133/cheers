/** Positive subprecision estimates must not look like an exactly free charge. */
export function money(usd: number | null): string {
  return usd === null ? 'unknown' : usd > 0 && usd < 0.0001 ? '<$0.0001' : `$${usd.toFixed(4)}`;
}
