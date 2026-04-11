import path from 'node:path'
import type { PermissionCheck } from '../../sandbox/index.js'
import type { ToolExecutionContext } from '../../tools/types.js'

export function resolveToolTarget(
  args: Record<string, unknown>,
  key: string,
  workspaceRoot: string,
): string {
  const raw = args[key]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }

  return path.isAbsolute(raw) ? raw : path.join(workspaceRoot, raw)
}

export function pathPermission(
  operation: 'read' | 'write' | 'execute',
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): PermissionCheck[] {
  const target = resolveToolTarget(args, 'path', context.workspaceRoot)
  return [{ scope: 'filesystem', operation, target, workspaceRoot: context.workspaceRoot }]
}

export function processPermission(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): PermissionCheck[] {
  const command = typeof args.command === 'string' ? args.command : ''
  return [{ scope: 'process', operation: 'spawn', target: command, workspaceRoot: context.workspaceRoot }]
}
