export interface ToolCardProps {
  readonly toolName: string;
  readonly argumentsSummary: string;
  readonly elapsedMs?: number;
  readonly stdoutLines?: readonly string[];
  readonly status: "running" | "success" | "error";
}

export function renderToolCard(props: ToolCardProps): readonly string[] {
  const statusIcon =
    props.status === "running"
      ? "\x1b[33m⠹\x1b[0m"
      : props.status === "success"
        ? "\x1b[32m✓\x1b[0m"
        : "\x1b[31m✗\x1b[0m";

  const elapsedText =
    props.elapsedMs !== undefined
      ? ` \x1b[90m(${Math.round(props.elapsedMs)}ms)\x1b[0m`
      : "";

  const header = `┌─ ${statusIcon} \x1b[1m${props.toolName}\x1b[0m ${props.argumentsSummary}${elapsedText}`;
  const lines: string[] = [header];

  if (props.stdoutLines && props.stdoutLines.length > 0) {
    const preview = props.stdoutLines.slice(0, 5);
    for (const line of preview) {
      lines.push(`│   \x1b[90m${line.slice(0, 80)}\x1b[0m`);
    }
    if (props.stdoutLines.length > 5) {
      lines.push(`│   \x1b[90m... (${props.stdoutLines.length - 5} more lines)\x1b[0m`);
    }
  }

  lines.push("└──────────────────────────────────────────────────────────");
  return lines;
}
