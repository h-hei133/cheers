export interface StatusLineState {
  readonly modelName?: string;
  readonly gitBranch?: string;
  readonly usedTokens?: number;
  readonly contextWindow?: number;
  readonly costUsd?: number;
  readonly statusText?: string;
}

/**
 * Renders an informative, compact status line adhering to Claude Code / OMP style.
 */
export function formatStatusLine(state: StatusLineState): string {
  const parts: string[] = [];

  if (state.statusText) {
    parts.push(`\x1b[33m●\x1b[0m ${state.statusText}`);
  }

  if (state.modelName) {
    parts.push(`\x1b[36m${state.modelName}\x1b[0m`);
  }

  if (state.gitBranch) {
    parts.push(`\x1b[32m⎇ ${state.gitBranch}\x1b[0m`);
  }

  if (state.usedTokens != null && state.contextWindow != null && state.contextWindow > 0) {
    const percent = Math.round((state.usedTokens / state.contextWindow) * 100);
    const kUsed = Math.round(state.usedTokens / 1000);
    const kTotal = Math.round(state.contextWindow / 1000);
    const color = percent > 80 ? "\x1b[31m" : percent > 50 ? "\x1b[33m" : "\x1b[90m";
    parts.push(`${color}${kUsed}k/${kTotal}k (${percent}%)\x1b[0m`);
  }

  if (state.costUsd != null && state.costUsd > 0) {
    parts.push(`\x1b[90m$${state.costUsd.toFixed(4)}\x1b[0m`);
  }

  const separator = " \x1b[90m│\x1b[0m ";
  return parts.join(separator);
}
