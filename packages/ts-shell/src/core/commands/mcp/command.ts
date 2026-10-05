import type { CommandContext, CommandExecutionResult } from "../types.js";
import { parseSyntax } from "../syntax/parse.js";
import { syntaxHelp } from "../syntax/projection.js";
import { mcpSyntax } from "./syntax.js";

export async function runMcpShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(mcpSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /mcp arguments: ${parsed.reason}\n${syntaxHelp(mcpSyntax)}` };
  const mode = parsed.action.name;
  if (mode === "tools" || mode === "doctor" || mode === "refresh") return { kind: "shell-action", action: "show-mcp", mcpAction: mode, mcpTarget: parsed.args[0] };
  return { kind: "shell-action", action: "show-mcp", mcpAction: "status" };
}
