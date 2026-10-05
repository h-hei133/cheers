import type { CommandContext, CommandExecutionResult } from "../types.js";
import { syntaxHelp } from "../syntax/projection.js";
import { parseSyntax } from "../syntax/parse.js";
import { viewSyntax } from "./syntax.js";

export async function runViewShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(viewSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /view arguments: ${parsed.reason}\n${syntaxHelp(viewSyntax)}` };
  const mode = parsed.action.name;
  return mode === "status" ? { kind: "shell-action", action: "show-view" }
    : { kind: "shell-action", action: "set-view", viewMode: mode === "user" ? "compact" : "verbose" };
}
