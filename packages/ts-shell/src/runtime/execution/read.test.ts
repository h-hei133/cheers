import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import { withVerifiedReadFiles } from './read.js'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultExecutionService, type TextFileReadExecutionRequest } from './service.js'

let root: string
let workspace: string
let outside: string
const service = createDefaultExecutionService()

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-boundary-'))
  workspace = path.join(root, 'workspace')
  outside = path.join(root, 'outside')
  fs.mkdirSync(path.join(workspace, 'source'), { recursive: true })
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(workspace, 'source', 'file.txt'), '\ufeffauthorized\r\n')
  fs.writeFileSync(path.join(outside, 'file.txt'), 'OUTSIDE_SECRET_MARKER')
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

function request(target = 'source/file.txt', overrides: Partial<TextFileReadExecutionRequest> = {}): TextFileReadExecutionRequest {
  return { operationKind: 'file.read', absolutePath: path.resolve(workspace, target), workspaceRoot: workspace,
    authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'test' }, caller: 'read-test', reason: 'test',
    reportSafeTarget: target, ...overrides }
}

describe('verified text reads', () => {
  it('preserves exact bytes and reads an authorized internal alias', async () => {
    fs.symlinkSync(path.join(workspace, 'source/file.txt'), path.join(workspace, 'alias.txt'))
    expect(await service.readTextFile(request('alias.txt'))).toBe('\ufeffauthorized\r\n')
    expect(await service.readTextFile(request())).toBe('\ufeffauthorized\r\n')
  })

  it('supports a workspace reached through a symlink and canonical tool targets', async () => {
    const alias = path.join(root, 'workspace-alias')
    fs.symlinkSync(workspace, alias, 'dir')
    expect(await service.readTextFile(request('source/file.txt', { workspaceRoot: alias }))).toBe('\ufeffauthorized\r\n')
    expect(await service.readTextFile(request('source/file.txt', { workspaceRoot: alias,
      absolutePath: path.join(alias, 'source/file.txt') }))).toBe('\ufeffauthorized\r\n')
  })

  it('rejects traversal, outside symlinks and non-files before opening', async () => {
    fs.symlinkSync(outside, path.join(workspace, 'escape'), 'dir')
    const open = vi.spyOn(fsp, 'open')
    for (const target of ['../outside/file.txt', 'escape/file.txt', path.join(outside, 'file.txt'), 'source']) {
      await expect(service.readTextFile(request(target))).rejects.toThrow()
    }
    expect(open).not.toHaveBeenCalled()
  })

  it('rejects a leaf symlink substituted immediately before open', async () => {
    const open = fsp.open.bind(fsp)
    vi.spyOn(fsp, 'open').mockImplementationOnce(async (...args) => {
      fs.unlinkSync(path.join(workspace, 'source/file.txt'))
      fs.symlinkSync(path.join(outside, 'file.txt'), path.join(workspace, 'source/file.txt'))
      return open(...args)
    })
    await expect(service.readTextFile(request())).rejects.toThrow()
  })

  it('closes a changed parent target without reading bytes', async () => {
    const open = fsp.open.bind(fsp)
    let read: ReturnType<typeof vi.spyOn>
    let close: ReturnType<typeof vi.spyOn>
    vi.spyOn(fsp, 'open').mockImplementationOnce(async (...args) => {
      fs.renameSync(path.join(workspace, 'source'), path.join(workspace, 'original'))
      fs.symlinkSync(outside, path.join(workspace, 'source'), 'dir')
      const handle = await open(...args)
      read = vi.spyOn(handle, 'readFile')
      close = vi.spyOn(handle, 'close')
      return handle
    })
    await expect(service.readTextFile(request())).rejects.toThrow('changed')
    expect(read!).not.toHaveBeenCalled()
    expect(close!).toHaveBeenCalledOnce()
  })

  it('rejects an opened object moved outside the workspace before its descriptor is verified', async () => {
    const open = fsp.open.bind(fsp)
    let read: ReturnType<typeof vi.spyOn>
    let close: ReturnType<typeof vi.spyOn>
    vi.spyOn(fsp, 'open').mockImplementationOnce(async (...args) => {
      const handle = await open(...args)
      read = vi.spyOn(handle, 'readFile')
      close = vi.spyOn(handle, 'close')
      fs.renameSync(path.join(workspace, 'source'), path.join(outside, 'moved'))
      return handle
    })
    await expect(service.readTextFile(request())).rejects.toThrow()
    expect(read!).not.toHaveBeenCalled()
    expect(close!).toHaveBeenCalledOnce()
  })

  it('rechecks denial on the opened target and closes on rejection', async () => {
    const open = fsp.open.bind(fsp)
    let read: ReturnType<typeof vi.spyOn>
    let close: ReturnType<typeof vi.spyOn>
    vi.spyOn(fsp, 'open').mockImplementationOnce(async (...args) => {
      const handle = await open(...args)
      read = vi.spyOn(handle, 'readFile'); close = vi.spyOn(handle, 'close')
      return handle
    })
    const check = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('denied') })
    await expect(service.readTextFile(request(undefined, { assertFileAccess: check }))).rejects.toThrow('denied')
    expect(check).toHaveBeenCalledTimes(2)
    expect(read!).not.toHaveBeenCalled(); expect(close!).toHaveBeenCalledOnce()
  })

  it('does not open a pre-cancelled request and closes a request cancelled during open', async () => {
    const controller = new AbortController()
    controller.abort()
    const open = fsp.open.bind(fsp)
    const spy = vi.spyOn(fsp, 'open')
    await expect(service.readTextFile(request(undefined, { abortSignal: controller.signal }))).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
    const during = new AbortController()
    let close: ReturnType<typeof vi.spyOn>
    spy.mockImplementationOnce(async (...args) => {
      const handle = await open(...args)
      close = vi.spyOn(handle, 'close')
      during.abort()
      return handle
    })
    await expect(service.readTextFile(request(undefined, { abortSignal: during.signal }))).rejects.toThrow()
    expect(close!).toHaveBeenCalledOnce()
  })

  it('treats artifact directories as a narrower boundary, never an external read grant', async () => {
    const directory = path.join(workspace, 'artifacts')
    fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, '0.log'), 'artifact bytes')
    expect(await service.readTextFile(request('artifacts/0.log', { artifactDirectory: directory }))).toBe('artifact bytes')
    await expect(service.readTextFile(request(undefined, { artifactDirectory: directory }))).rejects.toThrow('outside')
    await expect(service.readTextFile(request('../outside/file.txt', { artifactDirectory: outside }))).rejects.toThrow('outside')
  })
})

