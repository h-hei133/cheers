import fs from 'node:fs/promises'
import path from 'node:path'
import { verifyPathContainment } from '../security/pathJail.js'
import { formatNonVisionFallback, getImageMimeType, isImageFilePath } from '../../model-adapters/multimodal.js'
import { replaceInContent, replaceManyInContent } from './editEngine.js'
import { backgroundTasks, renderTask, TaskRegistry } from '../shell/background/tasks.js'
import { withFileLock } from '../../runtime/execution/fileLock.js'
import {
  detectLineEnding,
  splitByteOrderMark,
  toUnixLines,
  withLineEnding,
} from '../../runtime/execution/fileText.js'
import { createUnifiedDiff } from '../../presentation/tui/transcript/diff.js'
import { truncateHead, truncateTail, truncateLineWidth } from './truncation.js'
import { ArtifactManager } from '../session/artifactManager.js'
import { parsePathSelector, sliceLinesBySelector } from './selectorParser.js'
import {
  createDefaultExecutionService,
  type ExecutionAuthority,
  type ExecutionService,
} from '../../runtime/execution/service.js'
import { McpGatewayBlockedError, type CoreMcpGateway } from '../mcp/gateway.js'
import { classifyMcpFailure, classifyUnknownMcpFailure, mcpFailureMetadata } from '../mcp/errorTaxonomy.js'
import { formatDirectoryListing } from './directoryListing.js'
import { createGlobToolDefinition } from './glob.js'
import { createSkillToolDefinition, type SkillCatalog } from './skill.js'
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
import { resolveToolTarget } from './permissionContext.js'
import { validateToolArguments } from './arguments.js'
import { approvedResult, deniedResult, runtimeErrorResult } from './toolResultLifecycle.js'
import type { ToolExecutionResult } from '../../tools/types.js'
import { networkNotice, planSandboxedCommand, readSandboxRules } from '../../sandbox/osSandbox.js'
import { resolveCommandTimeout, DEFAULT_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS } from '../../runtime/execution/commandTimeout.js'

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

/**
 * How a command will be launched: the shell, its arguments, and the isolation
 * plan.
 *
 * Shared so the two ways a command can be started cannot disagree about either
 * of the safety decisions here. A path that composed its own argv would quietly
 * skip the sandbox, which is a real confinement boundary rather than a flag, and
 * the difference would only show up as a command running unjailed.
 */
function planCommandLaunch(
  command: string,
  context: ToolExecutionContext,
): { shellBin: string; shellArgs: string[]; sandbox: ReturnType<typeof planSandboxedCommand> } {
  const env = ShellManager.getActiveEnvironment()
  const isWindows = process.platform === 'win32'
  const shellBin = env.executionPath
  let shellArgs: string[]

  if (env.activeBackend === 'powershell') {
    shellArgs = ['-NoProfile', '-NonInteractive', '-Command', command]
  } else if (env.activeBackend === 'git-bash' || env.activeBackend === 'bash') {
    shellArgs = ['-c', command]
  } else if (env.activeBackend === 'wsl') {
    shellArgs = ['-e', 'sh', '-c', command]
  } else {
    shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command]
  }
  // OS-level isolation, when it has been turned on. The plan says which of the
  // three states applies, and an unavailable launcher is reported on the result
  // rather than quietly downgraded to no isolation.
  const sandbox = planSandboxedCommand({
    shell: shellBin,
    shellArgs,
    workspaceRoot: context.workspaceRoot,
  })
  return { shellBin, shellArgs, sandbox }
}

