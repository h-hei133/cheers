import type { CommandContext, CommandExecutionResult } from "./types.js";

/**
 * `/exit`
 *
 * Returns an action rather than leaving on its own. A command that writes to
 * stdout and then schedules `process.exit` races the host that owns the screen:
 * the raw bytes scroll the frame, the anchor goes stale, and the shell's next
 * prompt lands in the middle of the leftover paint. Only the host knows how to
 * hand the terminal back, so only the host does it.
 */
export function runExitCommand(_context: CommandContext): CommandExecutionResult {
  return { kind: "shell-action", action: "exit-session" };
}
