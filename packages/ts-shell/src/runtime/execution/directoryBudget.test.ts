import fs, { promises as fsp, type Dir, type Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DirectoryReadError, readDirectory } from './directory.js'
import { createCoreToolRegistry } from '../../core/tools/registry.js'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'directory-budget-')) })
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

function fakeEntries(count: number, name: (index: number) => string = index => `file-${index}`) {
  let index = 0
  const close = vi.fn(async () => {})
  const read = vi.fn(async () => index < count ? {
    name: name(index++), isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false,
  } as Dirent : null)
  vi.spyOn(fsp, 'opendir').mockResolvedValue({ read, close } as unknown as Dir)
  return { read, close }
}

it('rejects an oversized directory before retaining or reading the rest of its entries', async () => {
  const stream = fakeEntries(1_000_000)
  const full = vi.spyOn(fsp, 'readdir')
  await expect(readDirectory(root, root)).rejects.toMatchObject({ reason: 'entries' })
  expect(stream.read).toHaveBeenCalledTimes(10_001)
  expect(stream.close).toHaveBeenCalledTimes(1)
  expect(full).not.toHaveBeenCalled()
})

it('accepts the exact entry boundary only after observing the end', async () => {
  const stream = fakeEntries(10_000)
  expect(await readDirectory(root, root)).toHaveLength(10_000)
  expect(stream.read).toHaveBeenCalledTimes(10_001)
  expect(stream.close).toHaveBeenCalledTimes(1)
})

it('bounds aggregate UTF-8 name bytes independently of entry count', async () => {
  const stream = fakeEntries(10_000, () => '界'.repeat(80))
  await expect(readDirectory(root, root)).rejects.toMatchObject({ reason: 'bytes' })
  expect(stream.read).toHaveBeenCalledTimes(Math.floor(1024 * 1024 / 240) + 1)
  expect(stream.close).toHaveBeenCalledTimes(1)
})

it.each(['cancel', 'deadline', 'read-error'])('closes both handles after %s during enumeration', async mode => {
  const stream = fakeEntries(3)
  const controller = new AbortController()
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const open = fsp.open
  let handle: Awaited<ReturnType<typeof fsp.open>> | undefined
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => { handle = await open(...args); return handle })
  stream.read.mockImplementationOnce(async () => {
    if (mode === 'cancel') controller.abort()
    if (mode === 'deadline') clock = 6000
    if (mode === 'read-error') throw new Error('fixture read failure')
    return null
  })
  await expect(readDirectory(root, root, { abortSignal: controller.signal })).rejects.toThrow()
  expect(stream.read).toHaveBeenCalledTimes(1)
  expect(stream.close).toHaveBeenCalledTimes(1)
  expect(handle?.fd).toBe(-1)
})

it('retains byte-order sorting after incremental directory enumeration', async () => {
  const names = ['z', 'a', '\u{10000}', '\uE000', 'B']
  for (const name of names) fs.writeFileSync(path.join(root, name), '')
  const expected = await fsp.readdir(root)
  expect((await readDirectory(root, root)).map(entry => entry.name)).toEqual(expected)
})

it('closes the real directory stream after cancellation during its read', async () => {
  fs.writeFileSync(path.join(root, 'one'), '')
  const controller = new AbortController()
  const open = fsp.opendir
  let stream: Dir | undefined
  vi.spyOn(fsp, 'opendir').mockImplementation(async (...args) => {
    stream = await open(...args)
    const read = stream.read.bind(stream)
    vi.spyOn(stream, 'read').mockImplementation(async () => {
      const entry = await read()
      controller.abort()
      return entry
    })
    return stream
  })
  await expect(readDirectory(root, root, { abortSignal: controller.signal })).rejects.toThrow()
  await expect(stream!.read()).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' })
})

it('preserves unverified directory cleanup as a failure through fallback glob', async () => {
  const stream = fakeEntries(0)
  stream.close.mockRejectedValue(new Error('fixture close failure'))
  await expect(createCoreToolRegistry().get('glob')!.execute({ pattern: '*' }, {
    workspaceRoot: root, taskId: 'cleanup',
  })).rejects.toMatchObject({ reason: 'cleanup' })
})

it('cancellation cannot hide an unverified directory cleanup failure', async () => {
  const stream = fakeEntries(0)
  const controller = new AbortController()
  stream.read.mockImplementationOnce(async () => { controller.abort(); return null })
  stream.close.mockRejectedValue(new Error('fixture close failure'))
  await expect(createCoreToolRegistry().get('glob')!.execute({ pattern: '*' }, {
    workspaceRoot: root, taskId: 'cleanup', abortSignal: controller.signal,
  })).rejects.toMatchObject({ reason: 'cleanup' })
})

it.each(['read', 'glob'])('propagates directory limits through the %s tool instead of reporting empty success', async tool => {
  const stream = fakeEntries(10_001)
  const registry = createCoreToolRegistry()
  await expect(registry.get(tool)!.execute(tool === 'read' ? { path: '.' } : { pattern: '*.txt' }, {
    workspaceRoot: root, taskId: 'bounds',
  })).rejects.toBeInstanceOf(DirectoryReadError)
  expect(stream.close).toHaveBeenCalledTimes(1)
})