async function runCommandTool(
  executionService: ExecutionService,
  command: string,
  context: ToolExecutionContext,
  requestedTimeoutSeconds?: unknown,
) {
  if (!command || !command.trim()) {
    return deniedResult('Error: No command provided to execute.', {
      status: 'failed',
      exitCode: 1,
    })
  }
  // Refused rather than clamped: a value past the ceiling would otherwise be
  // silently replaced by something the caller did not ask for.
  const timeout = resolveCommandTimeout(requestedTimeoutSeconds)
  if (!timeout.ok) {
    return deniedResult(`Error: ${timeout.reason}`, { status: 'failed', exitCode: 1 })
  }
  const { shellBin, shellArgs, sandbox } = planCommandLaunch(command, context)
  // A refusal is not a command to run: the sandbox answered "I could not isolate
  // this and you asked me not to proceed without it". Running it anyway would be
  // the setting doing nothing, so it stops here.
  if (sandbox.state === 'refused') {
    return deniedResult(`Error: ${sandbox.notice ?? 'sandbox refused the command'}`, {
      status: 'failed',
      exitCode: 1,
    })
  }
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
    timeoutMs: timeout.timeoutMs,
    abortSignal: context.abortSignal,
    ...(context.commandEnv ? { env: context.commandEnv } : {}),
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

  // How the result was classified and which executor answered are decided by the
  // execution service; dropping them here would make the tool result unable to
  // say what kind of failure this was.
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
  mcpGateway?: Pick<CoreMcpGateway, 'invokeTool'>
  browserRuntimeStatus?: PwRuntimeStatus
  executionService?: ExecutionService
  /**
   * Skills the skill tool may load.
   *
   * Absent means no skill tool is registered at all: a tool that could only ever
   * answer "no such skill" is worse than no tool, because the model would keep
   * trying it.
   */
  skills?: SkillCatalog
}): ReadonlyMap<string, ToolDefinition> {
  const executionService = options?.executionService ?? createDefaultExecutionService()
  const tools: ToolDefinition[] = [
    {
      name: 'read',
      description: 'Read a file in the workspace, with optional line offset/limit pagination and safe truncation protection. Reading a directory path lists its direct contents instead, one level deep. Image files are reported, not returned: this harness reads text, so use bash to inspect an image.',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file or directory to read (e.g. package.json, src/index.ts, src).',
          },
          offset: {
            type: 'number',
            description: 'The 1-based starting line number, or entry number when reading a directory (default: 1).',
          },
          limit: {
            type: 'number',
            description: 'The maximum number of lines, or entries when reading a directory (default: 500, max: 1000).',
          },
        },
        required: ['path'],
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
          // A directory is a legitimate thing to read. Handing the model a raw
          // EISDIR instead of the names it asked for makes "what is in here"
          // unanswerable without shelling out, so the listing is answered here,
          // through the same ignore policy every other tool walks with.
          const stats = await fs.stat(containment.resolvedPath).catch(() => undefined)
          if (stats?.isDirectory()) {
            return approvedResult(
              await formatDirectoryListing({
                absolutePath: containment.resolvedPath,
                workspaceRoot: context.workspaceRoot,
                displayPath: selector.cleanPath,
                offset: typeof args.offset === 'number' ? args.offset : undefined,
                limit: typeof args.limit === 'number' ? args.limit : undefined,
              }),
            )
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
          // A read returns bytes from this invocation. Session identity and
          // file timestamps cannot prove earlier content is still visible to
          // this model, or that an external writer left the bytes unchanged.
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

        // Strip leading BOM so the model never sees an invisible \uFEFF character
        // that could pollute prompts or edits.
        const { text: cleanContent } = splitByteOrderMark(rawContent)
        const lines = cleanContent.split('\n')
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

        if (truncated.firstLineExceedsLimit) {
          const firstLineKb = Math.round((truncated.firstLineBytes ?? 0) / 1024)
          resultText = `[Line ${startLine} is ${firstLineKb}KB, exceeds 50KB limit. Use bash: sed -n '${startLine}p' ${selector.cleanPath} | head -c 51200]`
        } else if (truncated.truncated) {
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
      async execute(args, context) {
        // The read decides the write, so both sit under one lock: taking it
        // only for the write would let two edits read the same original.
        validateToolArguments(this.argsSchema, args)
        return withFileLock(resolveToolTarget(args, 'path', context.workspaceRoot), async () => {
          const target = resolveToolTarget(args, 'path', context.workspaceRoot)
          const containment = verifyPathContainment(target, context.workspaceRoot)
          if (!containment.allowed) {
            throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
          }
          const content = args.content as string
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
          })
      },
    },
    {
      name: 'edit',
      description: 'Edit an existing file: several targeted replacements in one call, or full replacement content. Each file commits independently; multi-file edits are not atomic. If editing a later file fails, earlier changes remain. Use /undo to inspect the latest snapshot or /restore to explicitly restore individual recorded edits.',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to edit.',
          },
          content: {
            type: 'string',
            description:
              'The full replacement content for the file. An alternative to edits/oldText+newText, not a companion: give one form.',
          },
          edits: {
            type: 'array',
            minItems: 1,
            description:
              'Targeted replacements, applied as one edit or none. Each is matched against the original file, not against the result of the previous one, and they must not overlap — merge nearby changes into one edit instead.',
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', description: 'The exact or fuzzy block of text to replace.' },
                newText: { type: 'string', description: 'The text to put in its place.' },
              },
              required: ['oldText', 'newText'],
            },
          },
          oldText: {
            type: 'string',
            description: 'The exact or fuzzy block of text to replace (single-replacement form).',
          },
          newText: {
            type: 'string',
            description: 'The new text to replace oldText with.',
          },
          replaceAll: {
            type: 'boolean',
            description:
              'Whether to replace every occurrence of oldText. Applies to the single-replacement form only.',
          },
        },
        required: ['path'],
        oneOf: [
          { required: ['content'], not: { anyOf: [{ required: ['edits'] }, { required: ['oldText'] }, { required: ['newText'] }, { required: ['replaceAll'] }] } },
          { required: ['edits'], not: { anyOf: [{ required: ['content'] }, { required: ['oldText'] }, { required: ['newText'] }, { required: ['replaceAll'] }] } },
          { required: ['oldText', 'newText'], not: { anyOf: [{ required: ['content'] }, { required: ['edits'] }] } },
        ],
      },
      async execute(args, context) {
        // Read-modify-write under one lock. The read is what decides the write,
        // so locking only the write would still let two edits read the same
        // original and lose the first one's change without an error.
        validateToolArguments(this.argsSchema, args)
        return withFileLock(resolveToolTarget(args, 'path', context.workspaceRoot), async () => {
        const target = resolveToolTarget(args, 'path', context.workspaceRoot)
        const containment = verifyPathContainment(target, context.workspaceRoot)
        if (!containment.allowed) {
          throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
        }

        const relPath = path.relative(context.workspaceRoot, containment.resolvedPath)
        let original = ''
        let originalUnreadable = false
        let finalContent = ''
        let expectedContent: string | undefined
        const segmentEdits = args.edits as Array<{ oldText: string; newText: string }> | undefined
        if (segmentEdits) {
          const raw = await executionService.readTextFile({
            operationKind: 'file.read',
            absolutePath: containment.resolvedPath,
            workspaceRoot: context.workspaceRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY,
            caller: 'core-tool:edit',
            reason: 'Read original content for targeted replacements.',
            reportSafeTarget: containment.resolvedPath,
          })
          // Same treatment as the single-edit form: the file's own shape is
          // separated out before matching and put back before writing, because a
          // model never types the mark or the carriage returns.
          const { bom, text: content } = splitByteOrderMark(raw)
          expectedContent = raw
          const lineEnding = detectLineEnding(content)
          original = content
          const replaceRes = replaceManyInContent(
            toUnixLines(content),
            segmentEdits.map((segment) => ({
              oldText: toUnixLines(splitByteOrderMark(segment.oldText).text),
              newText: toUnixLines(splitByteOrderMark(segment.newText).text),
            })),
          )
          if (!replaceRes.success) {
            throw new Error(replaceRes.error ?? 'Failed to apply replacements.')
          }
          finalContent = bom + withLineEnding(replaceRes.content, lineEnding)
        } else if (typeof args.oldText === 'string' && typeof args.newText === 'string') {
          const raw = await executionService.readTextFile({
            operationKind: 'file.read',
            absolutePath: containment.resolvedPath,
            workspaceRoot: context.workspaceRoot,
            authority: TOOL_APPROVED_READ_AUTHORITY,
            caller: 'core-tool:edit',
            reason: 'Read original content for resilient replacement.',
            reportSafeTarget: containment.resolvedPath,
          })
          // The file's own shape is separated out before matching and put back
          // before writing. A model never types the mark or the carriage returns,
          // so leaving them in the text makes a pattern that cannot be found, and
          // returning them untouched is the only way the file keeps its style.
          const { bom, text: content } = splitByteOrderMark(raw)
          expectedContent = raw
          const lineEnding = detectLineEnding(content)
          original = content
          // If the model copied a leading BOM into oldText (or newText), strip it
          // so matching operates on clean text, while preserving the file's BOM on write.
          const cleanOld = splitByteOrderMark(args.oldText).text
          const cleanNew = splitByteOrderMark(args.newText).text
          const replaceRes = replaceInContent(
            toUnixLines(content),
            toUnixLines(cleanOld),
            toUnixLines(cleanNew),
            { replaceAll: Boolean(args.replaceAll) },
          )
          if (!replaceRes.success) {
            throw new Error(replaceRes.error ?? 'Failed to apply replacement.')
          }
          finalContent = bom + withLineEnding(replaceRes.content, lineEnding)
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
            expectedContent = original
          } catch {
            originalUnreadable = true
          }
          finalContent = args.content
        } else {
          throw new Error("Must provide 'content', 'edits', or both 'oldText' and 'newText'.")
        }

        await executionService.writeTextFile({
          operationKind: 'file.write',
          absolutePath: containment.resolvedPath,
          content: finalContent,
          expectedContent,
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
        })
      },
    },
    createGlobToolDefinition(executionService),
    createGrepToolDefinition(executionService),
    {
      name: 'bash',
      description: 'Execute shell commands, including Git operations. Plan mode permits classified inspection commands such as git branch --show-current and git rev-parse --show-toplevel. Git status, diff, log, and show require approval because repository configuration can run helpers. Set runInBackground for a command that outlives this turn; read it back with taskOutput and end it with taskStop.',
      argsSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command line to execute.',
          },
          timeout: {
            type: 'number',
            description: `Optional timeout in seconds. Defaults to ${DEFAULT_COMMAND_TIMEOUT_MS / 1000} seconds; the maximum is ${MAX_COMMAND_TIMEOUT_MS / 1000}. Raise it for a build, an install, or a full test run that needs longer. Ignored when runInBackground is set, because such a command is not waited on.`,
          },
          runInBackground: {
            type: 'boolean',
            description:
              'Start the command and return immediately instead of waiting for it. Use it for something that takes longer than this turn should be held open, then read it with taskOutput. The command keeps running if the turn ends.',
          },
        },
        required: ['command'],
      },
      async execute(args, context) {
        const command = typeof args.command === 'string' ? args.command : ''
        if (args.runInBackground === true) {
          return startBackgroundCommand(command, context, args.timeout)
        }
        return runCommandTool(executionService, command, context, args.timeout)
      },
    },
    createTaskOutputToolDefinition(),
    createTaskStopToolDefinition(),
    createWebFetchToolDefinition(),
    createWebSearchToolDefinition(),
    createLspToolDefinition(executionService),
    createAskToolDefinition(),
    createTodoToolDefinition(),
    createTaskToolDefinition(),
    createUnifiedBrowserToolDefinition(),
  ]

  if (options?.skills && options.skills.size > 0) {
    tools.push(createSkillToolDefinition(options.skills))
  }

  for (const tool of options?.mcpTools ?? []) {
    tools.push({
      name: tool.qualifiedName,
      description: `[MCP:${tool.serverName}] ${tool.description}`,
      argsSchema: tool.inputSchema ?? { type: 'object' },
      mcpAnnotations: { readOnlyHint: tool.annotations?.readOnlyHint === true },
      async execute(args, _context) {
        if (!options?.mcpGateway) {
          // A tool without its gateway is a registration mistake, and the
          // mistake is best said here rather than answered with a fake
          // success the model cannot recover from.
          return deniedResult(
            `The MCP gateway is not connected, so ${tool.qualifiedName} cannot be called. Report this to the user.`,
          )
        }
        try {
          const answer = await options.mcpGateway.invokeTool(
            tool.serverName,
            tool.toolName,
            args,
          )
          if (answer.isError) {
            // The server answered, and what it said is a failure in its own
            // words. Handed back as success the model would believe the call
            // worked; as a failure it can react, or tell the user what the
            // server said.
            return deniedResult(
              `${tool.qualifiedName} failed on server "${tool.serverName}": ${answer.content}`,
            )
          }
          return approvedResult(answer.content)
        } catch (error) {
          const failure = error instanceof McpGatewayBlockedError
            ? classifyMcpFailure({ failureClass: error.mcpFailureClass, detail: error.mcpSafeDetail })
            : classifyUnknownMcpFailure(error)
          return runtimeErrorResult(
            `[MCP ${failure.failureClass}; ${failure.failurePlane}] ${failure.safeDetail}`,
            mcpFailureMetadata(failure),
          )
        }
      },
    })
  }
  return new Map(tools.map(tool => [tool.name, tool]))
}

