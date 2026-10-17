import fs from 'node:fs/promises'
import path from 'node:path'
import { verifyPathContainment } from '../security/pathJail.js'
import { replaceInContent, replaceManyInContent } from './editEngine.js'
import { startBackgroundCommand, createTaskOutputToolDefinition, createTaskStopToolDefinition } from './shell/background.js';
import { planCommandLaunch } from './shell/launch.js';
import { TOOL_APPROVED_COMMAND_AUTHORITY } from './shell/authority.js';
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
import { parsePathSelector } from './selectorParser.js'
import {
  createDefaultExecutionService,
  type ExecutionAuthority,
  type ExecutionService,
} from '../../runtime/execution/service.js'
import { McpGatewayBlockedError, type CoreMcpGateway } from '../mcp/gateway.js'
import { classifyMcpFailure, classifyUnknownMcpFailure, mcpFailureMetadata } from '../mcp/errorTaxonomy.js'
import { createGlobToolDefinition } from './glob.js'
import { createReadToolDefinition } from './read.js'
import { createSkillToolDefinition, type SkillCatalog } from './skill.js'
import { createGrepToolDefinition } from './grep.js'
import { createWebFetchToolDefinition } from './webFetch.js'
import { createWebSearchToolDefinition } from './webSearch.js'
import { createLspToolDefinition } from './lsp.js'
import { createUnifiedBrowserToolDefinition } from './browserToolUnified.js'
import { createDesktopToolDefinition } from '../../desktop/tool.js'
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
import { networkNotice, readSandboxRules } from '../../sandbox/osSandbox.js'
import { resolveCommandTimeout, DEFAULT_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS } from '../../runtime/execution/commandTimeout.js'
import { createPatchToolDefinition } from '../../edit/patch/tool.js'
import { startCommandProof } from '../../runtime/execution/proof.js'

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
  const proof = startCommandProof(command, context)
  context.commandProof?.started(proof, context.assertSourceAccess)
  const request = {
    operationKind: 'command.run' as const,
    command: sandbox.command ?? shellBin,
    args: sandbox.args ?? shellArgs,
    cwd: context.workspaceRoot,
    workspaceRoot: context.workspaceRoot,
    authority: TOOL_APPROVED_COMMAND_AUTHORITY,
    caller: 'core-tool:bash',
    reason: 'Run an approved workspace command.',
    reportSafeCommand: command,
    abortSignal: context.abortSignal,
    ...(context.commandEnv ? { env: context.commandEnv } : {}),
    ...(context.onOutput ? { onOutput: context.onOutput } : {}),
  }
  // An interactive default-timeout command is spawned once and adopted by the
  // job owner. If it outlives the foreground window it is promoted in place,
  // keeping the same PID; an explicit timeout keeps the ordinary path.
  const promotable = requestedTimeoutSeconds === undefined && context.background?.adopt && context.background.promote
    && context.onOutput && executionService.startCommand
  let result: Awaited<ReturnType<ExecutionService['runCommand']>>
  if (promotable) {
    const started = executionService.startCommand!(request)
    const task = context.background!.adopt!(started.handle, { command, cwd: context.workspaceRoot, timeoutMs: 300_000,
      authority: TOOL_APPROVED_COMMAND_AUTHORITY, ...(context.commandEnv ? { env: context.commandEnv } : {}) })
    const deadline = new Promise<'timeout'>(resolve => {
      const timer = setTimeout(() => resolve('timeout'), DEFAULT_COMMAND_TIMEOUT_MS)
      timer.unref?.()
    })
    const raced = await Promise.race([
      started.result.then(value => ({ kind: 'result' as const, value })),
      deadline.then(() => ({ kind: 'timeout' as const })),
    ])
    if (raced.kind === 'timeout') {
      started.handle.detach()
      if (!context.background!.promote!(task.id)) {
        await started.handle.kill()
        return deniedResult('Error: the command could not be moved to the background and was stopped. Nothing is still running.', { status: 'failed', exitCode: 1 })
      }
      return approvedResult(`Moved to the background as ${task.id} after ${DEFAULT_COMMAND_TIMEOUT_MS / 1000} seconds. It keeps the same process; read it with taskOutput and stop it with taskStop.`)
    }
    result = raced.value
  } else {
    result = await executionService.runCommand({ ...request, timeoutMs: timeout.timeoutMs })
  }
  context.commandProof?.settled({ ...proof, settledAt: new Date().toISOString(), status: result.status, exitCode: result.exitCode }, context.assertSourceAccess)
  const artifactManager = ArtifactManager.getShared(context.workspaceRoot, context.sessionId)
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
    createReadToolDefinition(executionService),
    createPatchToolDefinition(),
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
              assertFileAccess: context.assertFileAccess,
              abortSignal: context.abortSignal,
              absolutePath: containment.resolvedPath,
              workspaceRoot: context.workspaceRoot,
              authority: TOOL_APPROVED_READ_AUTHORITY,
              caller: 'core-tool:write',
              reason: 'Read original content for diff.',
              reportSafeTarget: containment.resolvedPath,
            })
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
            originalUnreadable = true
          }
          const written = await executionService.writeTextFile({
            operationKind: 'file.write',
            ...(context.sessionId ? { editIdentity: { sessionId: context.sessionId, workspaceRoot: context.artifactRoot ?? context.workspaceRoot, callId: context.taskId, correlationId: context.correlationId } } : {}),
            assertFileAccess: context.assertFileAccess,
            abortSignal: context.abortSignal,
            absolutePath: target,
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
          return approvedResult(output, written ? { ...written } : { status: 'unverified' })
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
            assertFileAccess: context.assertFileAccess,
            abortSignal: context.abortSignal,
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
            assertFileAccess: context.assertFileAccess,
            abortSignal: context.abortSignal,
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
              assertFileAccess: context.assertFileAccess,
              abortSignal: context.abortSignal,
              absolutePath: containment.resolvedPath,
              workspaceRoot: context.workspaceRoot,
              authority: TOOL_APPROVED_READ_AUTHORITY,
              caller: 'core-tool:edit',
              reason: 'Read original content for diff.',
              reportSafeTarget: containment.resolvedPath,
            })
            expectedContent = original
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
            originalUnreadable = true
          }
          finalContent = args.content
        } else {
          throw new Error("Must provide 'content', 'edits', or both 'oldText' and 'newText'.")
        }

        const written = await executionService.writeTextFile({
          operationKind: 'file.write',
            ...(context.sessionId ? { editIdentity: { sessionId: context.sessionId, workspaceRoot: context.artifactRoot ?? context.workspaceRoot, callId: context.taskId, correlationId: context.correlationId } } : {}),
          assertFileAccess: context.assertFileAccess,
          abortSignal: context.abortSignal,
          absolutePath: target,
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
        return approvedResult(output, written ? { ...written } : { status: 'unverified' })
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
            description: `Optional timeout in seconds. Foreground defaults to ${DEFAULT_COMMAND_TIMEOUT_MS / 1000} seconds; the maximum is ${MAX_COMMAND_TIMEOUT_MS / 1000}. Session-owned background jobs default to 300 seconds and accept 1–300 seconds; unbound legacy background callers refuse an explicit timeout.`,
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
    createDesktopToolDefinition(executionService),
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
      async execute(args, context) {
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
            undefined,
            { signal: context.abortSignal, contractId: tool.contractId },
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
