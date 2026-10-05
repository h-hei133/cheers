import { constants, promises as fs, realpathSync, statSync, type BigIntStats } from 'node:fs'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import type { FileHandle } from 'node:fs/promises'
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
  return withVerifiedReadTarget(request, 'file', handle => handle.readFile({ encoding: 'utf8', signal: request.abortSignal }))
}

type ReadTarget = Pick<TextFileReadExecutionRequest, 'absolutePath' | 'workspaceRoot' | 'artifactDirectory' | 'assertFileAccess' | 'abortSignal'>

export async function withVerifiedReadTarget<T>(request: ReadTarget, kind: 'file' | 'directory', consume: (handle: FileHandle, verify: () => Promise<void>) => Promise<T>): Promise<T> {
  request.abortSignal?.throwIfAborted()
  const workspace = realpathSync(request.workspaceRoot)
  const root = request.artifactDirectory
    ? realpathSync(workspaceTarget(request.artifactDirectory, request.workspaceRoot, workspace)) : workspace
  const target = contained(workspaceTarget(request.absolutePath, request.workspaceRoot, workspace), root)
  request.assertFileAccess?.(target)
  const before = statSync(target, { bigint: true })
  if (kind === 'file' ? !before.isFile() : !before.isDirectory()) throw new Error(`Read target must be a ${kind === 'file' ? 'regular file' : 'directory'}.`)
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0) | (kind === 'directory' ? (constants.O_DIRECTORY ?? 0) : 0))
  try {
    request.abortSignal?.throwIfAborted()
    const opened = await handle.stat({ bigint: true })
    if ((kind === 'file' ? !opened.isFile() : !opened.isDirectory()) || !sameFile(before, opened)) {
      throw new Error('Read target changed while opening the file.')
    }
    const verify = async (): Promise<void> => {
      // Only Linux exposes the actual open object through this interface.
      const actual = process.platform === 'linux' ? await fs.realpath(`/proc/self/fd/${handle.fd}`) : await fs.realpath(target)
      if (contained(actual, root) !== target || realpathSync(request.workspaceRoot) !== workspace
        || !sameFile(opened, statSync(target, { bigint: true }))) {
        throw new Error('Read target changed after validation.')
      }
      request.assertFileAccess?.(actual)
      request.abortSignal?.throwIfAborted()
    }
    await verify()
    return await consume(handle, verify)
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

/** Linux descriptor inputs stay open until their command settles. */
export async function withVerifiedReadFiles<T>(requests: readonly TextFileReadExecutionRequest[], consume: (handles: readonly FileHandle[]) => Promise<T>): Promise<T> {
  if (process.platform !== 'linux') throw new Error('Descriptor input binding is unavailable on this platform.')
  const handles: FileHandle[] = []
  async function openNext(index: number): Promise<T> {
    if (index < requests.length) {
      return withVerifiedReadTarget(requests[index]!, 'file', async handle => {
        handles.push(handle)
        return openNext(index + 1)
      })
    }
    // Opening later files yields; recheck earlier descriptors before giving them to a child.
    for (let i = 0; i < handles.length; i++) {
      const request = requests[i]!
      request.abortSignal?.throwIfAborted()
      const actual = await fs.realpath(`/proc/self/fd/${handles[i]!.fd}`)
      const target = realpathSync(request.absolutePath)
      const workspace = realpathSync(request.workspaceRoot)
      const allowedRoot = request.artifactDirectory ? contained(realpathSync(request.artifactDirectory), workspace) : workspace
      if (contained(actual, allowedRoot) !== target
        || !sameFile(await handles[i]!.stat({ bigint: true }), statSync(target, { bigint: true }))) {
        throw new Error('Read target changed before command execution.')
      }
      request.assertFileAccess?.(actual)
    }
    return consume(handles)
  }
  return openNext(0)
}
