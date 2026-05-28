import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  checkRustDaemonAvailability,
  executeLocally,
  executeViaRustDaemon,
  isRustDaemonEnabled,
  type NormalizedExecutionResult,
} from '../../daemon/client.js'

export type ExecutionPath = 'ts-local' | 'rust-daemon'
export type ExecutionOperationKind =
  | 'command.run'
  | 'file.read'
  | 'file.write'
  | 'file.list'

export type ExecutionAuthorityMode =
  | 'none-required'
  | 'read-only'
  | 'preview'
  | 'permission-pending'
  | 'denied'
  | 'approved-for-write'
  | 'command-allowlisted'
  | 'sandbox-approved'
  | 'sandbox-rejected'
  | 'unknown-transitional'

export type ExecutionAuthoritySource =
  | 'tool-runtime-approval'
  | 'workspace-authority'
  | 'daemon-sandbox'
  | 'none'
  | 'unknown-transitional'

export interface ExecutionAuthority {
  readonly mode: ExecutionAuthorityMode
  readonly source: ExecutionAuthoritySource
  readonly reason: string
}

interface ExecutionRequestMetadata<K extends ExecutionOperationKind> {
  readonly operationKind: K
  readonly workspaceRoot: string
  readonly authority: ExecutionAuthority
  readonly caller: string
  readonly reason: string
  readonly reportSafeTarget?: string
}

export interface CommandExecutionRequest {
  readonly operationKind: 'command.run'
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly workspaceRoot: string
  readonly authority: ExecutionAuthority
  readonly caller: string
  readonly reason: string
  readonly reportSafeCommand: string
  readonly timeoutMs?: number
  readonly abortSignal?: AbortSignal
}

export interface TextFileReadExecutionRequest extends ExecutionRequestMetadata<'file.read'> {
  readonly absolutePath: string
}

export interface TextFileWriteExecutionRequest extends ExecutionRequestMetadata<'file.write'> {
  readonly absolutePath: string
  readonly content: string
}

export interface FileListExecutionRequest extends ExecutionRequestMetadata<'file.list'> {
  readonly absoluteRoot: string
}

export type ExecutionEvent =
  | {
      readonly kind: 'execution.started'
      readonly operationKind: 'command.run'
      readonly executionPath: ExecutionPath
      readonly authorityMode: ExecutionAuthorityMode
      readonly caller: string
      readonly reportSafeCommand: string
      readonly timeoutMs?: number
    }
  | {
      readonly kind: 'execution.exited'
      readonly operationKind: 'command.run'
      readonly executionPath: ExecutionPath
      readonly authorityMode: ExecutionAuthorityMode
      readonly status: 'completed'
      readonly exitCode: number | null
    }
  | {
      readonly kind: 'execution.failed' | 'execution.timed_out' | 'execution.cancelled'
      readonly operationKind: 'command.run'
      readonly executionPath: ExecutionPath
      readonly authorityMode: ExecutionAuthorityMode
      readonly status: 'failed' | 'timeout' | 'cancelled'
      readonly exitCode: number | null
      readonly failureKind: 'sandbox_preflight' | 'execution_failure' | 'timeout' | 'cancelled'
      readonly recoveryReason?: string
    }
  | {
      readonly kind: 'file.read.completed' | 'file.write.completed'
      readonly operationKind: 'file.read' | 'file.write'
      readonly authorityMode: ExecutionAuthorityMode
      readonly caller: string
      readonly reportSafeTarget: string
    }
  | {
      readonly kind: 'file.write.denied' | 'file.write.failed'
      readonly operationKind: 'file.write'
      readonly authorityMode: ExecutionAuthorityMode
      readonly caller: string
      readonly reportSafeTarget: string
      readonly failureKind: 'execution_failure'
      readonly reason: string
    }

export interface CommandExecutionResult extends NormalizedExecutionResult {
  readonly executionPath: ExecutionPath
  readonly events: readonly ExecutionEvent[]
  readonly daemonInstanceId?: string
  readonly daemonPid?: number
  readonly daemonRequestSeq?: number
  readonly daemonExecutionId?: string
  readonly recoveryReason?: string
}

export interface ExecutionService {
  readonly readTextFile: (request: TextFileReadExecutionRequest) => Promise<string>
  readonly writeTextFile: (request: TextFileWriteExecutionRequest) => Promise<void>
  readonly listFilesRecursive: (request: FileListExecutionRequest) => Promise<readonly string[]>
  readonly runCommand: (request: CommandExecutionRequest) => Promise<CommandExecutionResult>
}

export function createDefaultExecutionService(): ExecutionService {
  return {
    readTextFile(request) {
      return fs.readFile(request.absolutePath, 'utf8')
    },
    async writeTextFile(request) {
      await fs.mkdir(path.dirname(request.absolutePath), { recursive: true })
      await fs.writeFile(request.absolutePath, request.content, 'utf8')
    },
    listFilesRecursive(request) {
      return listFilesRecursive(request.absoluteRoot)
    },
    runCommand(request) {
      return runCommand(request)
    },
  }
}

async function listFilesRecursive(root: string): Promise<readonly string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        return listFilesRecursive(fullPath)
      }
      return [fullPath]
    }),
  )
  return files.flat()
}

async function runCommand(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
  if (isRustDaemonEnabled()) {
    const availability = checkRustDaemonAvailability()
    if (!availability.available) {
      const recoveryReason = availability.reason ?? 'Rust daemon unavailable'
      return {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: recoveryReason,
        failureKind: 'execution_failure',
        executionPath: 'rust-daemon',
        recoveryReason,
        events: commandEvents(request, 'rust-daemon', {
          status: 'failed',
          exitCode: null,
          failureKind: 'execution_failure',
          recoveryReason,
        }),
      }
    }

    try {
      const daemonResult = await executeViaRustDaemon({
        command: request.command,
        args: [...request.args],
        cwd: request.cwd,
        workspaceRoot: request.workspaceRoot,
        timeoutMs: request.timeoutMs,
        abortSignal: request.abortSignal,
      })
      return {
        ...daemonResult,
        executionPath: 'rust-daemon',
        events: commandEvents(request, 'rust-daemon', {
          status: daemonResult.status,
          exitCode: daemonResult.exitCode,
          failureKind: daemonResult.failureKind,
        }),
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const recoveryReason = `Rust daemon execution failed: ${reason}`
      return {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: recoveryReason,
        failureKind: 'execution_failure',
        executionPath: 'rust-daemon',
        recoveryReason,
        events: commandEvents(request, 'rust-daemon', {
          status: 'failed',
          exitCode: null,
          failureKind: 'execution_failure',
          recoveryReason,
        }),
      }
    }
  }

  const localResult = await executeLocally({
    command: request.command,
    args: [...request.args],
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
  })

  return {
    ...localResult,
    executionPath: 'ts-local',
    events: commandEvents(request, 'ts-local', {
      status: localResult.status,
      exitCode: localResult.exitCode,
      failureKind: localResult.failureKind,
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
