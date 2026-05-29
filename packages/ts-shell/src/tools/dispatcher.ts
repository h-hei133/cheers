import type { SandboxEnforcer } from '../sandbox/sandboxEnforcer.js'
import type { RuntimeConfig } from '../config/runtimeConfig.js'
import type { PwRuntimeStatus } from '../core/context/pwRuntime.js'
import type { CoreMcpGateway } from '../core/mcp/gateway.js'
import type { McpToolDescriptor } from '../core/mcp/types.js'
import { ToolRuntime } from '../core/tools/runtime.js'
import {
  createBlockedToolInterceptionResult,
  createToolInterceptionIntent,
  shouldPreventToolExecution,
  type ToolBeforePolicyDecision,
  type ToolInterceptionIntent,
} from './interception.js'
import type { ToolExecutionContext, ToolExecutionResult } from './types.js'

export type ToolInterceptionPolicy = (
  intent: ToolInterceptionIntent,
) => ToolBeforePolicyDecision | undefined

export class ToolDispatcher {
  private readonly runtime: ToolRuntime
  private readonly interceptionPolicy?: ToolInterceptionPolicy

  constructor(
    enforcer: SandboxEnforcer,
    options?: {
      mcpTools?: readonly McpToolDescriptor[]
      mcpGateway?: CoreMcpGateway
      runtimeConfig?: RuntimeConfig
      browserRuntimeStatus?: PwRuntimeStatus
      interceptionPolicy?: ToolInterceptionPolicy
    },
  ) {
    this.runtime = new ToolRuntime(enforcer, options)
    this.interceptionPolicy = options?.interceptionPolicy
  }

  listTools(): readonly string[] {
    return this.runtime.listTools()
  }

  listVisibleTools(): readonly string[] {
    return this.runtime.listVisibleTools()
  }

  async dispatch(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const intent = createToolInterceptionIntent({
      toolId: toolName,
      toolKind: toolName.startsWith('mcp__') ? 'mcp' : 'core-tool',
      caller: 'tool-dispatcher',
      operationKind: 'tool.dispatch',
      requestedActionSummary: `Dispatch tool '${toolName}' with input keys: ${Object.keys(args).sort().join(',')}`,
      authorityMode: 'unknown-transitional',
      riskLevel: toolName === 'bash' ? 'high' : 'unknown',
      input: args,
    })
    const policyDecision = this.interceptionPolicy?.(intent)
    if (policyDecision && shouldPreventToolExecution(policyDecision)) {
      return createBlockedToolInterceptionResult(policyDecision)
    }
    return this.runtime.execute(toolName, args, context)
  }
}
