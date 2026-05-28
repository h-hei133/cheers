export interface ProjectedLineRenderer {
  renderLine(line: string): void;
}

export function renderProjectedLines(
  renderer: ProjectedLineRenderer,
  lines: readonly string[],
): void {
  for (const line of lines) {
    renderer.renderLine(line);
  }
}
