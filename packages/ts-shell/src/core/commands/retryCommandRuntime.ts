import { rejectArguments } from "./syntax/empty.js";
import type { CommandContext, CommandExecutionResult } from "./types.js";

/**
 * /retry — run the last turn again.
 *
 * A turn can end without finishing for reasons that have nothing to do with the
 * prompt: a dropped connection, a rate limit, an interruption. Retyping the
 * prompt to get past that is busywork, and re-deriving it from the transcript is
 * guesswork — so the host keeps the last submission and this asks for it back.
 *
 * The command itself carries no prompt. Only the host knows whether the last turn
 * actually failed and what it was, and inventing a prompt here would let a retry
 * fire when there is nothing to retry.
 */
export async function runRetryCommand(
  args: string[],
  _context: CommandContext,
): Promise<CommandExecutionResult> {
  const invalid = rejectArguments("retry", args);
  if (invalid) return invalid;
  return { kind: "shell-action", action: "retry-turn" };
}
