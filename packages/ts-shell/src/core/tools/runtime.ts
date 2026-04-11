import { createBackpressureController } from '../../runtime/backpressure.js'
import { createComponentLogger, recordCount } from '../../observability/index.js'
import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import type { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import {
  isAllowlistedTool,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from '../../tools/types.js'
import type { CoreMcpGateway } from '../mcp/gateway.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import { ToolApprovalFlow } from './approvalFlow.js'
import { filterVisibleToolNames } from './prefilter.js'
import { createCoreToolRegistry } from './registry.js'
import { deniedResult, runtimeErrorResult } from './toolResultLifecycle.js'

export class ToolRuntime {
  private static readonly backpressure = createBackpressureController(4)
  private readonly registry: ReadonlyMap<string, ReturnType<typeof createCoreToolRegistry> extends ReadonlyMap<string, infer T> ? T : never>
  private readonly approvalFlow: ToolApprovalFlow
  private readonly logger = createComponentLogger('tool-runtime')
  private readonly runtimeConfig?: RuntimeConfig

  constructor(
    enforcer: SandboxEnforcer,
    options?: {
      mcpTools?: readonly McpToolDescriptor[]
      mcpGateway?: CoreMcpGateway
      runtimeConfig?: RuntimeConfig
    },
  ) {
    this.approvalFlow = new ToolApprovalFlow(enforcer)
    this.registry = createCoreToolRegistry(options)
    this.runtimeConfig = options?.runtimeConfig
  }

  listTools(): readonly string[] {
    return Array.from(this.registry.keys())
  }

  listVisibleTools(): readonly string[] {
    if (!this.runtimeConfig) {
      return this.listTools()
    }

    return filterVisibleToolNames(Array.from(this.registry.keys()), this.runtimeConfig)
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const isMcpTool = toolName.startsWith('mcp__')
    if (!isMcpTool && !isAllowlistedTool(toolName)) {
      this.logger.warn('Tool blocked by allowlist', { toolName })
      recordCount('tools.denied', 1, { toolName, reason: 'allowlist' })
      return deniedResult(`Tool '${toolName}' is not in the MVP allowlist`)
    }

    const tool = this.registry.get(toolName)
    if (!tool) {
      return deniedResult(`Tool '${toolName}' is not registered`)
    }

    const approvalFailure = await this.approvalFlow.authorize(
      toolName,
      tool.permissions.check(args, context),
    )
    if (approvalFailure) {
      this.logger.warn('Tool blocked by policy', { toolName, reason: approvalFailure.error })
      recordCount('tools.denied', 1, { toolName, reason: 'policy' })
      return approvalFailure
    }

    try {
      return await ToolRuntime.backpressure.run(async () => {
        this.logger.info('Tool execution approved', { toolName, taskId: context.taskId })
        recordCount('tools.executed', 1, { toolName })
        return tool.execute(args, context)
      })
    } catch (error) {
      this.logger.warn('Tool execution failed', { toolName })
      return runtimeErrorResult(error, { executionPath: 'ts-local', reason: 'runtime' })
    }
  }
}
