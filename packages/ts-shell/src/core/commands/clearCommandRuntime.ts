import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /clear (aliases: /reset, /cls)
 * Resets the session context and clears the terminal screen while keeping the current project workspace binding.
 */
export async function runClearCommand(
  _args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const isTty = process.stdout.isTTY && !process.env.VITEST && process.env.NODE_ENV !== "test";
  if (isTty) {
    // Clear terminal screen and scrollback buffer
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  }

  return {
    kind: "local",
    output: "Session conversation cleared. Starting a fresh conversation context.",
  };
}
