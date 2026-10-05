import { constants, promises as fs, realpathSync, statSync, type BigIntStats } from 'node:fs'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import type { TextFileReadExecutionRequest } from './types.js'

function contained(target: string, root: string): string {
  const checked = verifyPathContainment(target, root)
  if (!checked.allowed) throw new Error('Read target is outside the authorized directory.')
  return checked.resolvedPath
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.ino !== 0n && left.dev === right.dev && left.ino === right.ino
}

function workspaceTarget(target: string, requestedRoot: string, realRoot: string): string {
  const checked = verifyPathContainment(target, requestedRoot)
  return checked.allowed ? checked.resolvedPath : contained(target, realRoot)
}

/** Read bytes from the verified handle, never by reopening its pathname. */
export async function readTextFile(request: TextFileReadExecutionRequest): Promise<string> {
  request.abortSignal?.throwIfAborted()
  const workspace = realpathSync(request.workspaceRoot)
  const root = request.artifactDirectory
    ? realpathSync(workspaceTarget(request.artifactDirectory, request.workspaceRoot, workspace)) : workspace
  const target = contained(workspaceTarget(request.absolutePath, request.workspaceRoot, workspace), root)
  request.assertFileAccess?.(target)
  const before = statSync(target, { bigint: true })
  if (!before.isFile()) throw new Error('Read target must be a regular file.')
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    request.abortSignal?.throwIfAborted()
    const opened = await handle.stat({ bigint: true })
    if (!opened.isFile() || !sameFile(before, opened)) {
      throw new Error('Read target changed while opening the file.')
    }
    // Linux exposes the opened object, including parent-directory replacements.
    // Other platforms retain the identity and pathname rechecks below; their
    // descriptor-path guarantee requires separate native platform evidence.
    const actual = process.platform === 'linux' ? await fs.realpath(`/proc/self/fd/${handle.fd}`) : await fs.realpath(target)
    if (contained(actual, root) !== target || realpathSync(request.workspaceRoot) !== workspace
      || !sameFile(opened, statSync(target, { bigint: true }))) {
      throw new Error('Read target changed after validation.')
    }
    request.assertFileAccess?.(actual)
    request.abortSignal?.throwIfAborted()
    return await handle.readFile({ encoding: 'utf8', signal: request.abortSignal })
  } catch (error) {
    // A disappearing opened file is a failed read, not evidence that a writer
    // may treat its pre-read as an initially absent target.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error('Read target became unavailable after opening.')
    }
    throw error
  } finally {
    await handle.close()
  }
}
