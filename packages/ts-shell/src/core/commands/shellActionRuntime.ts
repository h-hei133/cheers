import type { CommandContext, ShellActionResult } from './types.js'

export async function runCancelShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'cancel-run',
  }
}

export async function runWorkspaceShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  const mode = _args[0]?.trim().toLowerCase()
  const target = _args.slice(1).join(' ').trim() || undefined

  if (!mode || mode === 'status' || mode === 'current') {
    return {
      kind: 'shell-action',
      action: 'show-workspace',
      workspaceAction: 'status',
    }
  }

  if (mode === 'attach' || mode === 'switch' || mode === 'use') {
    return {
      kind: 'shell-action',
      action: 'show-workspace',
      workspaceAction: 'attach',
      workspaceTarget: target,
    }
  }

  if (mode === 'recent' || mode === 'projects') {
    return {
      kind: 'shell-action',
      action: 'show-workspace',
      workspaceAction: 'recent',
    }
  }

  return {
    kind: 'shell-action',
    action: 'show-workspace',
    workspaceAction: 'status',
  }
}

export async function runCdShellAction(args: string[], _context: CommandContext): Promise<ShellActionResult> {
  const target = args.join(' ').trim()
  if (!target) {
    return {
      kind: 'shell-action',
      action: 'show-workspace',
      workspaceAction: 'status',
    }
  }

  return {
    kind: 'shell-action',
    action: 'show-workspace',
    workspaceAction: 'attach',
    workspaceTarget: target,
  }
}

export async function runPwdShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'show-workspace',
    workspaceAction: 'status',
  }
}

export async function runMcpShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  const mode = _args[0]?.trim().toLowerCase()
  const target = _args.slice(1).join(' ').trim() || undefined

  if (!mode || mode === 'status') {
    return {
      kind: 'shell-action',
      action: 'show-mcp',
      mcpAction: 'status',
    }
  }

  if (mode === 'tools') {
    return {
      kind: 'shell-action',
      action: 'show-mcp',
      mcpAction: 'tools',
      mcpTarget: target,
    }
  }

  if (mode === 'doctor' || mode === 'diagnose') {
    return {
      kind: 'shell-action',
      action: 'show-mcp',
      mcpAction: 'doctor',
      mcpTarget: target,
    }
  }

  if (mode === 'refresh' || mode === 'reconnect') {
    return {
      kind: 'shell-action',
      action: 'show-mcp',
      mcpAction: 'refresh',
      mcpTarget: target,
    }
  }

  return {
    kind: 'shell-action',
    action: 'show-mcp',
    mcpAction: 'status',
  }
}

export async function runHelpShellAction(_args: string[], _context: CommandContext): Promise<ShellActionResult> {
  return {
    kind: 'shell-action',
    action: 'show-help',
  }
}

export async function runViewShellAction(args: string[], _context: CommandContext): Promise<ShellActionResult> {
  const mode = args[0]?.trim().toLowerCase()
  if (!mode || mode === 'status') {
    return {
      kind: 'shell-action',
      action: 'show-view',
    }
  }

  if (mode === 'compact' || mode === 'user') {
    return {
      kind: 'shell-action',
      action: 'set-view',
      viewMode: 'compact',
    }
  }

  if (mode === 'verbose' || mode === 'developer' || mode === 'dev') {
    return {
      kind: 'shell-action',
      action: 'set-view',
      viewMode: 'verbose',
    }
  }

  return {
    kind: 'shell-action',
    action: 'show-help',
  }
}

export async function runPermissionsShellAction(args: string[], _context: CommandContext): Promise<ShellActionResult> {
  const mode = args[0]?.trim().toLowerCase()

  if (!mode || mode === 'list' || mode === 'status') {
    return {
      kind: 'shell-action',
      action: 'manage-permissions',
      permissionAction: 'list',
    }
  }

  if (mode === 'explain') {
    return {
      kind: 'shell-action',
      action: 'manage-permissions',
      permissionAction: 'explain',
    }
  }

  if (mode === 'revoke' || mode === 'remove') {
    return {
      kind: 'shell-action',
      action: 'manage-permissions',
      permissionAction: 'revoke',
      permissionSelector: args[1],
    }
  }

  if (mode === 'reset' || mode === 'clear') {
    return {
      kind: 'shell-action',
      action: 'manage-permissions',
      permissionAction: 'reset',
      permissionSelector: args[1],
    }
  }

  return {
    kind: 'shell-action',
    action: 'manage-permissions',
    permissionAction: 'list',
  }
}
