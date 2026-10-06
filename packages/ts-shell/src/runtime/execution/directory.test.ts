import fs, { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readDirectory } from './directory.js'

let root: string
let workspace: string
let directory: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'directory-read-'))
  workspace = path.join(root, 'workspace')
  directory = path.join(workspace, 'source')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'public.txt'), 'public')
  fs.mkdirSync(path.join(root, 'outside'))
  fs.writeFileSync(path.join(root, 'outside', 'PRIVATE_NAME'), 'private')
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })
it('enumerates internal aliases and rejects external directory aliases', async () => {
  fs.symlinkSync(directory, path.join(workspace, 'alias'))
  expect((await readDirectory(workspace, path.join(workspace, 'alias'))).map(entry => entry.name)).toEqual(['public.txt'])
  fs.symlinkSync(path.join(root, 'outside'), path.join(workspace, 'escape'))
  await expect(readDirectory(workspace, path.join(workspace, 'escape'))).rejects.toThrow('outside')
})
it('refuses a changed directory handle before enumeration and closes it', async () => {
  const open = fsp.open
  let handle: Awaited<ReturnType<typeof fsp.open>> | undefined
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    handle = await open(...args)
    fs.renameSync(directory, path.join(root, 'moved'))
    fs.symlinkSync(path.join(root, 'outside'), directory)
    return handle
  })
  const enumerate = vi.spyOn(fsp, 'opendir')
  await expect(readDirectory(workspace, directory)).rejects.toThrow()
  expect(enumerate).not.toHaveBeenCalled()
  expect(handle?.fd).toBe(-1)
})
it('enumerates the opened directory rather than a path replacement, then refuses stale output', async () => {
  const enumerate = fsp.opendir
  let observed: string[] = []
  vi.spyOn(fsp, 'opendir').mockImplementation(async (...args: any[]) => {
    fs.renameSync(directory, path.join(workspace, 'original'))
    fs.symlinkSync(path.join(root, 'outside'), directory)
    const stream = await (enumerate as any)(...args)
    const entry = await stream.read()
    observed = entry ? [entry.name] : []
    return stream
  })
  await expect(readDirectory(workspace, directory)).rejects.toThrow()
  expect(observed).toEqual(['public.txt'])
})
it('propagates cancellation after enumeration without returning entries', async () => {
  const controller = new AbortController()
  const enumerate = fsp.opendir
  vi.spyOn(fsp, 'opendir').mockImplementation(async (...args: any[]) => {
    const stream = await (enumerate as any)(...args)
    const read = stream.read.bind(stream)
    vi.spyOn(stream, 'read').mockImplementation(async () => {
      const entry = await read()
      controller.abort()
      return entry
    })
    return stream
  })
  await expect(readDirectory(workspace, directory, { abortSignal: controller.signal })).rejects.toThrow()
})

it('rechecks identity after bounded enumeration before returning names', async () => {
  const open = fsp.opendir
  let stream: fs.Dir | undefined
  vi.spyOn(fsp, 'opendir').mockImplementation(async (...args) => {
    stream = await open(...args)
    const read = stream.read.bind(stream)
    vi.spyOn(stream, 'read').mockImplementationOnce(async () => {
      const entry = await read()
      fs.renameSync(directory, path.join(workspace, 'original'))
      fs.symlinkSync(path.join(root, 'outside'), directory)
      return entry
    })
    return stream
  })
  await expect(readDirectory(workspace, directory)).rejects.toThrow()
  await expect(Promise.resolve().then(() => stream!.read())).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' })
})
it('refuses a regular file instead of opening it as a directory', async () => {
  const open = vi.spyOn(fsp, 'open')
  await expect(readDirectory(workspace, path.join(directory, 'public.txt'))).rejects.toThrow('directory')
  expect(open).not.toHaveBeenCalled()
})

it('retains a path-check branch on platforms without proc directory descriptors', async () => {
  const platform = process.platform
  const open = vi.spyOn(fsp, 'open')
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  try {
    expect((await readDirectory(workspace, directory)).map(entry => entry.name)).toEqual(['public.txt'])
    await expect(readDirectory(workspace, path.join(root, 'outside'))).rejects.toThrow('outside')
    expect(open).not.toHaveBeenCalled()
  } finally { Object.defineProperty(process, 'platform', { value: platform, configurable: true }) }
})
