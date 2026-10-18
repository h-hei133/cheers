/** Literal matches precede fuzzy matches; equal ranks preserve catalogue order. */
export function matchRank(query: string, label: string, detail?: string): number {
  if (!query) return 900;
  label = label.toLowerCase();
  if (label === query) return 1000;
  if (label.startsWith(query)) return 900;
  if (label.includes(query)) return 700;
  let cursor = 0;
  let gaps = 0;
  let previous = -1;
  for (let index = 0; index < label.length && cursor < query.length; index++) {
    if (label[index] !== query[cursor]) continue;
    if (previous >= 0) gaps += index - previous - 1;
    previous = index;
    cursor += 1;
  }
  if (cursor === query.length) return Math.max(500 - gaps * 5, 201);
  return detail?.toLowerCase().includes(query) ? 200 : 0;
}
