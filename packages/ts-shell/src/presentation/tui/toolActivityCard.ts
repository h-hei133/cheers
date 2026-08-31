import { truncateToVisualLines } from "./visualTruncate.js";

export type ToolLifecycleState = "pending" | "running" | "completed" | "error";

export interface ToolActivityCardProps {
  readonly toolName: string;
  readonly commandText?: string;
  readonly state: ToolLifecycleState;
  readonly stdoutLines?: readonly string[];
  readonly startTime?: number;
  readonly endTime?: number;
  readonly errorMessage?: string;
  readonly isExpanded?: boolean;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Stateful Tool Activity Card Component
 *
 * Implements:
 * 1. Lifecycle transitions (pending -> running with spinner -> completed with timing -> error)
 * 2. Visual line wrapping and collapsed/expanded tail previewing
 * 3. Formatted duration indicators
 */
export class ToolActivityCard {
  private spinnerIndex = 0;

  render(props: ToolActivityCardProps, width: number = 80): string[] {
    const lines: string[] = [];
    const safeWidth = Math.max(30, width);
    const durationStr = this.formatDuration(props.startTime, props.endTime);

    // 1. Render Header Line based on state
    let headerGlyph = "\x1b[36m●\x1b[0m";
    let statusText = "Ready";

    if (props.state === "pending") {
      headerGlyph = "\x1b[90m○\x1b[0m";
      statusText = "Queued";
    } else if (props.state === "running") {
      this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length;
      headerGlyph = `\x1b[33m${SPINNER_FRAMES[this.spinnerIndex]}\x1b[0m`;
      statusText = "Running";
    } else if (props.state === "completed") {
      headerGlyph = "\x1b[32m✔\x1b[0m";
      statusText = `Completed (${durationStr})`;
    } else if (props.state === "error") {
      headerGlyph = "\x1b[31m✖\x1b[0m";
      statusText = `Failed (${durationStr})`;
    }

    const commandSnippet = props.commandText ? ` \x1b[90m${props.commandText}\x1b[0m` : "";
    lines.push(
      `\x1b[90m┌─\x1b[0m ${headerGlyph} \x1b[1m\x1b[37m${props.toolName}\x1b[0m \x1b[90m[${statusText}]\x1b[0m${commandSnippet}`,
    );

    // 2. Render Output / Error preview if present
    if (props.state === "error" && props.errorMessage) {
      lines.push(`\x1b[90m│\x1b[0m \x1b[31mError: ${props.errorMessage}\x1b[0m`);
    } else if (props.stdoutLines && props.stdoutLines.length > 0) {
      const fullText = props.stdoutLines.join("\n");
      const maxLines = props.isExpanded ? 100 : 5;
      const truncated = truncateToVisualLines(fullText, maxLines, safeWidth - 4);

      if (truncated.skippedCount > 0 && !props.isExpanded) {
        lines.push(`\x1b[90m│ ... (${truncated.skippedCount} earlier lines, Ctrl+O to expand)\x1b[0m`);
      }

      for (const line of truncated.visualLines) {
        lines.push(`\x1b[90m│\x1b[0m ${line}`);
      }
    }

    lines.push(`\x1b[90m└${"─".repeat(safeWidth - 2)}┘\x1b[0m`);
    return lines;
  }

  private formatDuration(start?: number, end?: number): string {
    if (!start) return "0s";
    const elapsedMs = (end ?? Date.now()) - start;
    if (elapsedMs < 1000) return `${elapsedMs}ms`;
    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }
}