describe('verified command inputs', () => {
  it.each(['later-open', 'consumer'])('closes earlier handles after %s failure', async failure => {
    const open = fsp.open
    const handles: Awaited<ReturnType<typeof fsp.open>>[] = []
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args)
      handles.push(handle)
      return handle
    })
    const consume = vi.fn(async () => { throw new Error('consumer failed') })
    await expect(withVerifiedReadFiles(failure === 'later-open' ? [request(), request('missing')] : [request()], consume)).rejects.toThrow()
    if (failure === 'later-open') expect(consume).not.toHaveBeenCalled()
    expect(handles.length).toBeGreaterThan(0)
    expect(handles.every(handle => handle.fd === -1)).toBe(true)
  })
  it('rechecks earlier objects after opening later inputs', async () => {
    fs.writeFileSync(path.join(workspace, 'second.txt'), 'second')
    const open = fsp.open
    const handles: Awaited<ReturnType<typeof fsp.open>>[] = []
    vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args)
      handles.push(handle)
      if (handles.length === 2) fs.renameSync(path.join(workspace, 'source/file.txt'), path.join(outside, 'moved.txt'))
      return handle
    })
    const consume = vi.fn(async () => 'unexpected')
    await expect(withVerifiedReadFiles([request(), request('second.txt')], consume)).rejects.toThrow()
    expect(consume).not.toHaveBeenCalled()
    expect(handles.every(handle => handle.fd === -1)).toBe(true)
  })
})
