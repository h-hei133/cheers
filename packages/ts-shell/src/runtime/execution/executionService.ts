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

export interface CommandExecutionRequest {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly workspaceRoot: string
  readonly timeoutMs?: number
  readonly abortSignal?: AbortSignal
}

export interface CommandExecutionResult extends NormalizedExecutionResult {
  readonly executionPath: ExecutionPath
  readonly daemonInstanceId?: string
  readonly daemonPid?: number
  readonly daemonRequestSeq?: number
  readonly daemonExecutionId?: string
  readonly recoveryReason?: string
}

export interface ExecutionService {
  readonly readTextFile: (absolutePath: string) => Promise<string>
  readonly writeTextFile: (absolutePath: string, content: string) => Promise<void>
  readonly listFilesRecursive: (absoluteRoot: string) => Promise<readonly string[]>
  readonly runCommand: (request: CommandExecutionRequest) => Promise<CommandExecutionResult>
}

export function createDefaultExecutionService(): ExecutionService {
  return {
    readTextFile(absolutePath) {
      return fs.readFile(absolutePath, 'utf8')
    },
    async writeTextFile(absolutePath, content) {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true })
      await fs.writeFile(absolutePath, content, 'utf8')
    },
    listFilesRecursive(absoluteRoot) {
      return listFilesRecursive(absoluteRoot)
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
      return {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: availability.reason ?? 'Rust daemon unavailable',
        failureKind: 'execution_failure',
        executionPath: 'rust-daemon',
        recoveryReason: availability.reason ?? 'Rust daemon unavailable',
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
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: `Rust daemon execution failed: ${reason}`,
        failureKind: 'execution_failure',
        executionPath: 'rust-daemon',
        recoveryReason: `Rust daemon execution failed: ${reason}`,
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
  }
}
