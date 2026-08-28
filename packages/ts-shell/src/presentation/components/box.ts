export interface BoxOptions {
  readonly title?: string;
  readonly width?: number;
  readonly padding?: number;
}

export function createBox(
  contentLines: readonly string[],
  options?: BoxOptions,
): readonly string[] {
  const width = options?.width ?? 72;
  const horizontal = "─".repeat(Math.max(0, width - 2));
  const top = options?.title
    ? `┌─ ${options.title} ${"─".repeat(Math.max(0, width - options.title.length - 6))}┐`
    : `┌${horizontal}┐`;
  const bottom = `└${horizontal}┘`;

  const body = contentLines.map((line) => {
    const truncated = line.slice(0, width - 4);
    const padded = truncated.padEnd(width - 4, " ");
    return `│ ${padded} │`;
  });

  return [top, ...body, bottom];
}
