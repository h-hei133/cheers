import {
  createDefaultExecutionService,
  type ExecutionService,
} from '../../runtime/execution/executionService.js'
import { McpGatewayBlockedError, type CoreMcpGateway } from '../mcp/gateway.js'
import {
  classifyMcpFailure,
  classifyUnknownMcpFailure,
  mcpFailureMetadata,
} from '../mcp/errorTaxonomy.js'
import { createBrowserToolDefinitions } from '../context/browserTool.js'
import type { PwRuntimeStatus } from '../context/pwRuntime.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import {
  createCommandRuntimeReceipt,
  createMcpRuntimeFailureReceipt,
} from '../runtime/runtimeReceipt.js'
import { projectRuntimeReceipt } from '../runtime/runtimeReceiptProjection.js'
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js'
import { pathPermission, processPermission, resolveToolTarget } from './permissionContext.js'
import { buildExecutionFailedResult } from './toolPolicyResult.js'
import { approvedResult, deniedResult } from './toolResultLifecycle.js'

type ExecutionFailureKind = 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled'

function inferFailureKind(result: {
  status: 'completed' | 'failed' | 'timeout' | 'cancelled'
  failureKind?: ExecutionFailureKind
}): ExecutionFailureKind | undefined {
  if (result.failureKind) {
    return result.failureKind
  }

  switch (result.status) {
    case 'timeout':
      return 'timeout'
    case 'cancelled':
      return 'cancelled'
    case 'failed':
      return 'execution_failure'
    default:
      return undefined
  }
}

async function runCommandTool(
  executionService: ExecutionService,
  command: string,
  context: ToolExecutionContext,
) {
  const result = await executionService.runCommand({
    command: process.platform === 'win32' ? 'cmd' : 'sh',
    args: process.platform === 'win32' ? ['/C', command] : ['-c', command],
    cwd: context.workspaceRoot,
    workspaceRoot: context.workspaceRoot,
    timeoutMs: 30_000,
    abortSignal: context.abortSignal,
  })
  const receipt = createCommandRuntimeReceipt({
    runtimeKind: result.executionPath === 'rust-daemon' ? 'daemon' : 'local-command',
    command,
    status: result.status,
    executionPath: result.executionPath,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timeoutMs: 30_000,
    reason: result.recoveryReason,
    evidence: result.recoveryReason ? ['runtime-receipt:daemon-unavailable'] : undefined,
  })

  return {
    success: result.status === 'completed',
    output: result.executionPath === 'rust-daemon'
      ? result.stdout
      : `${result.stdout}${result.stderr}`.trim(),
    error: result.status === 'completed' ? undefined : result.stderr,
    metadata: {
      executionPath: result.executionPath,
      status: result.status,
      exitCode: result.exitCode,
      failureKind: inferFailureKind(result),
      daemonInstanceId: result.daemonInstanceId,
      daemonPid: result.daemonPid,
      daemonRequestSeq: result.daemonRequestSeq,
      daemonExecutionId: result.daemonExecutionId,
      recoveryReason: result.recoveryReason,
      runtimeReceipt: projectRuntimeReceipt(receipt),
    },
  }
}

async function runGitCommand(
  executionService: ExecutionService,
  command: string,
  context: ToolExecutionContext,
) {
  const result = await executionService.runCommand({
    command: process.platform === 'win32' ? 'cmd' : 'sh',
    args: process.platform === 'win32' ? ['/C', command] : ['-c', command],
    cwd: context.workspaceRoot,
    workspaceRoot: context.workspaceRoot,
    timeoutMs: 30_000,
    abortSignal: context.abortSignal,
  })
  if (result.status === 'completed') {
    return approvedResult(result.stdout.trim())
  }
  return deniedResult(result.stderr || result.recoveryReason || 'Command failed', {
    executionPath: result.executionPath,
    status: result.status,
    exitCode: result.exitCode,
    failureKind: inferFailureKind(result),
    recoveryReason: result.recoveryReason,
  })
}

