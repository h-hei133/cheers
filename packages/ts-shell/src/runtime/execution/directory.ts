import { promises as fs, realpathSync, type Dirent } from 'node:fs'
import path from 'node:path'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import { closeReadHandle, withVerifiedReadTarget, ReadChangedError, readRevision } from './read.js'
import type { CapturedReadSource } from './types.js'

interface DirectoryReadOptions {
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
  readonly checkpoint?: () => void
  readonly onEntry?: (entry: Dirent) => void
  readonly onCapturedSource?: (source: CapturedReadSource) => void
}

const MAX_ENTRIES = 10_000
const MAX_NAME_BYTES = 1024 * 1024
const TIMEOUT_MS = 5_000

export class DirectoryReadError extends Error {
  constructor(readonly reason: 'entries' | 'bytes' | 'deadline' | 'unavailable') {
    const detail = { entries: '10,000-entry limit', bytes: '1MiB name limit', deadline: 'read deadline', unavailable: 'filesystem access failure' }[reason]
    super(reason === 'unavailable' ? 'Directory enumeration failed; no complete listing is available. Check filesystem access and retry.'
      : `Directory listing stopped at the ${detail}; no complete listing is available. Read a smaller directory.`)
    this.name = 'DirectoryReadError'
  }
}

/** Enumerate the verified directory, then recheck before releasing its names. */
export async function readDirectory(root: string, directory: string, options?: DirectoryReadOptions): Promise<Dirent[]> {
  const deadline = performance.now() + TIMEOUT_MS
  if (process.platform !== 'linux') return withPathDirectory(root, directory, options,
    (target, verify) => collectEntries(target, deadline, verify, options))
  return withVerifiedReadTarget({
    absolutePath: directory, workspaceRoot: root,
    assertFileAccess: options?.assertFileAccess, abortSignal: options?.abortSignal,
    onCapturedSource: options?.onCapturedSource,
  }, 'directory', async (handle, verify) => {
    const target = `/proc/self/fd/${handle.fd}`
    return collectEntries(target, deadline, verify, options)
  })
}

/** Observe directory metadata without enumerating entries or retaining a handle. */
export async function observeDirectory(root: string, directory: string, options?: DirectoryReadOptions): Promise<void> {
  try {
    if (process.platform !== 'linux') return await withPathDirectory(root, directory, options, async () => {})
    await withVerifiedReadTarget({ absolutePath: directory, workspaceRoot: root,
      assertFileAccess: options?.assertFileAccess, abortSignal: options?.abortSignal,
      onCapturedSource: options?.onCapturedSource,
    }, 'directory', async () => {})
  } catch (error) { rethrowDirectoryChange(error) }
}

function rethrowDirectoryChange(error: unknown): never {
  if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) throw new ReadChangedError()
  throw error
}

/** Platforms without proc descriptors retain path checks, without claiming descriptor isolation. */
async function withPathDirectory<T>(root: string, directory: string, options: DirectoryReadOptions | undefined,
  consume: (target: string, verify: () => Promise<void>) => Promise<T>): Promise<T> {
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
    try {
      const after = await fs.stat(target, { bigint: true })
      const current = verifyPathContainment(directory, root)
      if (realpathSync(root) !== workspace || !current.allowed || current.resolvedPath !== target
        || !after.isDirectory() || readRevision(before) !== readRevision(after)) {
        throw new ReadChangedError()
      }
      options?.assertFileAccess?.(target)
      options?.abortSignal?.throwIfAborted()
    } catch (error) { rethrowDirectoryChange(error) }
  }
  const result = await consume(target, verify)
  await verify()
  options?.onCapturedSource?.({ path: path.resolve(directory), target, root: workspace, revision: readRevision(before) })
  return result
}

/** Keep the native prefetch buffer and retained names bounded independently of output pagination. */
async function collectEntries(target: string, deadline: number, verify: () => Promise<void>, options?: DirectoryReadOptions): Promise<Dirent[]> {
  const check = (): void => {
    options?.abortSignal?.throwIfAborted()
    options?.checkpoint?.()
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
      options?.onEntry?.(entry)
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
