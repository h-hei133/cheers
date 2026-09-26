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

/**
 * Stopping a process group, which is a process operation like starting one.
 *
 * It is checked even though the command was already approved when it started:
 * the approval covered running that command, not an open licence to end any
 * process the session later names, and a stop reaches whatever the group has
 * since spawned.
 */
export function processStopPermission(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): PermissionCheck[] {
  const target = typeof args.taskId === 'string' ? args.taskId : ''
  return [{ scope: 'process', operation: 'kill', target, workspaceRoot: context.workspaceRoot }]
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
