import { renderDiff } from "./components/diff.js";
import { defaultTheme } from "../theme/theme.js";
import { visibleWidth } from "./utils.js";
export type TranscriptItemType = "user" | "command" | "assistant" | "tool";

export interface TranscriptItem {
  readonly id: string;
  readonly type: TranscriptItemType;
  readonly title?: string;
  readonly content: string;
  readonly timestamp: string;
}

/**
 * Unified Transcript Container for Interactive TUI Sessions
 *
 * Persists and formats historical session entries in memory:
 * 1. User submitted prompts
 * 2. Slash command output results (e.g. /help, /cost, /context, /undo)
 * 3. Assistant responses & tool execution cards
 *
 * Ensures all history stays visible at the top and is NEVER overwritten by bottom repaints.
 */
export class TranscriptContainer {
  private readonly items: TranscriptItem[] = [];

  appendUserPrompt(promptText: string): void {
    this.items.push({
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "user",
      content: promptText,
      timestamp: new Date().toISOString(),
    });
  }

  appendCommandResult(commandName: string, outputText: string): void {
    this.items.push({
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "command",
      title: commandName,
      content: outputText,
      timestamp: new Date().toISOString(),
    });
  }

  appendAssistantResponse(text: string): void {
    this.items.push({
      id: `ast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "assistant",
      content: text,
      timestamp: new Date().toISOString(),
    });
  }

  appendToolResult(toolName: string, resultText: string, isDiff: boolean = false): void {
    this.items.push({
      id: `tol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: "tool",
      title: toolName,
      content: isDiff ? renderDiff(resultText) : resultText,
      timestamp: new Date().toISOString(),
    });
  }

  getItems(): readonly TranscriptItem[] {
    return this.items;
  }

  clear(): void {
    this.items.length = 0;
  }

  render(width: number = 80, maxLines?: number): string[] {
    const lines: string[] = [];
    const safeWidth = Math.max(30, width);

    for (const item of this.items) {
      if (item.type === "user") {
        const prefix = `  \x1b[36m❯\x1b[0m \x1b[1m\x1b[37m${item.content}\x1b[0m`;
        const contentLen = visibleWidth(`  ❯ ${item.content}`);
        const pad = Math.max(0, safeWidth - contentLen);
        const paddedLine = `\x1b[48;5;236m${prefix}${" ".repeat(pad)}\x1b[0m`;

        lines.push(`\x1b[48;5;236m${" ".repeat(safeWidth)}\x1b[0m`);
        lines.push(paddedLine);
        lines.push(`\x1b[48;5;236m${" ".repeat(safeWidth)}\x1b[0m`);
        lines.push("");
      } else if (item.type === "command") {
        const title = item.title ? ` \x1b[90m[${item.title}]\x1b[0m` : "";
        lines.push(`\x1b[35m⚡\x1b[0m\x1b[1m Command Output\x1b[0m${title}`);
        for (const line of item.content.split("\n")) {
          lines.push(`  ${line}`);
        }
        lines.push("");
      } else if (item.type === "assistant") {
        for (const line of item.content.split("\n")) {
          lines.push(line);
        }
        lines.push("");
      } else if (item.type === "tool") {
        const title = item.title ?? "Tool";
        lines.push(`\x1b[32m✔\x1b[0m \x1b[1m${title}\x1b[0m:`);
        for (const line of item.content.split("\n")) {
          lines.push(`  ${line}`);
        }
        lines.push("");
      }
    }

    if (maxLines && maxLines > 0 && lines.length > maxLines) {
      return lines.slice(-maxLines);
    }

    return lines;
  }
}
