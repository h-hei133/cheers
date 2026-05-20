import { promises as fs } from 'node:fs'
import path from 'node:path'
import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'
import {
  checkRustDaemonAvailability,
  executeLocally,
  executeViaRustDaemon,
  isRustDaemonEnabled,
} from '../../daemon/client.js'
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

const exec = promisify(execCallback)

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

async function recursiveList(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        return recursiveList(fullPath)
      }
      return [fullPath]
    }),
  )
  return files.flat()
}

async function runLocalCommand(
  command: string,
  context: ToolExecutionContext,
  metadata: Record<string, unknown>,
) {
  const result = await executeLocally({
    command: process.platform === 'win32' ? 'cmd' : 'sh',
    args: process.platform === 'win32' ? ['/C', command] : ['-c', command],
    cwd: context.workspaceRoot,
    timeoutMs: 30_000,
  })
  const receipt = createCommandRuntimeReceipt({
    command,
    status: result.status,
    executionPath: 'ts-local',
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timeoutMs: 30_000,
  })

  return {
    success: result.status === 'completed',
    output: `${result.stdout}${result.stderr}`.trim(),
    error: result.status === 'completed' ? undefined : result.stderr,
    metadata: {
      ...metadata,
      status: result.status,
      exitCode: result.exitCode,
      failureKind: inferFailureKind(result),
      runtimeReceipt: projectRuntimeReceipt(receipt),
    },
  }
}

function daemonUnavailableResult(
  command: string,
  context: ToolExecutionContext,
  reason: string,
) {
  const receipt = createCommandRuntimeReceipt({
    runtimeKind: 'daemon',
    command,
    status: 'failed',
    executionPath: 'rust-daemon',
    exitCode: null,
    reason,
    evidence: ['runtime-receipt:daemon-unavailable'],
  })
  return {
    success: false,
    output: '',
    error: reason,
    metadata: {
      executionPath: 'rust-daemon',
      status: 'failed',
      exitCode: null,
      failureKind: 'execution_failure' as const,
      recoveryReason: reason,
      blockedCommand: command,
      workspaceRoot: context.workspaceRoot,
      runtimeReceipt: projectRuntimeReceipt(receipt),
    },
  }
}

export function createCoreToolRegistry(options?: {
  mcpTools?: readonly McpToolDescriptor[]
  mcpGateway?: CoreMcpGateway
  browserRuntimeStatus?: PwRuntimeStatus
}): ReadonlyMap<string, ToolDefinition> {
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
        return approvedResult(await fs.readFile(target, 'utf8'))
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
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, content, 'utf8')
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
        await fs.writeFile(target, content, 'utf8')
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
        const files = await recursiveList(context.workspaceRoot)
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
        if (isRustDaemonEnabled()) {
          const availability = checkRustDaemonAvailability()
          if (availability.available) {
            try {
              const daemonResult = await executeViaRustDaemon({
                command: process.platform === 'win32' ? 'cmd' : 'sh',
                args: process.platform === 'win32' ? ['/C', command] : ['-c', command],
                cwd: context.workspaceRoot,
                workspaceRoot: context.workspaceRoot,
                timeoutMs: 30_000,
                abortSignal: context.abortSignal,
              })
              const receipt = createCommandRuntimeReceipt({
                runtimeKind: 'daemon',
                command,
                status: daemonResult.status,
                executionPath: 'rust-daemon',
                exitCode: daemonResult.exitCode,
                stdout: daemonResult.stdout,
                stderr: daemonResult.stderr,
                timeoutMs: 30_000,
              })
              return {
                success: daemonResult.status === 'completed',
                output: daemonResult.stdout,
                error: daemonResult.status === 'completed' ? undefined : daemonResult.stderr,
                metadata: {
                  executionPath: 'rust-daemon',
                  status: daemonResult.status,
                  exitCode: daemonResult.exitCode,
                  failureKind: inferFailureKind(daemonResult),
                  daemonInstanceId: daemonResult.daemonInstanceId,
                  daemonPid: daemonResult.daemonPid,
                  daemonRequestSeq: daemonResult.daemonRequestSeq,
                  daemonExecutionId: daemonResult.daemonExecutionId,
                  runtimeReceipt: projectRuntimeReceipt(receipt),
                },
              }
            } catch (error) {
              const reason = error instanceof Error ? error.message : String(error)
              return daemonUnavailableResult(command, context, `Rust daemon execution failed: ${reason}`)
            }
          }

          return daemonUnavailableResult(
            command,
            context,
            availability.reason ?? 'Rust daemon unavailable',
          )
        }

        return runLocalCommand(command, context, { executionPath: 'ts-local' })
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
        const { stdout } = await exec('git status --short', { cwd: context.workspaceRoot })
        return approvedResult(stdout.trim())
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
        const { stdout } = await exec('git diff', { cwd: context.workspaceRoot })
        return approvedResult(stdout.trim())
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
