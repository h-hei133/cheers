import { visibleWidth } from "./compositor.js";
import { formatStatusLine, type StatusLineState } from "./statusLine.js";

/**
 * Full Box Composer Layout Renderer
 *
 * Implements:
 * 1. Top border with title (`╭─── [title] ───╮`)
 * 2. Enclosed prompt row (`│ ❯ prompt text  │`)
 * 3. Bottom border embedded with multi-segment status line (`╰─── [model │ cwd │ branch │ 12k/64k (18%)] ───╯`)
 * 4. Micro hint bar below box (` /help for commands │ Ctrl+C cancel `)
 */

export interface BoxComposerOptions {
  readonly width: number;
  readonly promptText: string;
  readonly gutter?: string;
  readonly title?: string;
  readonly status?: StatusLineState;
  readonly bottomHints?: readonly string[];
  readonly isExecuting?: boolean;
  readonly activeToolStatus?: string;
}

export function renderBoxTop(width: number, title?: string): string {
  const safeWidth = Math.max(20, width);
  const topLeft = "╭─";
  const topRight = "─╮";

  if (!title) {
    return `\x1b[90m${topLeft}${"─".repeat(safeWidth - 4)}${topRight}\x1b[0m`;
  }

  const titleContent = ` \x1b[1m\x1b[36m${title}\x1b[0m `;
  const rawTitleWidth = visibleWidth(titleContent);
  const fillWidth = Math.max(0, safeWidth - 4 - rawTitleWidth);

  return `\x1b[90m${topLeft}\x1b[0m${titleContent}\x1b[90m${"─".repeat(fillWidth)}${topRight}\x1b[0m`;
}

export function renderBoxRows(width: number, promptText: string, gutter: string = "\x1b[36m❯\x1b[0m "): string[] {
  const safeWidth = Math.max(20, width);
  const rawGutterLen = visibleWidth(gutter);
  const contentWidth = Math.max(10, safeWidth - 4 - rawGutterLen);

  const lines = (promptText || " ").split("\n");
  const rendered: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentGutter = i === 0 ? gutter : " ".repeat(rawGutterLen);
    const lineText = lines[i];
    const textLen = visibleWidth(lineText);
    const pad = Math.max(0, contentWidth - textLen);
    const safeText = textLen > contentWidth ? lineText.slice(0, contentWidth) : lineText;

    rendered.push(
      `\x1b[90m│\x1b[0m ${currentGutter}${safeText}${" ".repeat(pad)} \x1b[90m│\x1b[0m`,
    );
  }

  return rendered;
}

export function renderBoxBottom(width: number, status?: StatusLineState): string {
  const safeWidth = Math.max(20, width);
  const bottomLeft = "╰─";
  const bottomRight = "─╯";

  if (!status) {
    return `\x1b[90m${bottomLeft}${"─".repeat(safeWidth - 4)}${bottomRight}\x1b[0m`;
  }

  const statusText = ` ${formatStatusLine(status, safeWidth - 8)} `;
  const rawStatusWidth = visibleWidth(statusText);
  const fillWidth = Math.max(0, safeWidth - 4 - rawStatusWidth);

  return `\x1b[90m${bottomLeft}\x1b[0m${statusText}\x1b[90m${"─".repeat(fillWidth)}${bottomRight}\x1b[0m`;
}

export function renderBoxFrame(options: BoxComposerOptions): string[] {
  const width = options.width || 80;
  const frame: string[] = [];

  // 1. Top border
  frame.push(renderBoxTop(width, options.title));

  // 2. Active tool execution banner if executing
  if (options.isExecuting && options.activeToolStatus) {
    const toolMsg = ` \x1b[33m⠋\x1b[0m \x1b[1m${options.activeToolStatus}\x1b[0m`;
    frame.push(`\x1b[90m│\x1b[0m ${toolMsg}`);
  }

  // 3. Prompt interior
  frame.push(...renderBoxRows(width, options.promptText, options.gutter));

  // 4. Bottom border with embedded status line
  frame.push(renderBoxBottom(width, options.status));

  // 5. Micro hint bar
  const defaultHints = ["/help for commands", "Ctrl+C to cancel", "Tab autocomplete"];
  const hints = options.bottomHints && options.bottomHints.length > 0 ? options.bottomHints : defaultHints;
  frame.push(`\x1b[90m ${hints.join("  │  ")} \x1b[0m`);

  return frame;
}
