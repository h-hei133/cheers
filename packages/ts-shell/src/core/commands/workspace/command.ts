import type { CommandContext, CommandExecutionResult } from "../types.js";
import { parseSyntax } from "../syntax/parse.js";
import { syntaxHelp } from "../syntax/projection.js";
import { cdSyntax, workspaceSyntax } from "./syntax.js";

export async function runWorkspaceShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(workspaceSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /workspace arguments: ${parsed.reason}\n${syntaxHelp(workspaceSyntax)}` };
  const mode = parsed.action.name;
  if (mode === "attach") return { kind: "shell-action", action: "show-workspace", workspaceAction: "attach", workspaceTarget: parsed.args[0] };
  return { kind: "shell-action", action: "show-workspace", workspaceAction: mode === "recent" ? "recent" : "status" };
}

export async function runCdShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(cdSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /cd arguments: ${parsed.reason}\n${syntaxHelp(cdSyntax)}` };
  const target = parsed.args[0];
  return target ? { kind: "shell-action", action: "show-workspace", workspaceAction: "attach", workspaceTarget: target }
    : { kind: "shell-action", action: "show-workspace", workspaceAction: "status" };
}