/**
 * Start a command and come back to it.
 *
 * The command is not waited on, so the answer is a handle rather than an outcome.
 * Saying which handle is the whole point: without it there is no way to ask what
 * happened, and a command nobody can ask about is indistinguishable from one that
 * never ran.
 */
/**
 * Start a command that outlives the turn.
 *
 * A background command is the same command as a foreground one: it is planned
 * through the same launcher, so it carries the same isolation rather than
 * running bare on the host. The only thing that differs is that nothing waits
 * for it.
 *
 * A timeout is refused rather than ignored. There is no deadline to enforce on
 * work that deliberately continues past the turn, so accepting a number here
 * would report a limit that nothing applies — and a caller who asked for one
 * means to stop it, which is what taskStop is for.
 */
function startBackgroundCommand(
  command: string,
  context: ToolExecutionContext,
  requestedTimeoutSeconds?: unknown,
): ToolExecutionResult {
  // Output past the in-memory limit goes beside this session's other artifacts,
  // so the file a reader is pointed at sits with the ones the foreground tools
  // write rather than in a directory of its own.
  TaskRegistry.getShared().spillDirectory = ArtifactManager.getShared(
    context.workspaceRoot,
  ).directory;
  if (!command.trim()) {
    return deniedResult('Error: No command provided to execute.', { status: 'failed', exitCode: 1 })
  }
  if (requestedTimeoutSeconds !== undefined) {
    return deniedResult(
      'Error: a background command has no timeout, because nothing waits for it. Start it without one and stop it with taskStop.',
      { status: 'failed', exitCode: 1 },
    )
  }
  const { sandbox } = planCommandLaunch(command, context)
  // Same refusal as the foreground path: a background command is not a way to
  // run something the sandbox declined to isolate.
  if (sandbox.state === 'refused') {
    return deniedResult(`Error: ${sandbox.notice ?? 'sandbox refused the command'}`, {
      status: 'failed',
      exitCode: 1,
    })
  }
  const task = backgroundTasks.start({
    command,
    cwd: context.workspaceRoot,
    ...(sandbox.command && sandbox.args
      ? { shell: { command: sandbox.command, args: [...sandbox.args] } }
      : {}),
    ...(context.commandEnv ? { env: context.commandEnv } : {}),
  })
  if (task.failure) {
    return deniedResult(`Error: the command could not be started: ${task.failure}`, {
      status: 'failed',
      exitCode: 1,
    })
  }
  const isolation = sandbox.state === 'isolated'
    ? `\n[sandbox] ${sandbox.notice ?? 'Runs inside the workspace sandbox.'}`
    : sandbox.notice
      ? `\n[sandbox] ${sandbox.notice}`
      : ''
  return approvedResult(
    `Started ${task.id} in the background.\n${renderTask(task)}${isolation}\n\n` +
      `Read it with taskOutput, or stop it with taskStop. It keeps running if this turn ends.`,
  )
}

