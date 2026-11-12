import path from 'node:path'
import { verifyPathContainment } from '../security/pathJail.js'
import { resolveWorkspaceRoot } from '../workspace/roots.js'
import { startBackgroundCommand, createTaskOutputToolDefinition, createTaskStopToolDefinition, createTaskWaitToolDefinition } from './shell/background.js';
import { planCommandLaunch } from './shell/launch.js';
import { TOOL_APPROVED_COMMAND_AUTHORITY } from './shell/authority.js';
import { withFileLock } from '../../runtime/execution/fileLock.js'
import { createUnifiedDiff } from '../../presentation/tui/transcript/diff.js'
import { truncateTail } from './truncation.js'
import { ArtifactManager } from '../session/artifactManager.js'
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
import { createTeamToolDefinition } from './teamTool.js'
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
import { networkNotice, readSandboxRules } from '../../sandbox/osSandbox.js'
import { resolveCommandTimeout, DEFAULT_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS } from '../../runtime/execution/commandTimeout.js'
import { createPatchToolDefinition } from '../../edit/patch/tool.js'
import { createEditToolDefinition } from '../../edit/tool.js'
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


/**
 * Why a write was refused, and how to allow it.
 *
 * The refusal is a jail, not a permission question: nothing the model can say
 * changes it, and a bare "outside workspace" reads as an arbitrary restriction
 * rather than a boundary with a way through. The way through is a command the
 * user runs, so the message names it — the model can then ask for it instead of
 * retrying a call that cannot succeed.
 */
function outsideWorkspaceMessage(reason: string | undefined, target: string, workspaceRoot: string): string {
  const why = reason ?? `Target '${target}' is outside the workspace.`
  return `${why} Writes are limited to the workspace (${workspaceRoot}) and the roots the user attaches. `
    + `To allow this path, the user can run /workspace add <path> --write, then retry.`
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
  // A default-timeout foreground command is spawned once and adopted by the
  // job owner. Keep the bounded background deadline on the native handle too;
  // the foreground race only releases the turn and must not remove the limit.
  const promotable = requestedTimeoutSeconds === undefined && context.background?.adopt && context.background.promote
    && context.onOutput && executionService.startCommand
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
    ...(promotable ? { timeoutMs: 300_000 } : {}),
  }
  // An interactive default-timeout command is spawned once and adopted by the
  // job owner. If it outlives the foreground window it is promoted in place,
  // keeping the same PID; an explicit timeout keeps the ordinary path.
  let result: Awaited<ReturnType<ExecutionService['runCommand']>>
  if (promotable) {
    const started = executionService.startCommand!(request)
    const task = context.background!.adopt!(started.handle, { command, cwd: context.workspaceRoot, timeoutMs: 300_000,
      authority: TOOL_APPROVED_COMMAND_AUTHORITY, ...(context.commandEnv ? { env: context.commandEnv } : {}) })
    const deadline = new Promise<'timeout'>(resolve => {
      const timer = setTimeout(() => resolve('timeout'), DEFAULT_COMMAND_TIMEOUT_MS)
      timer.unref?.()
    })
    const promotionRace = context.background!.whenPromoted
      ? context.background!.whenPromoted(task.id).then(outcome => ({ kind: 'promotion' as const, outcome }))
      : undefined
    const raced = await Promise.race([
      started.result.then(value => ({ kind: 'result' as const, value })),
      deadline.then(() => ({ kind: 'timeout' as const })),
      ...(promotionRace ? [promotionRace] : []),
    ])
    if (raced.kind === 'promotion') {
      if (raced.outcome === 'promoted') {
        started.handle.detach()
        return approvedResult(`Moved to the background as ${task.id}. It keeps the same process; read it with taskOutput and stop it with taskStop.`)
      }
      if (raced.outcome === 'refused') {
        await started.handle.kill()
        return deniedResult('Error: the command could not be moved to the background and was stopped. Nothing is still running.', { status: 'failed', exitCode: 1 })
      }
      result = await started.result
    } else if (raced.kind === 'timeout') {
      started.handle.detach()
      const promotion = context.background!.promote!(task.id)
      if (promotion === 'refused') {
        await started.handle.kill()
        return deniedResult('Error: the command could not be moved to the background and was stopped. Nothing is still running.', { status: 'failed', exitCode: 1 })
      }
      if (promotion === 'promoted')
        return approvedResult(`Moved to the background as ${task.id} after ${DEFAULT_COMMAND_TIMEOUT_MS / 1000} seconds. It keeps the same process; read it with taskOutput and stop it with taskStop.`)
      // It finished between the deadline and the promotion; report the result.
      result = await started.result
    } else result = raced.value
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
  //
  // The raw streams are deliberately absent. `finalOutput` already carries what
  // the model reads, and a second copy under `metadata` would be written into
  // the transcript beside every command result — doubling its size, without a
  // consumer: no reader of a tool result's metadata looks at `stdout`/`stderr`.
  // A reader that needs the full bytes is pointed at the artifact instead.
  const executionProvenance = {
    executionPath: result.executionPath,
    errorClass: result.errorClass,
  }

  if (isOk) {
    return approvedResult(finalOutput, {
      ...executionProvenance,
      status: result.status,
      exitCode: result.exitCode,
    })
  }

  return deniedResult(finalOutput, {
    ...executionProvenance,
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
          // No attached roots means the primary root is the only authority, and the
          // lexical fence below already describes that refusal without touching
          // the filesystem.
          const root = context.workspaceRoots?.length
            ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'write') ?? context.workspaceRoot
            : context.workspaceRoot
          const containment = verifyPathContainment(target, root)
          if (!containment.allowed) {
            throw new Error(outsideWorkspaceMessage(containment.reason, target, root))
          }
          const content = args.content as string
          const relPath = path.relative(root, containment.resolvedPath)
          let original = ''
          let originalUnreadable = false
          try {
            original = await executionService.readTextFile({
              operationKind: 'file.read',
              assertFileAccess: context.assertFileAccess,
              abortSignal: context.abortSignal,
              absolutePath: containment.resolvedPath,
              workspaceRoot: root,
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
            workspaceRoot: root,
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
    createEditToolDefinition(executionService),
    createGlobToolDefinition(executionService),
    createGrepToolDefinition(executionService),
    {
      name: 'bash',
      description: 'Execute shell commands, including Git operations. Plan mode permits classified inspection commands such as git branch --show-current and git rev-parse --show-toplevel. Git status, diff, log, and show require approval because repository configuration can run helpers. Set runInBackground for a command that outlives this turn; wait for it with taskWait, read it with taskOutput, and end it with taskStop. To wait for something, use taskWait rather than sleeping in this tool.',
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
    createTeamToolDefinition(),
    createTaskOutputToolDefinition(),
    createTaskWaitToolDefinition(),
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
