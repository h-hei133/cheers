import {
  createDefaultExecutionService,
  type ExecutionAuthority,
  type ExecutionService,
} from '../../runtime/execution/service.js'
import { createBrowserToolDefinitions } from '../context/browserTool.js'
import { createGrepToolDefinition } from './grep.js'
import { createWebFetchToolDefinition } from './webFetch.js'
import { createWebSearchToolDefinition } from './webSearch.js'
import type { PwRuntimeStatus } from '../context/pwRuntime.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js'
import { pathPermission, processPermission, resolveToolTarget } from './permissionContext.js'
import { approvedResult, deniedResult } from './toolResultLifecycle.js'

type ExecutionFailureKind = 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled'
const TOOL_APPROVED_READ_AUTHORITY: ExecutionAuthority = {
  mode: 'read-only',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime approved the filesystem read before ExecutionService was called.',
}
const TOOL_APPROVED_WRITE_AUTHORITY: ExecutionAuthority = {
  mode: 'approved-for-write',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime approved the filesystem write before ExecutionService was called.',
}
const TOOL_APPROVED_COMMAND_AUTHORITY: ExecutionAuthority = {
  mode: 'command-allowlisted',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime allowlist and process permission checks passed before ExecutionService was called.',
}

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
function matchGlobPattern(filePath: string, pattern: string): boolean {
  if (!pattern || pattern === '*' || pattern === '**' || pattern === '**/*') {
    return true
  }
  const cleanPattern = pattern.trim().replace(/^\.\//, '')
  const regexStr = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  const regex = new RegExp(`^${regexStr}$`, 'i')
  return regex.test(filePath) || regex.test(filePath.replace(/^[/]+/, ''))
}

async function runCommandTool(
  executionService: ExecutionService,
  command: string,
  context: ToolExecutionContext,
) {
  if (!command || !command.trim()) {
    return deniedResult('Error: No command provided to execute.', {
      status: 'failed',
      exitCode: 1,
    })
  }

  const isWindows = process.platform === 'win32'
  const shellBin = isWindows ? 'cmd.exe' : 'sh'
  const shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command]

  const result = await executionService.runCommand({
    operationKind: 'command.run',
    command: shellBin,
    args: shellArgs,
    cwd: context.workspaceRoot,
    workspaceRoot: context.workspaceRoot,
    authority: TOOL_APPROVED_COMMAND_AUTHORITY,
    caller: 'core-tool:bash',
    reason: 'Run an approved workspace command.',
    reportSafeCommand: command,
    timeoutMs: 60_000,
    abortSignal: context.abortSignal,
  })
  if (result.status === 'completed' && result.exitCode === 0) {
    return approvedResult(result.stdout || 'Command completed with no output', {
      status: result.status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    })
  }

  const combinedOutput =
    [result.stderr, result.stdout].filter(Boolean).join('\n') ||
    result.recoveryReason ||
    `Command failed with exit code ${result.exitCode}`

  return deniedResult(combinedOutput, {
    status: result.status,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    failureKind: inferFailureKind(result),
    recoveryReason: result.recoveryReason,
  })
}

async function runGitCommand(
  executionService: ExecutionService,
  command: string,
  context: ToolExecutionContext,
) {
  const parts = command.trim().split(/\s+/)
  const bin = parts[0] || 'git'
  const args = parts.slice(1)

  const result = await executionService.runCommand({
    operationKind: 'command.run',
    command: bin,
    args,
    cwd: context.workspaceRoot,
    workspaceRoot: context.workspaceRoot,
    authority: TOOL_APPROVED_COMMAND_AUTHORITY,
    caller: 'core-tool:git',
    reason: 'Run an approved git inspection command.',
    reportSafeCommand: command,
    abortSignal: context.abortSignal,
  })

  if (result.status === 'completed' && result.exitCode === 0) {
    return approvedResult(result.stdout || 'No changes', {
      status: result.status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    })
  }

  return deniedResult(result.stderr || result.recoveryReason || 'Command failed', {
    status: result.status,
    exitCode: result.exitCode,
    failureKind: inferFailureKind(result),
    recoveryReason: result.recoveryReason,
  })
}

