import type { CommandContext, CommandExecutionResult } from "../types.js";
import { syntaxHelp } from "../syntax/projection.js";
import { permissionsSyntax, parsePermissionsArgs } from "./syntax.js";

export async function runPermissionsShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parsePermissionsArgs(args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /permissions arguments: ${parsed.reason}\n${syntaxHelp(permissionsSyntax)}` };
  const mode = parsed.action.name;
  if (mode === "revoke" || mode === "reset") return { kind: "shell-action", action: "manage-permissions", permissionAction: mode, permissionSelector: parsed.args[0] };
  return { kind: "shell-action", action: "manage-permissions", permissionAction: mode === "explain" ? "explain" : "list" };
}
