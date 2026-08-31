import { visibleWidth } from "./compositor.js";

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

/**
 * Slash Command Autocomplete Matcher
 * Detects if current input line begins with `/` and returns filtered suggestions.
 */
export function getSlashCommandSuggestions(inputLine: string): SlashCommandSuggestion[] | null {
  if (!inputLine || typeof inputLine !== "string") {
    return null;
  }

  const trimmed = inputLine.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  // If there's a space after the command, user is typing arguments
  if (trimmed.includes(" ")) {
    return null;
  }

  const query = trimmed.toLowerCase();
  const matched = BUILTIN_SLASH_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(query));

  return matched.length > 0 ? matched : null;
}

/**
 * Formats a floating autocomplete menu component for terminal overlays.
 */
export function renderSlashAutocompleteMenu(
  suggestions: readonly SlashCommandSuggestion[],
  selectedIndex: number = 0,
  width: number = 60,
): string[] {
  if (!suggestions || suggestions.length === 0) return [];

  const safeWidth = Math.max(30, width);
  const lines: string[] = [];

  lines.push(`\x1b[90m┌─ Commands (${suggestions.length}) ${"─".repeat(Math.max(0, safeWidth - 18))}┐\x1b[0m`);

  for (let i = 0; i < Math.min(suggestions.length, 6); i++) {
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

  lines.push(`\x1b[90m└${"─".repeat(safeWidth)}┘\x1b[0m`);
  return lines;
}
