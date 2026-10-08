/** Compact durable replay protection: one range for a serial settled run. */
export function finalizedSequence(ranges: readonly (readonly [number, number])[], sequence: number): boolean {
  return ranges.some(([first, last]) => sequence >= first && sequence <= last);
}

export function finalizeSequence(ranges: readonly (readonly [number, number])[], sequence: number): readonly (readonly [number, number])[] {
  const ordered = [...ranges, [sequence, sequence] as const].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [first, last] of ordered) {
    const previous = merged.at(-1);
    if (previous && first <= previous[1] + 1) previous[1] = Math.max(previous[1], last);
    else merged.push([first, last]);
  }
  return merged;
}
