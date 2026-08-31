import { visibleWidth } from "./compositor.js";

/**
 * Claude Code Style TUI Composer & Chrome Renderer
 * (Benchmarked against Oh-My-Pi's `claudeComposerStyle` and Claude Code 2026 CLI)
 *
 * Visual Layout:
 * 1. Top Full-Width Horizontal Rule with Right-Docked Status Chip:
 *    `────────────────────────────────────────── [claude-3.5-sonnet | 12k/200k (6%)] ──`
 * 2. Borderless Input Prompt Area with clean gutter:
 *    `❯ user input text here`
 * 3. Bottom Full-Width Horizontal Rule:
 *    `─────────────────────────────────────────────────────────────────────────────────`
 * 4. Compact Bottom Status / Shortcut Hints:
 *    `? for shortcuts | /help for commands | Ctrl+C to cancel`
 */

export interface ComposerTopChip {
  readonly modelName?: string;
  readonly tokenUsage?: string;
  readonly gitBranch?: string;
  readonly statusText?: string;
}

export interface ClaudeTuiFrameOptions {
  readonly width: number;
  readonly promptText: string;
  readonly gutter?: string;
  readonly chip?: ComposerTopChip;
  readonly bottomHints?: readonly string[];
  readonly isExecuting?: boolean;
  readonly activeToolStatus?: string;
}

export function renderClaudeTuiTopRule(width: number, chip?: ComposerTopChip): string {
  const safeWidth = Math.max(20, width);
  const hChar = "─";

  let chipContent = "";
  if (chip) {
    const parts: string[] = [];
    if (chip.statusText) parts.push(chip.statusText);
    if (chip.modelName) parts.push(`\x1b[36m${chip.modelName}\x1b[0m`);
    if (chip.gitBranch) parts.push(`\x1b[32m⎇ ${chip.gitBranch}\x1b[0m`);
    if (chip.tokenUsage) parts.push(`\x1b[90m${chip.tokenUsage}\x1b[0m`);

    if (parts.length > 0) {
      chipContent = ` [${parts.join(" \x1b[90m│\x1b[0m ")}] `;
    }
  }

  if (!chipContent) {
    return `\x1b[90m${hChar.repeat(safeWidth)}\x1b[0m`;
  }

  const rawChipLen = visibleWidth(chipContent);
  if (rawChipLen >= safeWidth - 4) {
    return `\x1b[90m${hChar.repeat(safeWidth)}\x1b[0m`;
  }

  const leftFill = safeWidth - rawChipLen - 2;
  return `\x1b[90m${hChar.repeat(leftFill)}\x1b[0m${chipContent}\x1b[90m${hChar.repeat(2)}\x1b[0m`;
}

export function renderClaudeTuiPromptRow(width: number, promptText: string, gutter: string = "\x1b[36m❯\x1b[0m "): string[] {
  const rawGutterLen = visibleWidth(gutter);
  const lines = (promptText || " ").split("\n");
  const rendered: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentGutter = i === 0 ? gutter : " ".repeat(rawGutterLen);
    rendered.push(`${currentGutter}${lines[i]}`);
  }

  return rendered;
}

export function renderClaudeTuiBottomRule(width: number): string {
  const safeWidth = Math.max(20, width);
  return `\x1b[90m${"─".repeat(safeWidth)}\x1b[0m`;
}

export function renderClaudeTuiBottomBar(hints?: readonly string[]): string {
  const defaultHints = ["/help for commands", "Ctrl+C to cancel", "Ctrl+T thinking"];
  const activeHints = hints && hints.length > 0 ? hints : defaultHints;
  return `\x1b[90m ${activeHints.join("  │  ")} \x1b[0m`;
}

export function renderClaudeTuiFrame(options: ClaudeTuiFrameOptions): string[] {
  const width = options.width || 80;
  const frame: string[] = [];

  // 1. Top Rule with Status Chip
  frame.push(renderClaudeTuiTopRule(width, options.chip));

  // 2. Active Tool Status (if currently executing)
  if (options.isExecuting && options.activeToolStatus) {
    frame.push(` \x1b[33m⠋\x1b[0m \x1b[1m${options.activeToolStatus}\x1b[0m`);
  }

  // 3. Prompt Area
  const promptRows = renderClaudeTuiPromptRow(width, options.promptText, options.gutter);
  frame.push(...promptRows);

  // 4. Bottom Rule
  frame.push(renderClaudeTuiBottomRule(width));

  // 5. Bottom Hint Bar
  frame.push(renderClaudeTuiBottomBar(options.bottomHints));

  return frame;
}
