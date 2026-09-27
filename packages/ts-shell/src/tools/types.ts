import type { PermissionCheck } from '../sandbox/index.js'
import type { SubagentRunner } from '../core/subagents/runner.js'

export interface ToolExecutionContext {
  readonly taskId: string
  readonly workspaceRoot: string
  readonly sessionId?: string
  readonly correlationId?: string
  readonly abortSignal?: AbortSignal
  /**
   * What a command this tool runs should know about the session it runs in.
   *
   * Supplied by the turn rather than read here, because the values name the
   * model that is answering and only the layer that resolved it knows.
   */
  readonly commandEnv?: Readonly<Record<string, string>>
  /**
   * Called with output as a command produces it.
   *
   * A long command that reports nothing until it exits is indistinguishable from
   * one that has hung. Chunks arrive as they are written, not at the end.
   */
  readonly onOutput?: (chunk: string) => void
  /**
   * How to run a subagent, for the tool that delegates to one.
   *
   * Supplied by the turn because running one needs the model side — the
   * provider, the transport, the step function — and this layer has none of it.
   * Absent means delegation is not available, which the tool reports rather than
   * faking a completion.
   */
  readonly runSubagent?: SubagentRunner
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
