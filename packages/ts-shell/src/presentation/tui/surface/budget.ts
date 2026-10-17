/** Minimum transcript rows kept visible however tall the chrome grows. */
export const MIN_TRANSCRIPT_ROWS = 1;

/**
 * Total rows the composer may occupy.
 *
 * Up to sixteen body rows plus at most four decoration rows; the fraction keeps
 * the transcript visible on short terminals instead of a fixed cap that stopped
 * the composer at seven rows on a twenty-row screen.
 */
export function composerRowBudget(height: number): number {
  const capacity = Math.max(1, height - MIN_TRANSCRIPT_ROWS);
  return Math.min(capacity, Math.max(3, Math.min(20, Math.floor(height * 0.6))));
}
