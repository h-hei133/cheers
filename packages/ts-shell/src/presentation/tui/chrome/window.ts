/**
 * Scroll window for a bounded list.
 *
 * A list longer than its allotted rows shows a window into itself. The only rule
 * worth sharing is where that window sits: it follows the cursor by the minimum
 * distance needed to keep it visible, and never scrolls past the end, so a list
 * does not drift under a cursor that has stopped moving.
 */

export interface ListWindow {
  readonly offset: number;
  readonly count: number;
  /** Entries above the window. */
  readonly above: number;
  /** Entries below the window. */
  readonly below: number;
}

/** Where the window sits for a cursor position, given the previous offset. */
export function scrollWindow(
  selected: number,
  total: number,
  capacity: number,
  previousOffset: number,
): ListWindow {
  const count = Math.max(0, Math.min(capacity, total));
  if (count === 0) return { offset: 0, count: 0, above: 0, below: total };
  let offset = previousOffset;
  if (selected < offset) offset = selected;
  else if (selected >= offset + count) offset = selected - count + 1;
  offset = Math.max(0, Math.min(offset, total - count));
  return { offset, count, above: offset, below: total - offset - count };
}