/** What a background command has produced, and whether it is still going. */
function createTaskOutputToolDefinition(): ToolDefinition {
  return {
    name: 'taskOutput',
    description:
      'Read what a command started with runInBackground has produced. Reports whether it is still running and how it ended.',
    argsSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The identifier the background command was started under.' },
        all: { type: 'boolean', description: 'List running commands and the most recent 100 completions instead of one.' },
      },
    },
    async execute(args) {
      if (args.all === true) {
        const tasks = backgroundTasks.list()
        if (tasks.length === 0) return approvedResult('No background commands have been started.')
        return approvedResult(tasks.map(renderTask).join('\n\n'))
      }
      const id = typeof args.taskId === 'string' ? args.taskId.trim() : ''
      if (!id) {
        return deniedResult('Error: give a taskId, or set all to list every background command.')
      }
      const task = backgroundTasks.get(id)
      if (!task) {
        return deniedResult(
          `Error: no background command named '${id}'. Known: ${backgroundTasks.list().map((t) => t.id).join(', ') || 'none'}.`,
        )
      }
      return approvedResult(renderTask(task))
    },
  }
}

/**
 * Stop a command that was started in the background.
 *
 * Refused rather than reported as success when nothing matched: a caller that
 * believes it stopped something and did not has a process still running under a
 * name it will not ask about again.
 */
function createTaskStopToolDefinition(): ToolDefinition {
  return {
    name: 'taskStop',
    description: 'Stop a command started with runInBackground, by signalling its whole process group.',
    argsSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The identifier of the command to stop.' },
      },
      required: ['taskId'],
    },
    async execute(args) {
      const id = typeof args.taskId === 'string' ? args.taskId.trim() : ''
      if (!id) return deniedResult('Error: taskStop needs a taskId.')
      const stopped = await backgroundTasks.stop(id)
      if (!stopped) {
        const task = backgroundTasks.get(id)
        return deniedResult(
          task
            ? `Error: ${id} is not running any more (${task.state}).`
            : `Error: no background command named '${id}'.`,
        )
      }
      return approvedResult(`Stop requested for ${id}. Check taskOutput for the observed result.`)
    },
  }
}
