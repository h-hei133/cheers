import type { ToolHooks } from '../core/agent/tools.js'
import type { ToolDefinition, ToolExecutionResult } from '../tools/types.js'

export interface GatedToolExecutorHost {
  readonly tools: ReadonlyMap<string, ToolDefinition>
  readonly hooks: ToolHooks
  readonly prepare: (
    tool: ToolDefinition,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  readonly execute: (
    tool: ToolDefinition,
    callId: string,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ) => Promise<{ readonly output: string; readonly isError: boolean; readonly metadata?: Record<string, unknown> }>
}

/**
 * Execute a nested tool invocation (e.g., from `codemode`) through the full
 * host-adapted permission, plan-mode, hook (`PreToolUse`/`PostToolUse`), and
 * preparation lifecycle.
 */
export function createGatedNestedToolExecutor(
  host: GatedToolExecutorHost,
  signal: AbortSignal | undefined,
): (name: string, args: Record<string, unknown>, callId: string) => Promise<ToolExecutionResult> {
  return async (name, rawArgs, callId) => {
    if (name === 'codemode') {
      return { success: false, error: 'Recursive codemode calls are not allowed.' }
    }
    const target = host.tools.get(name)
    if (!target) {
      return { success: false, error: `Unknown tool '${name}'.` }
    }
    const preparedArgs = await host.prepare(target, rawArgs, signal)
    if (host.hooks.beforeToolCall) {
      const verdict = await host.hooks.beforeToolCall(
        {
          assistantMessage: { role: 'assistant', content: '' },
          call: { id: callId, name, args: preparedArgs },
          args: preparedArgs,
        },
        signal,
      )
      if (verdict?.block) {
        return { success: false, error: verdict.reason || `Tool '${name}' was blocked.` }
      }
    }
    const rawResult = await host.execute(target, callId, preparedArgs, signal)
    let output = rawResult.output
    let isError = rawResult.isError
    if (host.hooks.afterToolCall) {
      const post = await host.hooks.afterToolCall(
        {
          assistantMessage: { role: 'assistant', content: '' },
          call: { id: callId, name, args: preparedArgs },
          args: preparedArgs,
          result: { output: rawResult.output, isError: rawResult.isError, metadata: rawResult.metadata },
          isError: rawResult.isError,
        },
        signal,
      )
      if (post?.output !== undefined) output = post.output
      if (post?.isError !== undefined) isError = post.isError
    }
    return isError
      ? { success: false, error: output, metadata: rawResult.metadata }
      : { success: true, output, metadata: rawResult.metadata }
  }
}
