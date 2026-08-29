import type { CommandContext, CommandExecutionResult } from "./types.js";

export function runExitCommand(
  _context: CommandContext,
): CommandExecutionResult {
  if (process.stdout.isTTY) {
    // Restore normal screen if in Alt-screen
    process.stdout.write("\x1b[?1049l\x1b[?25h\nGoodbye!\n");
  }
  // Cleanly exit process
  setTimeout(() => {
    process.exit(0);
  }, 50);

  return {
    kind: "local",
    output: "Exiting session... Goodbye!",
  };
}
