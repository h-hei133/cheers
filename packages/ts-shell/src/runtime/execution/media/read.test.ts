import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as local from '../local.js'
import { createMediaReader } from './index.js'
import { runMediaProcess } from './process.js'
import { withMediaSource } from './source.js'
import type { MediaReadRequest } from './model.js'
import { createHash } from 'node:crypto'
import { ReadCleanupError } from '../read.js'
import which from 'which'

vi.mock('which', async () => {
  const actual = await vi.importActual<{ default: typeof which }>('which')
  return { default: Object.assign(vi.fn(actual.default), { sync: actual.default.sync }) }
})

let root: string
let readMedia = createMediaReader()
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
beforeEach(async () => {
  readMedia = createMediaReader()
  vi.mocked(which).mockImplementation((await vi.importActual<{ default: typeof which }>('which')).default)
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-read-')); await fs.writeFile(path.join(root, 'pixel.png'), png)
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }) })
function request(abortSignal?: AbortSignal): MediaReadRequest {
  return { kind: 'image', operationKind: 'file.read', absolutePath: path.join(root, 'pixel.png'), workspaceRoot: root,
    authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'fixture' }, caller: 'fixture', reason: 'fixture', abortSignal }
}

it('copies only bounded source bytes to an unlinked read-only descriptor with the matching digest', async () => {
  let descriptor = -1
  await withMediaSource(request(), async source => {
    descriptor = source.fd
    expect(source.bytes).toBe(png.length)
    expect(source.hash).toBe(createHash('sha256').update(png).digest('hex'))
    expect(await fs.readFile('/proc/self/fd/' + source.fd)).toEqual(png)
    expect(await fs.readlink('/proc/self/fd/' + source.fd)).toContain('(deleted)')
    await fs.writeFile(path.join(root, 'pixel.png'), 'x'.repeat(10000))
    expect(await fs.readFile('/proc/self/fd/' + source.fd)).toEqual(png)
    await expect(source.verify()).rejects.toMatchObject({ reason: 'changed' })
  }).catch(error => { expect(error).toMatchObject({ reason: 'changed' }) })
  await expect(fs.stat('/proc/self/fd/' + descriptor)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('refuses oversized input and format disguises before any native launch', async () => {
  const execute = vi.spyOn(local, 'executeLocally')
  await fs.writeFile(path.join(root, 'pixel.png'), '%PDF-1.7\nnot a png')
  await expect(readMedia(request())).rejects.toMatchObject({ reason: 'format' })
  const handle = await fs.open(path.join(root, 'pixel.png'), 'w'); await handle.truncate(16 * 1024 * 1024 + 1); await handle.close()
  await expect(readMedia(request())).rejects.toMatchObject({ reason: 'bytes' })
  expect(execute).not.toHaveBeenCalled()
})

it('checks cancellation after asynchronous preparation and before native launch', async () => {
  const controller = new AbortController()
  const execute = vi.spyOn(local, 'executeLocally')
  await expect(runMediaProcess({ fd: -1, bytes: 0, hash: '', signature: png, deadline: performance.now() + 1000,
    verify: async () => { controller.abort() } }, root, 'node', [], 1000, controller.signal)).rejects.toThrow()
  expect(execute).not.toHaveBeenCalled()
})

it('keeps process and file cleanup failures together without exposing decoder diagnostics', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native')
  const execute = vi.spyOn(local, 'executeLocally').mockResolvedValue({ status: 'failed', exitCode: null, stdout: '', stderr: 'PRIVATE_NATIVE_TEXT', failureKind: 'execution_failure' })
  const open = fs.open
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    const close = handle.close.bind(handle)
    if (args[0] === path.join(root, 'pixel.png')) vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); throw new ReadCleanupError() })
    return handle
  })
  await expect(readMedia(request())).rejects.toThrow('process cleanup and input-handle cleanup could not be verified')
  await expect(readMedia(request())).rejects.toMatchObject({ reason: 'cleanup' })
  expect(execute).toHaveBeenCalledTimes(1)
})

it('forces native image formats, strips report-file environment hooks, and bounds produced content', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native')
  vi.stubEnv('FFREPORT', 'file=synthetic-report:level=32')
  const calls: Parameters<typeof local.executeLocally>[0][] = []
  vi.spyOn(local, 'executeLocally').mockImplementation(async options => {
    calls.push(options)
    expect(options.env).not.toHaveProperty('FFREPORT')
    expect(options.args).toContain('--as=536870912')
    expect(options.args).toContain('image2pipe')
    expect(await fs.readFile('/proc/self/fd/' + options.readDescriptors![0])).toEqual(png)
    options.onStdout?.(options.args.includes('-show_entries') ? Buffer.from('{"streams":[{"codec_name":"png","width":1,"height":1}]}') : Buffer.from([255, 216, 0, 255, 217]))
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' }
  })
  const result = await readMedia(request())
  expect(result.images?.[0].mimeType).toBe('image/jpeg')
  expect(calls).toHaveLength(2)
  expect(calls[0].args).toContain('-codec_whitelist')
  expect(calls[1].args).toContain('-nostdin')
})

it('admits at most two media extractions and releases admission after they finish', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native')
  let release!: () => void, prepared!: () => void, started = 0
  const held = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { prepared = resolve })
  vi.spyOn(local, 'executeLocally').mockImplementation(async options => {
    if (options.args.includes('-show_entries')) {
      if (++started === 2) prepared()
      await held
      options.onStdout?.(Buffer.from('{"streams":[{"codec_name":"png","width":1,"height":1}]}'))
    } else options.onStdout?.(Buffer.from([255, 216, 0, 255, 217]))
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' }
  })
  const pending = [readMedia(request()), readMedia(request())]
  try {
    await ready
    await expect(readMedia(request())).rejects.toMatchObject({ reason: 'busy' })
  } finally { release(); await Promise.all(pending) }
  expect((await readMedia(request())).images).toHaveLength(1)
})

it.each(['deadline', 'cancel'])('stops an actual native process on %s without waiting for its requested duration', async scenario => {
  const controller = new AbortController()
  const start = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const pending = withMediaSource(request(), async source => {
      if (scenario === 'cancel') timer = setTimeout(() => controller.abort(), 80)
      return runMediaProcess({ ...source, deadline: performance.now() + (scenario === 'deadline' ? 80 : 5000) }, root, 'sleep', ['30'], 1000, controller.signal)
    })
    const available = process.platform === 'linux' && ['sleep', 'prlimit'].every(name => which.sync(name, { nothrow: true }))
    await expect(pending).rejects.toMatchObject(!available ? { reason: 'unavailable' } : scenario === 'deadline' ? { reason: 'deadline' } : { name: 'AbortError' })
    expect(performance.now() - start).toBeLessThan(3000)
  } finally { clearTimeout(timer) }
})
