import type { PermissionCheck } from '../sandbox/index.js'
import type {
  ToolReportSafeProjection,
  ToolResultDetails,
} from './result/split.js'

export interface ToolExecutionContext {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly sessionId?: string
  readonly correlationId?: string
  readonly abortSignal?: AbortSignal
  /**
   * Called with output as a command produces it.
   *
   * A long command that reports nothing until it exits is indistinguishable from
   * one that has hung. Chunks arrive as they are written, not at the end.
   */
  readonly onOutput?: (chunk: string) => void
  readonly interactiveAsk?: (
    questions: Array<{
      id: string
      question: string
      options?: Array<{ label: string; description?: string }>
      recommended?: number
    }>,
  ) => Promise<Record<string, string>>
}

export interface ToolExecutionResult {
  readonly success: boolean
  readonly output?: string
  readonly error?: string
  readonly metadata?: Record<string, unknown>
  readonly content?: string
  readonly details?: ToolResultDetails
  readonly reportSafe?: ToolReportSafeProjection
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
  | 'browser.observe'
  | 'browser.extract'
  | 'browser.click'
  | 'browser.type'

export const MVP_TOOL_ALLOWLIST: ReadonlySet<MvpToolName> = new Set([
  'read',
  'write',
  'edit',
  'glob',
  'bash',
  'git-status',
  'git-diff',
  'browser.observe',
  'browser.extract',
  'browser.click',
  'browser.type',
])

export function isAllowlistedTool(toolName: string): toolName is MvpToolName {
  return MVP_TOOL_ALLOWLIST.has(toolName as MvpToolName)
}
