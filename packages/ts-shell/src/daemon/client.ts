import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getRuntimeConfig } from '../config/runtimeConfig.js'
import type {
  DaemonAvailability,
  DaemonExecutionResult,
  NormalizedExecutionResult,
} from './types.js'
import {
  normalizePath,
  resolveAvailableCargoBinary,
  resolveCargoCommandCandidates,
} from './protocol.js'
import {
  executeQueuedDaemonTask,
  executeViaResidentDaemon,
  getResidentDaemonStateForTest,
  isDaemonProcessAlive,
  resetResidentDaemonStateForTest,
} from './resident.js'

const execFileAsync = promisify(execFile)

export * from './types.js'
export * from './protocol.js'
export * from './resident.js'

export async function executeViaRustDaemon(options: {
  command: string
  args: string[]
  cwd: string
  workspaceRoot: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<DaemonExecutionResult> {
  return executeQueuedDaemonTask(async (): Promise<DaemonExecutionResult> => {
    try {
      return await executeViaResidentDaemon(options)
    } catch (initialError) {
      const stateAfterError = getResidentDaemonStateForTest()
      const message = initialError instanceof Error ? initialError.message : String(initialError)
      const needsRestart =
        !isDaemonProcessAlive(stateAfterError)
        || /epipe|broken pipe|timed out|exited before responding/i.test(message)
        || (stateAfterError !== null && normalizePath(stateAfterError.workspaceRoot) !== normalizePath(options.workspaceRoot))
      if (!needsRestart) {
        throw initialError
      }
      resetResidentDaemonStateForTest()
      return executeViaResidentDaemon(options)
    }
  })
}

export async function executeLocally(options: {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
}): Promise<NormalizedExecutionResult> {
  const isWindows = process.platform === 'win32'
  const childPromise = execFileAsync(options.command, options.args, {
    cwd: options.cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    timeout: options.timeoutMs,
    shell: isWindows,
  })

  try {
    const { stdout, stderr } = await childPromise
    return {
      status: 'completed',
      exitCode: 0,
      stdout,
      stderr,
    }
  } catch (error) {
    const execError = error as {
      stdout?: string
      stderr?: string
      code?: number | string | null
      killed?: boolean
      signal?: string | null
      message?: string
    }

    if (execError.killed || execError.signal === 'SIGTERM') {
      return {
        status: 'timeout',
        exitCode: typeof execError.code === 'number' ? execError.code : null,
        stdout: execError.stdout ?? '',
        stderr: execError.stderr || execError.message || 'Command timed out',
      }
    }

    return {
      status: 'failed',
      exitCode: typeof execError.code === 'number' ? execError.code : null,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr || execError.message || 'Command failed',
    }
  }
}

export function isRustDaemonEnabled(): boolean {
  return getRuntimeConfig().daemonEnabled
}

export function checkRustDaemonAvailability(): DaemonAvailability {
  const cargo = resolveAvailableCargoBinary()
  if (cargo) {
    return { available: true }
  }

  return {
    available: false,
    reason: `Cargo executable not available. Checked: ${resolveCargoCommandCandidates().join(', ')}`,
  }
}
