import type { CommandContext, CommandExecutionResult } from "./types.js";

export function runExitCommand(
  _context: CommandContext,
): CommandExecutionResult {
  if (process.stdout.isTTY && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    // Restore normal screen if in Alt-screen
    process.stdout.write("\x1b[?1049l\x1b[?25h\nGoodbye!\n");
  }

  // Only trigger process.exit if not running inside a test environment
  if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
    setTimeout(() => {
      process.exit(0);
    }, 50);
  }
  return {
    kind: "local",
    output: "Exiting session... Goodbye!",
  };
}
