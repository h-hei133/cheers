import { execFile, execFileSync } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { getRuntimeConfig } from '../config/runtimeConfig.js'

const execFileAsync = promisify(execFile)

export interface DaemonExecutionResult {
  readonly status: 'completed' | 'failed' | 'timeout' | 'cancelled'
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

export interface DaemonAvailability {
  readonly available: boolean
  readonly reason?: string
}

export type NormalizedExecutionResult = DaemonExecutionResult

function resolveCargoBinary(): string {
  return path.join(process.env.USERPROFILE ?? '', '.cargo', 'bin', 'cargo.exe')
}

export async function executeViaRustDaemon(options: {
  command: string
  args: string[]
  cwd: string
  workspaceRoot: string
  timeoutMs?: number
}): Promise<DaemonExecutionResult> {
  const cargo = resolveCargoBinary()
  const commandArgs = [
    'run',
    '--manifest-path',
    'packages/rust-core/Cargo.toml',
    '--bin',
    'daemon',
    '--',
    'exec',
    options.command,
    ...options.args,
    '--cwd',
    options.cwd,
    '--workspace-root',
    options.workspaceRoot,
    '--timeout-ms',
    String(options.timeoutMs ?? 30_000),
  ]

  try {
    const { stdout } = await execFileAsync(cargo, commandArgs, {
      cwd: options.workspaceRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return JSON.parse(stdout) as DaemonExecutionResult
  } catch (error) {
    const stdout = typeof error === 'object' && error !== null && 'stdout' in error
      ? String((error as { stdout?: unknown }).stdout ?? '')
      : ''
    if (stdout) {
      return JSON.parse(stdout) as DaemonExecutionResult
    }
    throw error
  }
}

export async function executeLocally(options: {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
}): Promise<NormalizedExecutionResult> {
  const childPromise = execFileAsync(options.command, options.args, {
    cwd: options.cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    timeout: options.timeoutMs,
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
  const cargo = resolveCargoBinary()
  try {
    const result = execFileSync(cargo, ['--version'])
    void result
    return { available: true }
  } catch {
    return {
      available: false,
      reason: `Cargo executable not available at ${cargo}`,
    }
  }
}
