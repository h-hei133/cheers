import type { CommandContext, ShellActionResult } from './types.js'

export async function runCancelShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'cancel-run',
  }
}

export async function runSessionsShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'list-sessions',
  }
}

export async function runMcpShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'show-mcp',
  }
}

export async function runHelpShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'show-help',
  }
}
