import which from 'which'
import { executeLocally } from '../local.js'
import { MediaReadError } from './model.js'
import type { MediaSource } from './source.js'

/** One execution path, one deadline, bounded output and a native address-space ceiling. */
export async function runMediaProcess(source: MediaSource, cwd: string, command: string, args: readonly string[], outputLimit: number, signal?: AbortSignal, permissionExitCode?: number): Promise<Buffer> {
  signal?.throwIfAborted()
  const executable = await which(command, { nothrow: true })
  const limiter = await which('prlimit', { nothrow: true })
  if (!executable || !limiter) throw new MediaReadError('unavailable')
  await source.verify()
  signal?.throwIfAborted()
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  const chunks: Buffer[] = []
  let bytes = 0
  let combined = 0
  let oversized = false
  let permissionDenied = false, diagnosticTail = ''
  try {
    const result = await executeLocally({ command: limiter,
      args: ['--as=536870912', '--cpu=10', '--nofile=64', '--fsize=0', '--core=0', '--', executable, ...args],
      cwd, readDescriptors: [source.fd], captureOutput: false,
      timeoutMs: Math.max(1, Math.ceil(source.deadline - performance.now())), abortSignal: controller.signal,
      env: { PATH: process.env.PATH ?? '', LC_ALL: 'C', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
      onStdout: chunk => {
        if (controller.signal.aborted) return
        bytes += chunk.length
        if (bytes > outputLimit) { oversized = true; controller.abort(); return }
        chunks.push(Buffer.from(chunk))
      },
      onStderr: chunk => {
        if (permissionExitCode === undefined) return
        // Poppler also uses exit 1 for a missing password. Classify its fixed
        // C-locale diagnostic without retaining or publishing the document text.
        diagnosticTail = (diagnosticTail + chunk.toString('utf8')).slice(-256)
        if (/(?:^|\n)Command Line Error: Incorrect password\r?\n/.test(diagnosticTail)) permissionDenied = true
      },
      onOutput: chunk => {
        // This callback also sees binary stdout as UTF-8. Its conservative cap
        // bounds stderr work without retaining or publishing decoder diagnostics.
        combined += Buffer.byteLength(chunk)
        if (combined > outputLimit * 4 + 64 * 1024) { oversized = true; controller.abort() }
      },
    })
    if (result.failureKind === 'execution_failure') throw new MediaReadError('cleanup')
    signal?.throwIfAborted()
    if (oversized) throw new MediaReadError('output')
    if (result.status === 'timeout' || performance.now() >= source.deadline) throw new MediaReadError('deadline')
    if (permissionExitCode !== undefined && (result.exitCode === permissionExitCode || result.status !== 'completed' && permissionDenied)) throw new MediaReadError('encrypted')
    if (result.status !== 'completed') throw new MediaReadError('decode')
    await source.verify()
    return Buffer.concat(chunks, bytes)
  } finally { signal?.removeEventListener('abort', onAbort) }
}
