import { createBackpressureController } from '../../runtime/backpressure.js'
import { createComponentLogger, recordCount } from '../../observability/index.js'
import type { RuntimeConfig } from '../../config/runtimeConfig.js'
import type { ExecutionService } from '../../runtime/execution/service.js'
import type { SandboxEnforcer } from '../../sandbox/sandboxEnforcer.js'
import {
  isAllowlistedTool,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from '../../tools/types.js'
import { isMcpConfigLoadError } from '../mcp/config.js'
import { classifyMcpFailure, mcpFailureMetadata } from '../mcp/errorTaxonomy.js'
import type { CoreMcpGateway } from '../mcp/gateway.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import type { PwRuntimeStatus } from '../context/pwRuntime.js'
import { ToolApprovalFlow } from './approvalFlow.js'
import { filterVisibleToolNames } from './prefilter.js'
import { createCoreToolRegistry } from './registry.js'
import {
  buildPolicyBlockedResult,
  buildUnavailableResult,
} from './toolPolicyResult.js'
import {
  createMcpRuntimeFailureReceipt,
  createRuntimeReceipt,
} from '../runtime/runtimeReceipt.js'
import { projectRuntimeReceipt } from '../runtime/runtimeReceiptProjection.js'
import { deniedResult, runtimeErrorResult } from './toolResultLifecycle.js'

export class ToolRuntime {
  private static readonly backpressure = createBackpressureController(4)
  private readonly registry: ReadonlyMap<string, ReturnType<typeof createCoreToolRegistry> extends ReadonlyMap<string, infer T> ? T : never>
  private readonly approvalFlow: ToolApprovalFlow
  private readonly logger = createComponentLogger('tool-runtime')
  private readonly runtimeConfig?: RuntimeConfig
  private readonly mcpGateway?: CoreMcpGateway
  private readonly browserRuntimeStatus?: PwRuntimeStatus

  constructor(
    enforcer: SandboxEnforcer,
    options?: {
      mcpTools?: readonly McpToolDescriptor[]
      mcpGateway?: CoreMcpGateway
      runtimeConfig?: RuntimeConfig
      browserRuntimeStatus?: PwRuntimeStatus
      executionService?: ExecutionService
    },
  ) {
    this.approvalFlow = new ToolApprovalFlow(enforcer)
    this.registry = createCoreToolRegistry(options)
    this.runtimeConfig = options?.runtimeConfig
    this.mcpGateway = options?.mcpGateway
    this.browserRuntimeStatus = options?.browserRuntimeStatus
  }

  listTools(): readonly string[] {
    return Array.from(this.registry.keys())
  }

  listVisibleTools(): readonly string[] {
    let visible = this.runtimeConfig
      ? filterVisibleToolNames(Array.from(this.registry.keys()), this.runtimeConfig)
      : Array.from(this.registry.keys())

    if (this.mcpGateway) {
      try {
        const configs = this.mcpGateway.loadConfigs()
        visible = visible.filter(name => {
          if (!name.startsWith('mcp__')) {
            return true
          }

          const [, serverName] = name.split('__')
          const config = configs[serverName]
          if (!config) {
            return false
          }

          if (config.enabled === false) {
            return false
          }

          if (config.authRequired === true) {
            return false
          }

          if (config.transport === 'stdio' && !config.command) {
            return false
          }

          if ((config.transport === 'http' || config.transport === 'ws') && !config.url) {
            return false
          }

          if (config.mockTools) {
            const [, , toolName] = name.split('__')
            return config.mockTools.some(tool => {
              const qualifiedName = tool.qualifiedName ?? `mcp__${serverName}__${tool.toolName}`
              return qualifiedName === name || tool.toolName === toolName
            })
          }

          return true
        })
      } catch (error) {
        if (isMcpConfigLoadError(error)) {
          visible = visible.filter(name => !name.startsWith('mcp__'))
        }
        // Keep previously computed visibility for unrelated config loading failures.
      }
    }

    if (!this.isBrowserRuntimeVisible()) {
      visible = visible.filter(name => !name.startsWith('browser.'))
    }

    return visible
  }

  private isBrowserRuntimeVisible(): boolean {
    return this.browserRuntimeStatus?.status === 'ready'
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
      const receipt = buildPolicyBlockedResult({
        capability: 'command',
        label: toolName,
        reasonCode: 'command-not-allowlisted',
        reason: `Tool '${toolName}' is not in the controlled allowlist`,
        doNext: 'Retry with one of the visible controlled tools.',
        evidence: ['tool-runtime:allowlist-blocked'],
      })
      return deniedResult(receipt.reason, {
        runtimeReceipt: projectRuntimeReceipt(createRuntimeReceipt({
          runtimeKind: 'sandbox',
          availability: receipt.availability,
          policy: receipt.policy,
          execution: receipt.execution,
          result: receipt.result,
          reasonCode: receipt.reasonCode,
          reason: receipt.reason,
          doNext: receipt.doNext,
          targetSummary: toolName,
          cleanup: 'not-started',
          redaction: receipt.redaction,
          evidence: receipt.evidence,
        })),
      })
    }

    const tool = this.registry.get(toolName)
    if (!tool) {
      if (isMcpTool) {
        const [, serverName = 'unknown'] = toolName.split('__')
        const taxonomy = classifyMcpFailure({
          failureClass: 'tool-unavailable',
          detail: `MCP tool '${toolName}' is not registered`,
        })
        const receipt = buildUnavailableResult({
          capability: 'mcp',
          availability: 'not-configured',
          reasonCode: 'mcp-unavailable',
          reason: `MCP tool '${toolName}' is not registered`,
          doNext: 'Run /mcp status and /mcp refresh to list available MCP tools, then retry with a visible tool name.',
          evidence: ['tool-runtime:mcp-tool-unavailable'],
        })
        return deniedResult(receipt.reason, {
          executionPath: 'mcp-stdio',
          serverName,
          blockerKind: 'unknown',
          reason: receipt.reason,
          ...mcpFailureMetadata(taxonomy),
          doNext: receipt.doNext,
          runtimeReceipt: projectRuntimeReceipt(createMcpRuntimeFailureReceipt({
            serverName,
            failureClass: taxonomy.failureClass,
            failurePlane: taxonomy.failurePlane,
            safeDetail: taxonomy.safeDetail,
            doNext: receipt.doNext,
          })),
        })
      }

      const receipt = buildUnavailableResult({
        capability: 'tool',
        label: toolName,
        reason: `Tool '${toolName}' is not registered`,
        doNext: 'Retry with a visible controlled tool.',
        evidence: ['tool-runtime:tool-unavailable'],
      })
      return deniedResult(receipt.reason)
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
