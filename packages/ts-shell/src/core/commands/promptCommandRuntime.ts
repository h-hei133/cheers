import type { CommandContext, CommandExecutionResult } from "./types.js";
import { continueSyntax, parseContinueArgs } from "./navigation/continuation.js";
import { syntaxHelp } from "./syntax/projection.js";

export async function runContinuePromptCommand(
  args: string[],
  context: CommandContext,
): Promise<CommandExecutionResult> {
  const parsed = parseContinueArgs(args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: "local", output: `Invalid /continue arguments: ${parsed.reason}\n${syntaxHelp(continueSyntax)}` };
  return {
    kind: "shell-action",
    action: "continue-session",
    sessionId: parsed.sessionId,
    continuationPrompt: parsed.prompt,
  };
}
