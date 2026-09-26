import { spawn } from 'node:child_process'
import { killProcessTree, trackChildPid, untrackChildPid } from '../../core/shell/platform/processTree.js'
import type { NormalizedExecutionResult } from './types.js'

/**
 * Running a command, locally.
 *
 * This is the only execution path there is. A second one used to exist — a Rust
 * daemon reached over stdio — and it was removed because it was worse at every
 * thing it claimed: it could not forward output as it arrived (the protocol had
 * no message for it, so a command that printed for a minute looked hung), it
 * cost an IPC round trip and a `cargo run` start on top of the work, and its
 * "sandbox" was a substring search for `curl ` while the real isolation lives in
 * `sandbox/osSandbox.ts`. Nothing here reports a status it did not observe.
 */

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
  abortSignal?: AbortSignal
  env?: Readonly<Record<string, string>>
}): Promise<{ stdout: string; stderr: string }> {
  // Built by hand rather than with `Promise.withResolvers`, which needs Node 22:
  // this package declares `>=20.3.0` and `check:node-floor` enforces it.
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      // Only when the caller named one: passing `env: undefined` is the same as
      // inheriting, but stating that explicitly reads as if it were chosen.
      ...(options.env ? { env: options.env as NodeJS.ProcessEnv } : {}),
      // Its own process group, so the whole tree can be signalled. Killing only
      // the direct child leaves its descendants running, and while they hold the
      // stdout and stderr pipes the close event never arrives — which is how a
      // timed-out command leaves the turn waiting on a result forever.
      detached: process.platform !== 'win32',
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let cancelled = false
    const finish = (): void => {
      if (child.pid) untrackChildPid(child.pid)
      options.abortSignal?.removeEventListener('abort', onAbort)
    }
    const stop = (): void => {
      // The group, not just the child: a shell's children outlive it otherwise.
      if (child.pid) killProcessTree(child.pid)
      else child.kill('SIGKILL')
    }
    const onAbort = (): void => {
      cancelled = true
      stop()
    }
    if (child.pid) trackChildPid(child.pid)
    if (options.abortSignal) {
      if (options.abortSignal.aborted) onAbort()
      else options.abortSignal.addEventListener('abort', onAbort, { once: true })
    }
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          stop()
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
      finish()
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      finish()
      if (cancelled) {
        // Marked rather than inferred from the exit code: a killed process
        // reports whichever signal arrived, and the caller needs to tell "the
        // user stopped this" apart from "it ran too long" and "it failed".
        reject(
          Object.assign(new Error('Command cancelled'), {
            stdout,
            stderr: stderr || 'Command cancelled',
            code,
            killed: true,
            cancelled: true,
            signal,
          }),
        )
        return
      }
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      // Shaped like the error execFile rejects with, so the catch block that
      // builds the failure result handles both paths the same way.
      //
      // `timedOut` is carried as its own field rather than left to be inferred
      // from `killed` or the signal name. A process terminated by a signal this
      // code did not send — an operator's SIGTERM, an OOM SIGKILL — is a failure,
      // not a timeout, and the signal alone cannot tell the two apart.
      reject(
        Object.assign(new Error(`Command failed with exit code ${code ?? 'null'}`), {
          stdout,
          stderr: stderr || (timedOut ? 'Command timed out' : ''),
          code,
          killed: timedOut,
          timedOut,
          signal,
        }),
      )
    })
  })
}

/**
 * One command, run here.
 *
 * There used to be two ways to do this — `execFile` when nobody watched, a
 * `spawn` when somebody did — and they diverged: the watched one learned to
 * report output early and to kill a whole process group, and the unwatched one
 * kept neither. Two implementations of one job drift, so there is now only this
 * one, and a caller with no callback passes nothing.
 */
export async function executeLocally(options: {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
  onOutput?: (chunk: string) => void
  abortSignal?: AbortSignal
  env?: Readonly<Record<string, string>>
}): Promise<NormalizedExecutionResult> {
  const childPromise = collectStreamed({
    ...options,
    onOutput: options.onOutput ?? (() => {}),
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
      timedOut?: boolean
      cancelled?: boolean
      signal?: string | null
      message?: string
    }

    // A stop is reported as the stop it was. Guessing from `killed` alone told a
    // user who cancelled a command that it had timed out.
    if (execError.cancelled) {
      return {
        status: 'cancelled',
        exitCode: typeof execError.code === 'number' ? execError.code : null,
        stdout: execError.stdout ?? '',
        stderr: execError.stderr || execError.message || 'Command cancelled',
      }
    }

    // Only a timeout this code set is a timeout. Matching on the signal name
    // instead reported an operator's `SIGTERM` — or any externally delivered
    // signal — as the command having run too long, which is a different fact and
    // sends the reader looking in the wrong place.
    if (execError.timedOut) {
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
