import { writeTextFile } from './write.js'
import { readTextFile } from './read.js'
import { readTextPage } from './page.js'
import { readMedia } from './media/index.js'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import { executeLocally } from './local.js'
import type { NormalizedExecutionResult } from './types.js'
import {
  classifyCommandExecutionOutcome,
  type ExecutionErrorClass,
} from './error.js'
import {
  createCommandExecutionReceipt,
  type RuntimeExecutionReceiptProjection,
} from './receipt.js'
export * from './types.js'
import { listWorkspaceFiles } from './fileWalk.js'
export {
  listWorkspaceFiles,
  listDirectoryEntries,
  type FileWalkOptions,
  type DirectoryEntry,
} from './fileWalk.js'
import type {
  CommandExecutionRequest,
  CommandExecutionResult,
  ExecutionAuthorityMode,
  ExecutionEvent,
  ExecutionPath,
  ExecutionService,
  FileListExecutionRequest,
  TextFileReadExecutionRequest,
} from './types.js'

export function createDefaultExecutionService(): ExecutionService {
  return {
    readTextFile,
    readTextPage,
    readMedia,
    writeTextFile,
    async listFilesRecursive(request) {
      request.abortSignal?.throwIfAborted()
      const checked = verifyPathContainment(request.absoluteRoot, request.workspaceRoot)
      if (!checked.allowed) throw new Error('Listing root is outside the workspace.')
      return listWorkspaceFiles(checked.resolvedPath, {
        ...request.walkOptions,
        assertFileAccess: request.assertFileAccess ?? request.walkOptions?.assertFileAccess,
        abortSignal: request.abortSignal ?? request.walkOptions?.abortSignal,
      })
    },
    runCommand(request) {
      return runCommand(request)
    },
  }
}

async function runCommand(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
  const localResult = await executeLocally({
    command: request.command,
    args: [...request.args],
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    // Forwarded, and the only path that could have: the branch that used to be
    // taken by default (the daemon) passed this through, while this one dropped
    // it. With the daemon gone this is the only route a command takes, so the
    // omission became universal — Ctrl+C left a command running to completion
    // and reported it as `completed`.
    ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
    ...(request.env ? { env: request.env } : {}),
    ...(request.onOutput ? { onOutput: request.onOutput } : {}),
    ...(request.onStdin ? { onStdin: request.onStdin } : {}),
    ...(request.onStdout ? { onStdout: request.onStdout } : {}),
    ...(request.onStderr ? { onStderr: request.onStderr } : {}),
    ...(request.captureOutput !== undefined ? { captureOutput: request.captureOutput } : {}),
    ...(request.cleanupTreeOnExit ? { cleanupTreeOnExit: true } : {}),
  })

  return withCommandExecutionProjection(request, 'ts-local', localResult)
}

function withCommandExecutionProjection(
  request: CommandExecutionRequest,
  executionPath: ExecutionPath,
  result: NormalizedExecutionResult & { readonly recoveryReason?: string },
): CommandExecutionResult {
  const classification = classifyCommandExecutionOutcome({
    status: result.status,
    exitCode: result.exitCode,
    failureKind: result.failureKind,
    authorityMode: request.authority.mode,
    stderr: result.stderr,
    recoveryReason: result.recoveryReason,
  })
  const projected = {
    ...result,
    executionPath,
    errorClass: classification.errorClass,
  }
  return {
    ...projected,
    events: commandEvents(request, executionPath, {
      status: result.status,
      exitCode: result.exitCode,
      failureKind: result.failureKind,
      recoveryReason: result.recoveryReason,
    }),
    receipt: createCommandExecutionReceipt({
      request,
      result: projected,
    }),
  }
}

function commandEvents(
  request: CommandExecutionRequest,
  executionPath: ExecutionPath,
  result: {
    readonly status: CommandExecutionResult['status']
    readonly exitCode: number | null
    readonly failureKind?: CommandExecutionResult['failureKind']
    readonly recoveryReason?: string
  },
): readonly ExecutionEvent[] {
  const started: ExecutionEvent = {
    kind: 'execution.started',
    operationKind: 'command.run',
    executionPath,
    authorityMode: request.authority.mode,
    caller: request.caller,
    reportSafeCommand: request.reportSafeCommand,
    ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
  }

  if (result.status === 'completed') {
    return [
      started,
      {
        kind: 'execution.exited',
        operationKind: 'command.run',
        executionPath,
        authorityMode: request.authority.mode,
        status: 'completed',
        exitCode: result.exitCode,
      },
    ]
  }

  const failureKind = inferFailureKind(result.status, result.failureKind)
  const kind =
    result.status === 'timeout'
      ? 'execution.timed_out'
      : result.status === 'cancelled'
        ? 'execution.cancelled'
        : 'execution.failed'

  return [
    started,
    {
      kind,
      operationKind: 'command.run',
      executionPath,
      authorityMode: request.authority.mode,
      status: result.status,
      exitCode: result.exitCode,
      failureKind,
      ...(result.recoveryReason ? { recoveryReason: result.recoveryReason } : {}),
    },
  ]
}

function inferFailureKind(
  status: CommandExecutionResult['status'],
  failureKind: CommandExecutionResult['failureKind'] | undefined,
): 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled' {
  if (failureKind) {
    return failureKind
  }
  if (status === 'timeout') {
    return 'timeout'
  }
  if (status === 'cancelled') {
    return 'cancelled'
  }
  return 'execution_failure'
}
