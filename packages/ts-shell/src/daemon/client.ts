import { execFile, spawn } from 'node:child_process'
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
  onOutput?: (chunk: string) => void
}): Promise<NormalizedExecutionResult> {
  const isWindows = process.platform === 'win32'
  // Spawned rather than execFile'd when the caller wants to watch: execFile only
  // hands back the finished buffers, so a caller with a callback needs the streams
  // as they fill. Both paths collect the same stdout and stderr.
  const forward = options.onOutput
  const childPromise = forward
    ? collectStreamed({ ...options, onOutput: forward })
    : execFileAsync(options.command, options.args, {
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

/**
 * Run a command while forwarding its output as it is produced.
 *
 * Returns the same shape `execFile` resolves with, so the caller cannot tell
 * which path ran. Output is forwarded as it arrives rather than buffered: the
 * point is that a command which prints for a minute looks alive for that minute.
 */
function collectStreamed(options: {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
  onOutput: (chunk: string) => void
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGTERM')
        }, options.timeoutMs)
      : undefined
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      options.onOutput(text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      options.onOutput(text)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      // Shaped like the error execFile rejects with, so the catch block that
      // builds the failure result handles both paths the same way.
      reject(
        Object.assign(new Error(`Command failed with exit code ${code ?? 'null'}`), {
          stdout,
          stderr: stderr || (timedOut ? 'Command timed out' : ''),
          code,
          killed: timedOut,
          signal,
        }),
      )
    })
  })
}
