import { promises as fs, realpathSync, type Dirent } from 'node:fs'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import { withVerifiedReadTarget } from './read.js'

interface DirectoryReadOptions {
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
}

/** Enumerate the verified directory, then recheck before releasing its names. */
export async function readDirectory(root: string, directory: string, options?: DirectoryReadOptions): Promise<Dirent[]> {
  if (process.platform !== 'linux') return readDirectoryByPath(root, directory, options)
  return withVerifiedReadTarget({
    absolutePath: directory, workspaceRoot: root,
    assertFileAccess: options?.assertFileAccess, abortSignal: options?.abortSignal,
  }, 'directory', async (handle, verify) => {
    const target = `/proc/self/fd/${handle.fd}`
    const entries = await fs.readdir(target, { withFileTypes: true })
    await verify()
    return entries
  })
}

/** Platforms without proc descriptors retain path checks, without claiming descriptor isolation. */
async function readDirectoryByPath(root: string, directory: string, options?: DirectoryReadOptions): Promise<Dirent[]> {
  options?.abortSignal?.throwIfAborted()
  const workspace = realpathSync(root)
  const checked = verifyPathContainment(directory, root)
  if (!checked.allowed) throw new Error('Directory target is outside the workspace.')
  const target = realpathSync(checked.resolvedPath)
  options?.assertFileAccess?.(target)
  const before = await fs.stat(target, { bigint: true })
  if (!before.isDirectory()) throw new Error('Read target must be a directory.')
  options?.abortSignal?.throwIfAborted()
  const entries = await fs.readdir(target, { withFileTypes: true })
  const after = await fs.stat(target, { bigint: true })
  if (realpathSync(root) !== workspace || realpathSync(directory) !== target
    || !after.isDirectory() || before.dev !== after.dev || before.ino !== after.ino) {
    throw new Error('Directory changed while reading.')
  }
  options?.assertFileAccess?.(target)
  options?.abortSignal?.throwIfAborted()
  return entries
}
