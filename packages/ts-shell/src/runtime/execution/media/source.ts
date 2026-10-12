import { createHash } from 'node:crypto'
import type { FileHandle } from 'node:fs/promises'
import { constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { closeReadHandle, ReadChangedError, ReadCleanupError, readRevision, withVerifiedReadTarget } from '../read.js'
import { MediaReadError, type MediaReadRequest } from './model.js'

export interface MediaSource {
  readonly fd: number
  readonly bytes: number
  readonly hash: string
  readonly signature: Buffer
  readonly deadline: number
  readonly verify: () => Promise<void>
}

/** Decode a private bounded copy, so native reads cannot follow source growth. */
export async function withMediaSource<T>(request: MediaReadRequest, consume: (source: MediaSource) => Promise<T>): Promise<T> {
  request.abortSignal?.throwIfAborted()
  if (process.platform !== 'linux') throw new MediaReadError('unavailable')
  const deadline = performance.now() + 15_000
  let processCleanupFailed = false
  try { return await withVerifiedReadTarget(request, 'file', async (handle, verifyTarget) => {
    const before = await handle.stat({ bigint: true })
    if (before.size > 16n * 1024n * 1024n) throw new MediaReadError('bytes')
    const verify = async (): Promise<void> => {
      await verifyTarget().catch(throwSourceError)
      if (performance.now() >= deadline) throw new MediaReadError('deadline')
      const current = await handle.stat({ bigint: true })
      if (readRevision(current) !== readRevision(before)) throw new MediaReadError('changed')
    }
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cheers-media-'))
    let writer: FileHandle | undefined
    let reader: FileHandle | undefined
    try {
      const temporary = path.join(directory, 'source')
      writer = await fs.open(temporary, 'wx', 0o600)
      const copied = await copySource(handle, writer, verify)
      reader = await fs.open(temporary, constants.O_RDONLY | constants.O_NOFOLLOW)
      await fs.unlink(temporary)
      await closeReadHandle(writer); writer = undefined
      await verify()
      const result = await consume({ fd: reader.fd, ...copied, deadline, verify }).catch(error => {
        processCleanupFailed = error instanceof MediaReadError && error.reason === 'cleanup'
        throw error
      })
      await verify()
      return result
    } finally {
      const closed = await Promise.allSettled([...(reader ? [closeReadHandle(reader)] : []), ...(writer ? [closeReadHandle(writer)] : [])])
      let removed = true
      try { await fs.rm(directory, { recursive: true, force: true }) } catch { removed = false }
      if (!removed || closed.some(result => result.status === 'rejected')) throw new ReadCleanupError()
    }
  }) } catch (error) {
    if (processCleanupFailed && error instanceof ReadCleanupError) {
      throw new AggregateError([new MediaReadError('cleanup'), error], 'Media extraction failed: process cleanup and input-handle cleanup could not be verified.')
    }
    throwSourceError(error)
  }
}

function throwSourceError(error: unknown): never {
  if (error instanceof ReadChangedError) throw new MediaReadError('changed')
  throw error
}

async function copySource(handle: FileHandle, staged: FileHandle, verify: () => Promise<void>): Promise<{ hash: string; signature: Buffer; bytes: number }> {
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(64 * 1024)
  let bytes = 0
  let signature = Buffer.alloc(0)
  for (;;) {
    await verify()
    const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, 16 * 1024 * 1024 - bytes + 1), bytes)
    if (bytesRead === 0) break
    bytes += bytesRead
    if (bytes > 16 * 1024 * 1024) throw new MediaReadError('bytes')
    if (signature.length === 0) signature = Buffer.from(buffer.subarray(0, Math.min(bytesRead, 16)))
    hash.update(buffer.subarray(0, bytesRead))
    let written = 0
    while (written < bytesRead) {
      const result = await staged.write(buffer, written, bytesRead - written, bytes - bytesRead + written)
      if (result.bytesWritten < 1) throw new MediaReadError('decode')
      written += result.bytesWritten
    }
  }
  return { bytes, hash: hash.digest('hex'), signature }
}
