import { visibleWidth } from "./utils.js";

export interface SlashCommandSuggestion {
  readonly name: string;
  readonly description: string;
}

export const BUILTIN_SLASH_COMMANDS: readonly SlashCommandSuggestion[] = [
  { name: "/help", description: "Show available slash commands and keybindings" },
  { name: "/model", description: "Display or switch the active LLM provider and model" },
  { name: "/cost", description: "Show session token usage and estimated cost telemetry" },
  { name: "/context", description: "Display live context window usage breakdown" },
  { name: "/compact", description: "Trigger intelligent conversation summarization and compaction" },
  { name: "/undo", description: "Revert the last filesystem modifications made by the agent" },
  { name: "/clear", description: "Clear current terminal screen and session state" },
  { name: "/fast", description: "Toggle fast model sampling mode (lower temperature)" },
  { name: "/connect", description: "Manage LLM provider credentials and connections" },
  { name: "/doctor", description: "Diagnose workspace environment, tools, and runtime health" },
  { name: "/exit", description: "Exit the interactive CLI session" },
];

function scoreSlashCommand(rawQuery: string, cmd: SlashCommandSuggestion): number {
  const query = rawQuery.replace(/^\/+/, "").toLowerCase().trim();
  const cmdName = cmd.name.replace(/^\/+/, "").toLowerCase();
  const desc = cmd.description.toLowerCase();

  if (!query) return 100;

  // 1. Exact match
  if (cmdName === query) return 1000;

  // 2. Prefix match
  if (cmdName.startsWith(query)) return 900;

  // 3. Substring match
  if (cmdName.includes(query)) return 700;

  // 4. Subsequence fuzzy match
  let qIdx = 0;
  let gapPenalty = 0;
  let lastMatchIdx = -1;

  for (let cIdx = 0; cIdx < cmdName.length && qIdx < query.length; cIdx++) {
    if (cmdName[cIdx] === query[qIdx]) {
      if (lastMatchIdx !== -1) {
        gapPenalty += Math.max(0, cIdx - lastMatchIdx - 1) * 10;
      }
      lastMatchIdx = cIdx;
      qIdx++;
    }
  }

  if (qIdx === query.length) {
    return Math.max(400, 600 - gapPenalty);
  }

  // 5. Description keyword match
  if (desc.includes(query)) return 300;

  return 0;
}

/**
 * Tiered Fuzzy Slash Command Matcher
 * Supports prefix, substring, and subsequence matching.
 */
export function getSlashCommandSuggestions(inputLine: string): SlashCommandSuggestion[] | null {
  if (!inputLine || typeof inputLine !== "string") {
    return null;
  }

  const trimmed = inputLine.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // If there's a space after the command name, user is typing arguments
  if (trimmed.includes(" ")) {
    return null;
  }

  const scored = BUILTIN_SLASH_COMMANDS.map((cmd) => ({
    cmd,
    score: scoreSlashCommand(trimmed, cmd),
  })).filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored.map((item) => item.cmd) : null;
}

/**
 * Formats a floating autocomplete menu component for terminal overlays.
 */
export function renderSlashAutocompleteMenu(
  suggestions: readonly SlashCommandSuggestion[],
  selectedIndex: number = 0,
  width: number = 60,
  maxVisible: number = 5,
): string[] {
  if (!suggestions || suggestions.length === 0) return [];

  const safeWidth = Math.max(30, width);
  const lines: string[] = [];

  lines.push(`\x1b[90m┌─ Commands (${suggestions.length}) ${"─".repeat(Math.max(0, safeWidth - 18))}┐\x1b[0m`);

  const count = Math.min(suggestions.length, maxVisible);
  for (let i = 0; i < count; i++) {
    const item = suggestions[i];
    const isSelected = i === selectedIndex;
    const cursor = isSelected ? "\x1b[36m❯\x1b[0m" : " ";
    const nameStr = isSelected ? `\x1b[1m\x1b[36m${item.name.padEnd(12)}\x1b[0m` : `\x1b[37m${item.name.padEnd(12)}\x1b[0m`;
    const descStr = `\x1b[90m${item.description}\x1b[0m`;

    const rowContent = `${cursor} ${nameStr} ${descStr}`;
    const rowLen = visibleWidth(rowContent);
    const pad = Math.max(0, safeWidth - 2 - rowLen);

    lines.push(`\x1b[90m│\x1b[0m ${rowContent}${" ".repeat(pad)}\x1b[90m│\x1b[0m`);
  }

  if (suggestions.length > count) {
    const remaining = suggestions.length - count;
    const scrollNotice = `↓ ${remaining} more`;
    const noticeWidth = visibleWidth(scrollNotice);
    const pad = Math.max(0, safeWidth - 4 - noticeWidth);
    lines.push(`\x1b[90m│\x1b[0m  \x1b[36m${scrollNotice}\x1b[0m${" ".repeat(pad)}\x1b[90m│\x1b[0m`);
  }

  lines.push(`\x1b[90m└${"─".repeat(safeWidth)}┘\x1b[0m`);
  return lines;
}
