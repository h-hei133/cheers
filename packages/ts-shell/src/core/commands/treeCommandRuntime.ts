import type { CommandExecutionResult } from "./types.js";

export async function runTreeCommand(args: string[]): Promise<CommandExecutionResult> {
  if (args.length > 1 || args[0] === "help" || args[0] === "--help") {
    return { kind: "local", output: "/tree opens the session tree. /tree <entry-id> continues from that entry, keeping other branches and files." };
  }
  return { kind: "shell-action", action: "navigate-session", ...(args[0] ? { entryId: args[0] } : {}) };
}
