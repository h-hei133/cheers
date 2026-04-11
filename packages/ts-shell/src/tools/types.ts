import type { PermissionCheck } from '../sandbox/index.js'

export interface ToolExecutionContext {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly sessionId?: string
  readonly correlationId?: string
}

export interface ToolExecutionResult {
  readonly success: boolean
  readonly output?: string
  readonly error?: string
  readonly metadata?: Record<string, unknown>
}

export interface ToolPermissionRequirements {
  check(args: Record<string, unknown>, context: ToolExecutionContext): PermissionCheck[]
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly argsSchema: Record<string, unknown>
  readonly permissions: ToolPermissionRequirements
  execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>
}

export type MvpToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'glob'
  | 'bash'
  | 'git-status'
  | 'git-diff'

export const MVP_TOOL_ALLOWLIST: ReadonlySet<MvpToolName> = new Set([
  'read',
  'write',
  'edit',
  'glob',
  'bash',
  'git-status',
  'git-diff',
])

export function isAllowlistedTool(toolName: string): toolName is MvpToolName {
  return MVP_TOOL_ALLOWLIST.has(toolName as MvpToolName)
}
