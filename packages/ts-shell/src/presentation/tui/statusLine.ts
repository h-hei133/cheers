import { visibleWidth } from "./compositor.js";

export interface StatusLineState {
  readonly modelName?: string;
  readonly gitBranch?: string;
  readonly projectDir?: string;
  readonly usedTokens?: number;
  readonly contextWindow?: number;
  readonly costUsd?: number;
  readonly statusText?: string;
}

/**
 * Renders a compact, priority-ranked multi-segment status line.
 * Automatically condenses segments to prevent line-wrapping when width is constrained.
 */
export function formatStatusLine(state: StatusLineState, maxWidth: number = 80): string {
  const segments: string[] = [];

  // Segment 1: Active Status Glyph / Indicator
  if (state.statusText) {
    segments.push(`\x1b[33m●\x1b[0m ${state.statusText}`);
  }

  // Segment 2: Active Model Name
  if (state.modelName) {
    segments.push(`\x1b[36m${state.modelName}\x1b[0m`);
  }

  // Segment 3: Git Branch Context
  if (state.gitBranch) {
    segments.push(`\x1b[32m⎇ ${state.gitBranch}\x1b[0m`);
  }

  // Segment 4: Working Directory Name
  if (state.projectDir) {
    segments.push(`\x1b[90m${state.projectDir}\x1b[0m`);
  }

  // Segment 5: Context Window Usage with 3-tier warning thresholds (50% / 70% / 90%)
  if (state.usedTokens != null && state.contextWindow != null && state.contextWindow > 0) {
    const percent = Math.round((state.usedTokens / state.contextWindow) * 100);
    const kUsed = Math.round(state.usedTokens / 1000);
    const kTotal = Math.round(state.contextWindow / 1000);
    const color = percent >= 90 ? "\x1b[31m" : percent >= 70 ? "\x1b[35m" : percent >= 50 ? "\x1b[33m" : "\x1b[90m";
    segments.push(`${color}${kUsed}k/${kTotal}k (${percent}%)\x1b[0m`);
  }

  // Segment 6: Cost Telemetry
  if (state.costUsd != null && state.costUsd > 0) {
    segments.push(`\x1b[90m$${state.costUsd.toFixed(4)}\x1b[0m`);
  }

  const separator = " \x1b[90m│\x1b[0m ";
  let line = segments.join(separator);

  // If line exceeds maxWidth, drop lower priority segments from right
  while (visibleWidth(line) > maxWidth && segments.length > 2) {
    segments.pop();
    line = segments.join(separator);
  }

  return line;
}
