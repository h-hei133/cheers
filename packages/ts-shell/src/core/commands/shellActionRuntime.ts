import type { CommandContext, ShellActionResult } from './types.js'

export async function runCancelShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'cancel-run',
  }
}

export async function runPwdShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'show-workspace',
    workspaceAction: 'status',
  }
}

export async function runHelpShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'show-help',
  }
}

export { runWorkspaceShellAction, runCdShellAction } from "./workspace/command.js";
export { runMcpShellAction } from "./mcp/command.js";
export { runPermissionsShellAction } from "./permissions/command.js";
export { runViewShellAction } from "./view/command.js";
