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
import type { CoreMcpGateway } from '../mcp/gateway.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js'
import { pathPermission, processPermission, resolveToolTarget } from './permissionContext.js'
import { approvedResult } from './toolResultLifecycle.js'

const exec = promisify(execCallback)

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

  return {
    success: result.status === 'completed',
    output: `${result.stdout}${result.stderr}`.trim(),
    error: result.status === 'completed' ? undefined : result.stderr,
    metadata: {
      ...metadata,
      status: result.status,
      exitCode: result.exitCode,
    },
  }
}

export function createCoreToolRegistry(options?: {
  mcpTools?: readonly McpToolDescriptor[]
  mcpGateway?: CoreMcpGateway
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
              })
              return {
                success: daemonResult.status === 'completed',
                output: daemonResult.stdout,
                error: daemonResult.status === 'completed' ? undefined : daemonResult.stderr,
                metadata: { executionPath: 'rust-daemon', status: daemonResult.status },
              }
            } catch (error) {
              return runLocalCommand(command, context, {
                executionPath: 'ts-local-fallback',
                recoveryReason: error instanceof Error ? error.message : String(error),
              })
            }
          }

          return runLocalCommand(command, context, {
            executionPath: 'ts-local-fallback',
            recoveryReason: availability.reason ?? 'Rust daemon unavailable',
          })
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

        const result = await options.mcpGateway.invokeTool(tool.serverName, tool.toolName, args)
        return approvedResult(result.content, {
          executionPath: 'mcp-stdio',
          serverName: tool.serverName,
          toolName: tool.toolName,
        })
      },
    })
  }

  return new Map(tools.map(tool => [tool.name, tool]))
}