export function createCoreToolRegistry(options?: {
  mcpTools?: readonly McpToolDescriptor[]
  mcpGateway?: CoreMcpGateway
  browserRuntimeStatus?: PwRuntimeStatus
  executionService?: ExecutionService
}): ReadonlyMap<string, ToolDefinition> {
  const executionService = options?.executionService ?? createDefaultExecutionService()
  const tools: ToolDefinition[] = [
    {
      name: 'read',
      description: 'Read a file from the workspace',
      argsSchema: { type: 'object', required: ['path'] },
      permissions: {
        check(args, context) {
          return pathPermission('read', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        return approvedResult(await executionService.readTextFile(target))
      },
    },
    {
      name: 'write',
      description: 'Write a file in the workspace',
      argsSchema: { type: 'object', required: ['path', 'content'] },
      permissions: {
        check(args, context) {
          return pathPermission('write', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const content = typeof args.content === 'string' ? args.content : ''
        await executionService.writeTextFile(target, content)
        return approvedResult(target)
      },
    },
    {
      name: 'edit',
      description: 'Edit a file in the workspace by replacing its content',
      argsSchema: { type: 'object', required: ['path', 'content'] },
      permissions: {
        check(args, context) {
          return pathPermission('write', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const content = typeof args.content === 'string' ? args.content : ''
        await executionService.writeTextFile(target, content)
        return approvedResult(target)
      },
    },
    {
      name: 'glob',
      description: 'List files in the workspace matching a suffix pattern',
      argsSchema: { type: 'object', required: ['pattern'] },
      permissions: { check: () => [] },
      async execute(args, context) {
        const pattern = typeof args.pattern === 'string' ? args.pattern : ''
        const suffix = pattern.replace(/^\*+/, '')
        const files = await executionService.listFilesRecursive(context.workspaceRoot)
        const matches = suffix ? files.filter(file => file.endsWith(suffix)) : files
        return approvedResult(matches.join('\n'))
      },
    },
    {
      name: 'bash',
      description: 'Run a shell command inside the workspace',
      argsSchema: { type: 'object', required: ['command'] },
      permissions: {
        check(args, context) {
          return processPermission(args, context)
        },
      },
      async execute(args, context) {
        const command = typeof args.command === 'string' ? args.command : ''
        return runCommandTool(executionService, command, context)
      },
    },
    {
      name: 'git-status',
      description: 'Run git status in the workspace',
      argsSchema: { type: 'object' },
      permissions: {
        check(args, context) {
          return processPermission({ ...args, command: 'git status --short' }, context)
        },
      },
      async execute(_args, context) {
        return runGitCommand(executionService, 'git status --short', context)
      },
    },
    {
      name: 'git-diff',
      description: 'Run git diff in the workspace',
      argsSchema: { type: 'object' },
      permissions: {
        check(args, context) {
          return processPermission({ ...args, command: 'git diff' }, context)
        },
      },
      async execute(_args, context) {
        return runGitCommand(executionService, 'git diff', context)
      },
    },
  ]

  tools.push(...createBrowserToolDefinitions({
    runtimeStatus: options?.browserRuntimeStatus,
  }))

  for (const tool of options?.mcpTools ?? []) {
    tools.push({
      name: tool.qualifiedName,
      description: `[MCP:${tool.serverName}] ${tool.description}`,
      argsSchema: tool.inputSchema ?? { type: 'object' },
      permissions: {
        check(_args, _context) {
          return []
        },
      },
      async execute(args, _context) {
        if (!options?.mcpGateway) {
          throw new Error(`Missing MCP gateway for ${tool.qualifiedName}`)
        }

        try {
          const result = await options.mcpGateway.invokeTool(tool.serverName, tool.toolName, args)
          if (result.isError) {
            const taxonomy = classifyMcpFailure({
              failureClass: 'tool-is-error',
              detail: result.content,
            })
            const receipt = buildExecutionFailedResult({
              capability: 'mcp',
              label: tool.qualifiedName,
              reasonCode: 'mcp-tool-is-error',
              reason: result.content,
              doNext: `Inspect MCP tool ${tool.qualifiedName} error output, refresh ${tool.serverName}, and retry only if the request is still valid.`,
              evidence: ['mcp:tool-is-error'],
            })
            return deniedResult(result.content, {
              executionPath: 'mcp-stdio',
              serverName: tool.serverName,
              toolName: tool.toolName,
              status: 'failed',
              failureKind: 'execution_failure',
              reason: receipt.reason,
              ...mcpFailureMetadata(taxonomy),
              doNext: receipt.doNext,
              runtimeReceipt: projectRuntimeReceipt(createMcpRuntimeFailureReceipt({
                serverName: tool.serverName,
                toolName: tool.toolName,
                failureClass: taxonomy.failureClass,
                failurePlane: taxonomy.failurePlane,
                safeDetail: taxonomy.safeDetail,
                doNext: receipt.doNext,
              })),
            })
          }
          return approvedResult(result.content, {
            executionPath: 'mcp-stdio',
            serverName: tool.serverName,
            toolName: tool.toolName,
          })
        } catch (error) {
          if (error instanceof McpGatewayBlockedError) {
            return deniedResult(error.message, {
              executionPath: 'mcp-stdio',
              serverName: tool.serverName,
              toolName: tool.toolName,
              blockerKind: error.blockerKind,
              reason: error.message,
              ...mcpFailureMetadata({
                failureClass: error.mcpFailureClass,
                failurePlane: error.mcpFailurePlane,
                safeDetail: error.mcpSafeDetail,
              }),
              doNext: error.doNext,
              runtimeReceipt: projectRuntimeReceipt(createMcpRuntimeFailureReceipt({
                serverName: tool.serverName,
                toolName: tool.toolName,
                failureClass: error.mcpFailureClass,
                failurePlane: error.mcpFailurePlane,
                safeDetail: error.mcpSafeDetail,
                doNext: error.doNext,
                protocolFailure: error.mcpFailureClass === 'protocol' || error.mcpFailureClass === 'malformed-result',
              })),
            })
          }
          const taxonomy = classifyUnknownMcpFailure(error)
          const reason = taxonomy.safeDetail
          const receipt = buildExecutionFailedResult({
            capability: 'mcp',
            label: tool.qualifiedName,
            reasonCode:
              taxonomy.failureClass === 'protocol' ||
              taxonomy.failureClass === 'malformed-result'
                ? 'mcp-protocol-failed'
                : 'mcp-execution-failed',
            reason,
            doNext: `Inspect MCP tool ${tool.qualifiedName} error output, refresh ${tool.serverName}, and retry only if the request is still valid.`,
            evidence: [`mcp:failure-class:${taxonomy.failureClass}`],
          })
          return deniedResult(reason, {
            executionPath: 'mcp-stdio',
            serverName: tool.serverName,
            toolName: tool.toolName,
            status: 'failed',
            failureKind: 'execution_failure',
            reason: receipt.reason,
            ...mcpFailureMetadata(
              taxonomy.failureClass === 'unknown'
                ? classifyMcpFailure({
                    failureClass: 'tool-execution',
                    detail: reason,
                  })
                : taxonomy,
            ),
            doNext: receipt.doNext,
            runtimeReceipt: projectRuntimeReceipt(createMcpRuntimeFailureReceipt({
              serverName: tool.serverName,
              toolName: tool.toolName,
              failureClass: taxonomy.failureClass,
              failurePlane: taxonomy.failurePlane,
              safeDetail: taxonomy.safeDetail,
              doNext: receipt.doNext,
              protocolFailure: taxonomy.failureClass === 'protocol' || taxonomy.failureClass === 'malformed-result',
            })),
          })
        }
      },
    })
  }

  return new Map(tools.map(tool => [tool.name, tool]))
}
