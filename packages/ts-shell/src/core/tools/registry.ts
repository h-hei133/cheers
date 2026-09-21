import fs from 'node:fs/promises'
import path from 'node:path'
import { verifyPathContainment } from '../security/pathJail.js'
import { formatNonVisionFallback, getImageMimeType, isImageFilePath } from '../../model-adapters/multimodal.js'
import { replaceInContent } from './editEngine.js'
import { createUnifiedDiff } from '../../presentation/tui/transcript/diff.js'
import { truncateHead, truncateTail, truncateLineWidth } from './truncation.js'
import { ArtifactManager } from '../session/artifactManager.js'
import { parsePathSelector, sliceLinesBySelector } from './selectorParser.js'
import {
  createDefaultExecutionService,
  type ExecutionAuthority,
  type ExecutionService,
} from '../../runtime/execution/service.js'
import { type CoreMcpGateway } from '../mcp/gateway.js'
import { createGrepToolDefinition } from './grep.js'
import { createWebFetchToolDefinition } from './webFetch.js'
import { createWebSearchToolDefinition } from './webSearch.js'
import { createLspToolDefinition } from './lsp.js'
import { createUnifiedBrowserToolDefinition } from './browserToolUnified.js'
import { ShellManager } from '../shell/platform/shellManager.js'
import { createAskToolDefinition } from './ask.js'
import { createTodoToolDefinition } from './todoTool.js'
import { createTaskToolDefinition } from './taskTool.js'
import type { PwRuntimeStatus } from '../../browser/playwrightRuntime.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js'
import { pathPermission, processPermission, resolveToolTarget } from './permissionContext.js'
import { approvedResult, deniedResult } from './toolResultLifecycle.js'
import { networkNotice, planSandboxedCommand, readSandboxRules } from '../../sandbox/osSandbox.js'

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
  const env = ShellManager.getActiveEnvironment();
  const isWindows = process.platform === 'win32';
  const shellBin = env.executionPath;
  let shellArgs: string[];

  if (env.activeBackend === 'powershell') {
    shellArgs = ['-NoProfile', '-NonInteractive', '-Command', command];
  } else if (env.activeBackend === 'git-bash' || env.activeBackend === 'bash') {
    shellArgs = ['-c', command];
  } else if (env.activeBackend === 'wsl') {
    shellArgs = ['-e', 'sh', '-c', command];
  } else {
    shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command];
  }
  // OS-level isolation, when it has been turned on. The plan says which of the
  // three states applies, and an unavailable launcher is reported on the result
  // rather than quietly downgraded to no isolation.
  const sandbox = planSandboxedCommand({
    shell: shellBin,
    shellArgs,
    workspaceRoot: context.workspaceRoot,
  })
  const result = await executionService.runCommand({
    operationKind: 'command.run',
    command: sandbox.command ?? shellBin,
    args: sandbox.args ?? shellArgs,
    cwd: context.workspaceRoot,
    workspaceRoot: context.workspaceRoot,
    authority: TOOL_APPROVED_COMMAND_AUTHORITY,
    caller: 'core-tool:bash',
    reason: 'Run an approved workspace command.',
    reportSafeCommand: command,
    timeoutMs: 60_000,
    abortSignal: context.abortSignal,
    ...(context.onOutput ? { onOutput: context.onOutput } : {}),
  })
  const artifactManager = ArtifactManager.getShared(context.workspaceRoot)
  const isOk = result.status === 'completed' && result.exitCode === 0
  const rawOutput = isOk
    ? (result.stdout || 'Command completed with no output')
    : ([result.stderr, result.stdout].filter(Boolean).join('\n') || result.recoveryReason || `Command failed with exit code ${result.exitCode}`)

  const truncated = truncateTail(rawOutput, { maxLines: 1500, maxBytes: 50 * 1024 })
  let finalOutput = truncated.content
  const sandboxNotices = [sandbox.notice, sandbox.state === 'isolated' ? networkNotice(readSandboxRules(context.workspaceRoot)) : undefined].filter(Boolean)
  if (sandboxNotices.length > 0) {
    finalOutput = `${sandboxNotices.map(notice => `[sandbox] ${notice}`).join('\n')}\n${finalOutput}`
  }

  if (truncated.truncated) {
    const artifact = await artifactManager.save(rawOutput, 'bash')
    finalOutput += `\n\n[Showing last ${truncated.shownLines} of ${truncated.originalLines} lines (${Math.round(truncated.shownBytes / 1024)}KB of ${Math.round(truncated.originalBytes / 1024)}KB). Full raw output saved: ${artifact.uri}]\n[To read full or earlier sections: read(path="${artifact.uri}:1-500")]`
  }

  // Where the command actually ran (ts-local, rust-daemon) and how the result was
  // classified are decided by the execution service; dropping them here would make
  // the tool result unable to say which executor answered.
  const executionProvenance = {
    executionPath: result.executionPath,
    errorClass: result.errorClass,
  }

  if (isOk) {
    return approvedResult(finalOutput, {
      ...executionProvenance,
      status: result.status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    })
  }

  return deniedResult(finalOutput, {
    ...executionProvenance,
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
  mcpGateway?: CoreMcpGateway
  browserRuntimeStatus?: PwRuntimeStatus
  executionService?: ExecutionService
}): ReadonlyMap<string, ToolDefinition> {
  const executionService = options?.executionService ?? createDefaultExecutionService()
  const tools: ToolDefinition[] = [
    {
      name: 'read',
      description: 'Read the contents of a file in the workspace, with optional line offset/limit pagination and safe truncation protection. Image files are reported, not returned: this harness reads text, so use bash to inspect an image.',
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
        const rawPath = typeof args.path === 'string' ? args.path : ''
        const selector = parsePathSelector(rawPath)
        const artifactManager = ArtifactManager.getShared(context.workspaceRoot)
        let target = selector.cleanPath
        let isArtifact = target.startsWith('artifact://')
        let rawContent = ''

        if (isArtifact) {
          const resolvedArtifact = artifactManager.resolve(target)
          if (!resolvedArtifact) {
            throw new Error(`Artifact '${target}' not found in session storage.`)
          }
          rawContent = await executionService.readTextFile({
            operationKind: 'file.read',
            absolutePath: resolvedArtifact,
            workspaceRoot: context.workspaceRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY,
            caller: 'core-tool:read:artifact',
            reason: 'Read session artifact output log.',
            reportSafeTarget: resolvedArtifact,
          })
        } else {
          target = resolveToolTarget({ path: selector.cleanPath }, 'path', context.workspaceRoot)
          const containment = verifyPathContainment(target, context.workspaceRoot)
          if (!containment.allowed) {
            throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
          }
          // An image read as text is mojibake, and mojibake is worse than a
          // refusal: it looks like content. Say what the file is and how to view
          // it instead of handing the model bytes it cannot interpret.
          if (isImageFilePath(containment.resolvedPath)) {
            const stats = await fs.stat(containment.resolvedPath)
            return approvedResult(
              formatNonVisionFallback({
                type: 'image',
                data: '',
                mimeType: getImageMimeType(containment.resolvedPath),
              }) +
                `\n${selector.cleanPath} is ${Math.round(stats.size / 1024)}KB on disk. ` +
                `Its bytes cannot be read as text; this model receives no image content. ` +
                `Use bash to inspect it (e.g. file, identify, exiftool) if you need facts about it.`,
            )
          }
          rawContent = await executionService.readTextFile({
            operationKind: 'file.read',
            absolutePath: containment.resolvedPath,
            workspaceRoot: context.workspaceRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY,
            caller: 'core-tool:read',
            reason: 'Read an approved workspace file target.',
            reportSafeTarget: containment.resolvedPath,
          })
        }

        const lines = rawContent.split('\n')
        const totalLines = lines.length

        let selectedLines: string[] = []
        let startLine = 1
        let endLine = totalLines

        if (selector.hasSelector) {
          const sliced = sliceLinesBySelector(lines, selector)
          selectedLines = sliced.selectedLines
          startLine = sliced.startLine
          endLine = sliced.endLine
        } else {
          const offset = typeof args.offset === 'number' && args.offset > 0 ? Math.floor(args.offset) : 1
          const maxLimit = 1000
          const defaultLimit = 500
          const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(Math.floor(args.limit), maxLimit) : defaultLimit
          const startIdx = Math.max(0, offset - 1)
          const endIdx = Math.min(totalLines, startIdx + limit)
          selectedLines = lines.slice(startIdx, endIdx)
          startLine = startIdx + 1
          endLine = endIdx
        }

        let resultText = selectedLines.join('\n')
        const truncated = truncateHead(resultText, { maxLines: 1500, maxBytes: 50 * 1024 })
        resultText = truncated.content

        if (truncated.truncated) {
          const artifact = await artifactManager.save(rawContent, 'read')
          resultText += `\n\n[Showing lines ${startLine}-${startLine + truncated.shownLines - 1} of ${totalLines} (${Math.round(truncated.shownBytes / 1024)}KB). Output spilled to ${artifact.uri}]\n[Use selector to read other sections: read(path="${selector.cleanPath}:${startLine + truncated.shownLines}-${startLine + truncated.shownLines + 200}")]`
        } else if (startLine > 1 || endLine < totalLines) {
          resultText += `\n[Showing lines ${startLine}-${endLine} of ${totalLines}. Use selector :N-M or offset/limit to view other sections]`
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
        const containment = verifyPathContainment(target, context.workspaceRoot)
        if (!containment.allowed) {
          throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
        }
        const content = typeof args.content === 'string' ? args.content : ''
        const relPath = path.relative(context.workspaceRoot, containment.resolvedPath)
        let original = ''
        let originalUnreadable = false
        try {
          original = await executionService.readTextFile({
            operationKind: 'file.read',
            absolutePath: containment.resolvedPath,
            workspaceRoot: context.workspaceRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY,
            caller: 'core-tool:write',
            reason: 'Read original content for diff.',
            reportSafeTarget: containment.resolvedPath,
          })
        } catch {
          originalUnreadable = true
        }
        await executionService.writeTextFile({
          operationKind: 'file.write',
          absolutePath: containment.resolvedPath,
          content,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_WRITE_AUTHORITY,
          caller: 'core-tool:write',
          reason: 'Write an approved workspace file target.',
          reportSafeTarget: containment.resolvedPath,
        })
        const diff = original && original !== content ? createUnifiedDiff(relPath, original, content) : ''
        const output = diff
          ? `Updated ${relPath}\n\n\`\`\`diff\n${diff}\n\`\`\``
          : originalUnreadable
            ? `Wrote ${relPath} (original unreadable, no diff)`
            : `Wrote ${relPath}`
        return approvedResult(output)
      },
    },
    {
      name: 'edit',
      description: 'Edit or replace content in an existing file using either full content or resilient search/replace (oldText/newText).',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to edit.',
          },
          content: {
            type: 'string',
            description: 'The full replacement content for the file (optional if oldText/newText provided).',
          },
          oldText: {
            type: 'string',
            description: 'The exact or fuzzy block of text to replace.',
          },
          newText: {
            type: 'string',
            description: 'The new text to replace oldText with.',
          },
          replaceAll: {
            type: 'boolean',
            description: 'Whether to replace all occurrences of oldText.',
          },
        },
        required: ['path'],
      },
      permissions: {
        check(args, context) {
          return pathPermission('write', args, context)
        },
      },
      async execute(args, context) {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const containment = verifyPathContainment(target, context.workspaceRoot)
        if (!containment.allowed) {
          throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
        }

        const relPath = path.relative(context.workspaceRoot, containment.resolvedPath)
        let original = ''
        let originalUnreadable = false
        let finalContent = ''
        if (typeof args.oldText === 'string' && typeof args.newText === 'string') {
          original = await executionService.readTextFile({
            operationKind: 'file.read',
            absolutePath: containment.resolvedPath,
            workspaceRoot: context.workspaceRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY,
            caller: 'core-tool:edit',
            reason: 'Read original content for resilient replacement.',
            reportSafeTarget: containment.resolvedPath,
          })
          const replaceRes = replaceInContent(original, args.oldText, args.newText, {
            replaceAll: Boolean(args.replaceAll),
          })
          if (!replaceRes.success) {
            throw new Error(replaceRes.error ?? 'Failed to apply replacement.')
          }
          finalContent = replaceRes.content
        } else if (typeof args.content === 'string') {
          try {
            original = await executionService.readTextFile({
              operationKind: 'file.read',
              absolutePath: containment.resolvedPath,
              workspaceRoot: context.workspaceRoot,
              authority: TOOL_APPROVED_READ_AUTHORITY,
              caller: 'core-tool:edit',
              reason: 'Read original content for diff.',
              reportSafeTarget: containment.resolvedPath,
            })
          } catch {
            originalUnreadable = true
          }
          finalContent = args.content
        } else {
          throw new Error("Must provide either 'content' or both 'oldText' and 'newText'.")
        }

        await executionService.writeTextFile({
          operationKind: 'file.write',
          absolutePath: containment.resolvedPath,
          content: finalContent,
          workspaceRoot: context.workspaceRoot,
          authority: TOOL_APPROVED_WRITE_AUTHORITY,
          caller: 'core-tool:edit',
          reason: 'Replace an approved workspace file target.',
          reportSafeTarget: containment.resolvedPath,
        })
        const diff = original && original !== finalContent ? createUnifiedDiff(relPath, original, finalContent) : ''
        const output = diff
          ? `Updated ${relPath}\n\n\`\`\`diff\n${diff}\n\`\`\``
          : originalUnreadable
            ? `Updated ${relPath} (original unreadable, no diff)`
            : `Updated ${relPath}`
        return approvedResult(output)
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
      description: 'Execute shell commands (including full Git operations: git status, git diff, git log, git commit, etc.). Safe read-only commands (git status, git diff, etc.) are permitted in plan mode.',
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
    createWebFetchToolDefinition(),
    createWebSearchToolDefinition(),
    createLspToolDefinition(executionService),
    createAskToolDefinition(),
    createTodoToolDefinition(),
    createTaskToolDefinition(),
    createUnifiedBrowserToolDefinition(),
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
        return approvedResult(`MCP tool ${tool.qualifiedName} called`)
      },
    })
  }
  return new Map(tools.map(tool => [tool.name, tool]))
}
