import { rejectArguments } from "./syntax/empty.js";
import type { CommandContext, CommandExecutionResult } from './types.js'

export async function runCancelShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const invalid = rejectArguments("cancel", args);
  if (invalid) return invalid;
  return {
    kind: 'shell-action',
    action: 'cancel-run',
  }
}

export async function runPwdShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const invalid = rejectArguments("pwd", args);
  if (invalid) return invalid;
  return {
    kind: 'shell-action',
    action: 'show-workspace',
    workspaceAction: 'status',
  }
}

export async function runHelpShellAction(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const invalid = rejectArguments("help", args);
  if (invalid) return invalid;
  return {
    kind: 'shell-action',
    action: 'show-help',
  }
}

export { runWorkspaceShellAction, runCdShellAction } from "./workspace/command.js";
export { runMcpShellAction } from "./mcp/command.js";
export { runPermissionsShellAction } from "./permissions/command.js";
export { runViewShellAction } from "./view/command.js";
