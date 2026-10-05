import type { CommandExecutionResult } from "./types.js";
import { treeSyntax, parseNavigationArgs } from "./navigation/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";

export async function runTreeCommand(args: string[]): Promise<CommandExecutionResult> {
  const parsed = parseNavigationArgs(treeSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /tree arguments: ${parsed.reason}\n${syntaxHelp(treeSyntax)}` };
  if (parsed.action.name === "help") return { kind: "local", output: `${syntaxHelp(treeSyntax)}\n/tree opens the session tree. /tree <entry-id> continues from that entry, keeping other branches and files.` };
  return { kind: "shell-action", action: "navigate-session", ...(parsed.args[0] ? { entryId: parsed.args[0] } : {}) };
}
