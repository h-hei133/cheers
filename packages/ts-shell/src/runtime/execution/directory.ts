import { promises as fs, realpathSync, type Dirent } from 'node:fs'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import { closeReadHandle, withVerifiedReadTarget } from './read.js'

interface DirectoryReadOptions {
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
}

const MAX_ENTRIES = 10_000
const MAX_NAME_BYTES = 1024 * 1024
const TIMEOUT_MS = 5_000

export class DirectoryReadError extends Error {
  constructor(readonly reason: 'entries' | 'bytes' | 'deadline') {
    const detail = { entries: '10,000-entry limit', bytes: '1MiB name limit', deadline: 'read deadline' }[reason]
    super(`Directory listing stopped at the ${detail}; no complete listing is available. Read a smaller directory.`)
    this.name = 'DirectoryReadError'
  }
}

/** Enumerate the verified directory, then recheck before releasing its names. */
export async function readDirectory(root: string, directory: string, options?: DirectoryReadOptions): Promise<Dirent[]> {
  const deadline = performance.now() + TIMEOUT_MS
  if (process.platform !== 'linux') return readDirectoryByPath(root, directory, deadline, options)
  return withVerifiedReadTarget({
    absolutePath: directory, workspaceRoot: root,
    assertFileAccess: options?.assertFileAccess, abortSignal: options?.abortSignal,
  }, 'directory', async (handle, verify) => {
    const target = `/proc/self/fd/${handle.fd}`
    return collectEntries(target, deadline, verify, options?.abortSignal)
  })
}

/** Platforms without proc descriptors retain path checks, without claiming descriptor isolation. */
async function readDirectoryByPath(root: string, directory: string, deadline: number, options?: DirectoryReadOptions): Promise<Dirent[]> {
  options?.abortSignal?.throwIfAborted()
  const workspace = realpathSync(root)
  const checked = verifyPathContainment(directory, root)
  if (!checked.allowed) throw new Error('Directory target is outside the workspace.')
  const target = realpathSync(checked.resolvedPath)
  options?.assertFileAccess?.(target)
  const before = await fs.stat(target, { bigint: true })
  if (!before.isDirectory()) throw new Error('Read target must be a directory.')
  options?.abortSignal?.throwIfAborted()
  const verify = async (): Promise<void> => {
    const after = await fs.stat(target, { bigint: true })
    if (realpathSync(root) !== workspace || realpathSync(directory) !== target
      || !after.isDirectory() || before.dev !== after.dev || before.ino !== after.ino) {
      throw new Error('Directory changed while reading.')
    }
    options?.assertFileAccess?.(target)
    options?.abortSignal?.throwIfAborted()
  }
  return collectEntries(target, deadline, verify, options?.abortSignal)
}

/** Keep the native prefetch buffer and retained names bounded independently of output pagination. */
async function collectEntries(target: string, deadline: number, verify: () => Promise<void>, signal?: AbortSignal): Promise<Dirent[]> {
  const check = (): void => {
    signal?.throwIfAborted()
    if (performance.now() >= deadline) throw new DirectoryReadError('deadline')
  }
  check()
  const directory = await fs.opendir(target, { bufferSize: 32 })
  try {
    const entries: Dirent[] = []
    let nameBytes = 0
    while (true) {
      check()
      if (entries.length % 32 === 0) { await verify(); check() }
      const entry = await directory.read()
      check()
      if (!entry) break
      if (entries.length >= MAX_ENTRIES) throw new DirectoryReadError('entries')
      nameBytes += Buffer.byteLength(entry.name)
      if (nameBytes > MAX_NAME_BYTES) throw new DirectoryReadError('bytes')
      entries.push(entry)
    }
    // readdir used libuv's byte-order sorting; opendir exposes filesystem order.
    entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)))
    await verify()
    check()
    return entries
  } finally { await closeReadHandle(directory) }
}