export function createCoreToolRegistry(options?: {
  mcpTools?: readonly McpToolDescriptor[]
  browserRuntimeStatus?: PwRuntimeStatus
  executionService?: ExecutionService
}): ReadonlyMap<string, ToolDefinition> {
  const executionService = options?.executionService ?? createDefaultExecutionService()
  const tools: ToolDefinition[] = [
    {
      name: 'read',
      description: 'Read the contents of a file in the workspace, with optional line offset/limit pagination and safe truncation protection.',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to read (e.g. package.json, src/index.ts).',
          },
          offset: {
            type: 'number',
            description: 'The 1-based starting line number to read from (default: 1).',
          },
          limit: {
            type: 'number',
            description: 'The maximum number of lines to read (default: 500, max: 1000).',
          },
        },
        required: ['path'],
      },
      permissions: {
        check(args, context) {
          return pathPermission('read', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const rawContent = await executionService.readTextFile({
          operationKind: 'file.read',
          absolutePath: target,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_READ_AUTHORITY,
          caller: 'core-tool:read',
          reason: 'Read an approved workspace file target.',
          reportSafeTarget: target,
        })

        const lines = rawContent.split('\n')
        const totalLines = lines.length
        const offset = typeof args.offset === 'number' && args.offset > 0 ? Math.floor(args.offset) : 1
        const maxLimit = 1000
        const defaultLimit = 500
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), maxLimit) : defaultLimit

        const startIdx = Math.max(0, offset - 1)
        const endIdx = Math.min(totalLines, startIdx + limit)
        const selectedLines = lines.slice(startIdx, endIdx)

        let resultText = selectedLines.join('\n')
        const MAX_BYTES = 30 * 1024 // 30KB safety truncate
        if (Buffer.byteLength(resultText, 'utf8') > MAX_BYTES) {
          resultText = resultText.slice(0, MAX_BYTES) + '\n[Content truncated to 30KB. Use offset/limit to read in smaller chunks]'
        } else if (startIdx > 0 || endIdx < totalLines) {
          resultText += `\n[Showing lines ${startIdx + 1}-${endIdx} of ${totalLines}. Use offset/limit to view other sections]`
        }

        return approvedResult(resultText)
      },
    },
    {
      name: 'write',
      description: 'Create or overwrite a file in the workspace with content.',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to write.',
          },
          content: {
            type: 'string',
            description: 'The full file content to write.',
          },
        },
        required: ['path', 'content'],
      },
      permissions: {
        check(args, context) {
          return pathPermission('write', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const content = typeof args.content === 'string' ? args.content : ''
        await executionService.writeTextFile({
          operationKind: 'file.write',
          absolutePath: target,
          content,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_WRITE_AUTHORITY,
          caller: 'core-tool:write',
          reason: 'Write an approved workspace file target.',
          reportSafeTarget: target,
        })
        return approvedResult(target)
      },
    },
    {
      name: 'edit',
      description: 'Edit or replace the content of an existing file in the workspace.',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to edit.',
          },
          content: {
            type: 'string',
            description: 'The new replacement content for the file.',
          },
        },
        required: ['path', 'content'],
      },
      permissions: {
        check(args, context) {
          return pathPermission('write', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const content = typeof args.content === 'string' ? args.content : ''
        await executionService.writeTextFile({
          operationKind: 'file.write',
          absolutePath: target,
          content,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_WRITE_AUTHORITY,
          caller: 'core-tool:edit',
          reason: 'Replace an approved workspace file target.',
          reportSafeTarget: target,
        })
        return approvedResult(target)
      },
    },
    {
      name: 'glob',
      description: 'List files in the workspace matching a path pattern or suffix (e.g. **/*.ts, package.json).',
      argsSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The file pattern or suffix to match (e.g. *.json, src/**/*.ts).',
          },
        },
        required: ['pattern'],
      },
      permissions: { check: () => [] },
      async execute(args, context) {
        const rawPattern = typeof args.pattern === 'string' ? args.pattern.trim() : ''
        const pattern = rawPattern.replace(/^[./\\]+/, '') || '*'
        const files = await executionService.listFilesRecursive({
          operationKind: 'file.list',
          absoluteRoot: context.workspaceRoot,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_READ_AUTHORITY,
          caller: 'core-tool:glob',
          reason: 'List approved workspace files for glob matching.',
          reportSafeTarget: context.workspaceRoot,
        })
        const rootPath = context.workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '')
        const relativeFiles = files.map(file => {
          const normalized = file.replace(/\\/g, '/')
          return normalized.startsWith(rootPath + '/')
            ? normalized.slice(rootPath.length + 1)
            : normalized
        })
        const filtered = relativeFiles.filter(file => {
          if (file.includes('node_modules/') || file.includes('.git/') || file.includes('dist/')) {
            return false
          }
          return matchGlobPattern(file, pattern)
        })
        return approvedResult(filtered.length > 0 ? filtered.join('\n') : 'No files matched the pattern.')
      },
    },
    createGrepToolDefinition(executionService),
    {
      name: 'bash',
      description: 'Run a shell command inside the workspace (e.g. ls, git status, npm test).',
      argsSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command line to execute.',
          },
        },
        required: ['command'],
      },
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
      description: 'Run git status to inspect working tree changes in the workspace.',
      argsSchema: {
        type: 'object',
        properties: {},
      },
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
      description: 'Run git diff to inspect unstaged changes in the workspace.',
      argsSchema: {
        type: 'object',
        properties: {},
      },
      permissions: {
        check(args, context) {
          return processPermission({ ...args, command: 'git diff' }, context)
        },
      },
      async execute(_args, context) {
        return runGitCommand(executionService, 'git diff', context)
      },
    },
    createWebFetchToolDefinition(),
    createWebSearchToolDefinition(),
  ]

  tools.push(...createBrowserToolDefinitions({
    runtimeStatus: options?.browserRuntimeStatus,
  }))

  return new Map(tools.map(tool => [tool.name, tool]))
}
