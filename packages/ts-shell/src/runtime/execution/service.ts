import { promises as fs } from 'node:fs'
import { withFileLock } from './fileLock.js'
import { FileContentConflictError } from './conflict.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createWorkspaceWriteAuthority } from '../../edit/authority/workspace.js'
import { buildEditSnapshotStoreConfig } from '../../edit/recovery/editSnapshot.js'
import { captureRecoveryAuthorityRecord } from '../../edit/recovery/recoveryAuthorityStore.js'
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
  TextFileWriteExecutionRequest,
} from './types.js'

export function createDefaultExecutionService(): ExecutionService {
  return {
    readTextFile(request) {
      return fs.readFile(request.absolutePath, 'utf8')
    },
    async writeTextFile(request) {
      // Held across the whole write, and taken by anyone who writes. A caller
      // that read first then wrote through here has its read covered too, as
      // long as it took the lock around both — the bare write is the last line
      // of defence, not the whole guarantee.
      return withFileLock(request.absolutePath, () => writeTextFileUnlocked(request))
    },
    listFilesRecursive(request) {
      return listWorkspaceFiles(request.absoluteRoot, request.walkOptions)
    },
    runCommand(request) {
      return runCommand(request)
    },
  }
}

/**
 * Record a pre-write snapshot, best effort.
 *
 * A snapshot exists so a write can be taken back. Failing to record one must not
 * block the write: the write itself is already gated by the workspace authority
 * and the approval path. A missing snapshot degrades /undo for that one change,
 * which /undo already reports as "nothing to undo".
 */
/**
 * The write itself, with the lock already held by the caller.
 *
 * Split out so the lock is taken in exactly one place and nothing can reach the
 * filesystem without passing through it.
 */
async function writeTextFileUnlocked(request: TextFileWriteExecutionRequest): Promise<void> {
  const relativePath = path.relative(request.workspaceRoot, request.absolutePath)
  // A target outside the workspace root cannot be expressed as a relative path,
  // so the authority refuses it rather than writing through.
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      `Refuse to write outside the selected workspace: ${request.reportSafeTarget}`,
    )
  }
  const authority = createWorkspaceWriteAuthority(request.workspaceRoot)
  await fs.mkdir(path.dirname(request.absolutePath), { recursive: true })
  // Record what the file held before the write, so /undo and /restore have
  // something to take back. Captured under the same authority the write uses: a
  // snapshot of a target the write would refuse is worse than none, because it
  // reads as recoverable.
  const before = existsSync(request.absolutePath)
    ? authority.readVerifiedFile(relativePath)
    : undefined
  if (request.expectedContent !== undefined && before !== request.expectedContent) {
    throw new FileContentConflictError(request.reportSafeTarget)
  }
  await captureSnapshotBeforeWrite({
    workspaceRoot: request.workspaceRoot,
    relativePath,
    before,
  })
  // Snapshot persistence yields to other writers. Compare again immediately
  // before the synchronous write, even if snapshot storage failed. This detects
  // observed external edits; it is not an atomic filesystem compare-and-swap.
  if (request.expectedContent !== undefined
    && authority.readVerifiedFile(relativePath) !== request.expectedContent) {
    throw new FileContentConflictError(request.reportSafeTarget)
  }
  if (existsSync(request.absolutePath)) {
    // Existing targets are opened with O_NOFOLLOW and re-verified through the
    // opened descriptor, so a symlink swapped in after the check still loses.
    authority.writeFile(relativePath, request.content)
    return
  }
  authority.createFileExclusive(relativePath, request.content)
}

async function captureSnapshotBeforeWrite(input: {
  workspaceRoot: string
  relativePath: string
  before: string | undefined
}): Promise<void> {
  try {
    await captureRecoveryAuthorityRecord({
      ...buildEditSnapshotStoreConfig({
        workspaceRoot: input.workspaceRoot,
        targetPath: input.relativePath,
      }),
      recordId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      workspaceRelativePath: input.relativePath,
      operationKind: input.before === undefined ? 'create' : 'update',
      beforeState: input.before === undefined ? 'absent' : 'exists',
      ...(input.before !== undefined ? { beforeContent: input.before } : {}),
      expectedCurrentState: input.before === undefined ? 'absent' : 'exists',
      ...(input.before !== undefined ? { expectedCurrentContent: input.before } : {}),
    })
  } catch {
    // Snapshot storage is a recovery aid, never a precondition for writing.
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
