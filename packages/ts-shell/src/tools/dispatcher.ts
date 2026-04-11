import type { SandboxEnforcer } from '../sandbox/sandboxEnforcer.js'
import type { RuntimeConfig } from '../config/runtimeConfig.js'
import type { CoreMcpGateway } from '../core/mcp/gateway.js'
import type { McpToolDescriptor } from '../core/mcp/types.js'
import { ToolRuntime } from '../core/tools/runtime.js'
import type { ToolExecutionContext, ToolExecutionResult } from './types.js'

export class ToolDispatcher {
  private readonly runtime: ToolRuntime

  constructor(
    enforcer: SandboxEnforcer,
    options?: {
      mcpTools?: readonly McpToolDescriptor[]
      mcpGateway?: CoreMcpGateway
      runtimeConfig?: RuntimeConfig
    },
  ) {
    this.runtime = new ToolRuntime(enforcer, options)
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
    return this.runtime.execute(toolName, args, context)
  }
}
