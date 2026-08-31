import { keybindings } from "./keybindings.js";

/**
 * Platform-Adaptive Keybinding Hints
 *
 * Formats shortcuts adaptively for macOS (Option/Cmd) vs Linux/Windows (Alt/Ctrl).
 */

export function formatKeyLabel(keyId: string): string {
  const isMac = process.platform === "darwin";
  const parts = keyId.split("+");

  const formattedParts = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === "ctrl") return "Ctrl";
    if (lower === "alt") return isMac ? "Option" : "Alt";
    if (lower === "meta" || lower === "super") return isMac ? "Cmd" : "Win";
    if (lower === "shift") return "Shift";
    if (lower === "escape") return "Esc";
    if (lower === "enter") return "Enter";
    if (lower === "backspace") return "Backspace";
    return part.toUpperCase();
  });

  return formattedParts.join("+");
}

export function keyHint(action: string, description: string): string {
  const keys = keybindings.getKeysForAction(action);
  const primaryKey = keys[0] ?? "";
  const keyLabel = primaryKey ? formatKeyLabel(primaryKey) : "";

  return `\x1b[90m[\x1b[0m\x1b[36m${keyLabel}\x1b[0m\x1b[90m: ${description}]\x1b[0m`;
}
