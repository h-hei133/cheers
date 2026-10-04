/** Keeps mandatory lines and original order; an unrepresentable context is refused. */
export function fitContextLines(
  lines: readonly string[],
  maxChars: number,
  isCritical: (line: string) => boolean,
  omissionLine: string,
): { context: string; omittedLineCount: number; fits: boolean } {
  const limit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  const original = lines.join("\n");
  if (original.length <= limit) return { context: original, omittedLineCount: 0, fits: true };
  const required = lines.map(isCritical);
  const kept = new Set(lines.flatMap((_, index) => required[index] ? [index] : []));
  let size = lines.filter((_, index) => required[index]).join("\n").length
    + omissionLine.length + (kept.size > 0 ? 1 : 0);
  if (size > limit) return { context: "", omittedLineCount: lines.length, fits: false };
  for (let index = 0; index < lines.length; index++) {
    if (required[index]) continue;
    const cost = lines[index].length + 1;
    if (size + cost > limit) continue;
    kept.add(index);
    size += cost;
  }
  const selected = lines.filter((_, index) => kept.has(index));
  const closing = selected.findIndex(line => /^<\//.test(line));
  selected.splice(closing < 0 ? selected.length : closing, 0, omissionLine);
  return { context: selected.join("\n"), omittedLineCount: lines.length - kept.size, fits: true };
}
