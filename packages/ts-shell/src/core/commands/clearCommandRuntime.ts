import type { CommandContext, ShellActionResult } from "./types.js";

/**
 * /clear (aliases: /reset, /cls) — start over.
 *
 * Clearing is a session boundary, not a screen wipe. The old behaviour wrote the
 * clear sequences itself and then reported success, which left the command's own
 * echo and its answer sitting on the screen it had just cleared — and kept the
 * same session, so the transcript came back the next time the session was opened.
 *
 * The host owns all three parts now: a new session, an empty transcript, and a
 * screen with nothing on it. Nothing is written here, because anything written
 * here would be the residue.
 */
export function runClearCommand(_args: string[], _context: CommandContext): ShellActionResult {
  return { kind: "shell-action", action: "clear-session" };
}
