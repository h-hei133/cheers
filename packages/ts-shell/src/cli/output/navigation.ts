import type { SessionNavigationPoint } from '../../session/query/navigation.js';

/** Terminal presentation bounds do not limit persisted ancestry or selection. */
export const NAVIGATION_OUTPUT_LIMITS = Object.freeze({ depth: 10, rows: 20_000, bytes: 16 * 1024 * 1024 });

export function navigationLines(points: readonly SessionNavigationPoint[]): string[] {
  if (points.length > NAVIGATION_OUTPUT_LIMITS.rows) throw new Error('Session navigation output exceeds its row limit.');
  const lines: string[] = [];
  let bytes = 0;
  for (const point of points) {
    if ([point.entryId, point.label, point.unavailable ?? ''].some(text => /[\r\n\u2028\u2029]/u.test(text))) {
      throw new Error('Session navigation output contains an invalid line boundary.');
    }
    const indent = '  '.repeat(Math.min(point.depth, NAVIGATION_OUTPUT_LIMITS.depth));
    const line = `${indent}${point.depth > NAVIGATION_OUTPUT_LIMITS.depth ? '… ' : ''}- ${point.current ? '* ' : ''}${point.entryId} ${point.label}${point.unavailable ? ` [unavailable: ${point.unavailable}]` : ''}`;
    bytes += Buffer.byteLength(line, 'utf8') + (lines.length ? 1 : 0);
    if (bytes > NAVIGATION_OUTPUT_LIMITS.bytes) throw new Error('Session navigation output exceeds its byte limit.');
    lines.push(line);
  }
  return lines;
}
