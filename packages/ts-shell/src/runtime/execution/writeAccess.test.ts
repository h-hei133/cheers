import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createWorkspaceWriteAuthority } from '../../edit/authority/workspace.js'
import { captureRecoveryAuthorityRecord } from '../../edit/recovery/recoveryAuthorityStore.js'
import { createCoreToolRegistry } from '../../core/tools/registry.js'
import { createDefaultExecutionService } from './service.js'
import type { TextFileWriteExecutionRequest } from './types.js'

vi.mock('../../edit/recovery/recoveryAuthorityStore.js', async () => ({
  ...await vi.importActual<typeof import('../../edit/recovery/recoveryAuthorityStore.js')>(
    '../../edit/recovery/recoveryAuthorityStore.js',
  ),
  captureRecoveryAuthorityRecord: vi.fn(),
}))
let root: string
let workspace: string
let target: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-write-access-'))
  workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace)
  target = path.join(workspace, 'note.txt')
  vi.mocked(captureRecoveryAuthorityRecord).mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})
function request(extra: Partial<TextFileWriteExecutionRequest> = {}): TextFileWriteExecutionRequest {
  return {
    operationKind: 'file.write', absolutePath: target, workspaceRoot: workspace,
    content: 'new', authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'test' },
    caller: 'write-access-test', reason: 'test', reportSafeTarget: 'note.txt', ...extra,
  }
}
it('refuses denied creation before making directories or snapshots', async () => {
  const denied = path.join(workspace, 'new', 'note.txt')
  await expect(createDefaultExecutionService().writeTextFile(request({ absolutePath: denied,
    assertFileAccess: () => { throw new Error('denied') },
  }))).rejects.toThrow('denied')
  expect(fs.existsSync(path.dirname(denied))).toBe(false)
  expect(captureRecoveryAuthorityRecord).not.toHaveBeenCalled()
})
it('refuses an external symlink parent before creating its missing descendants', async () => {
  const outside = path.join(root, 'outside')
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(workspace, 'link'))
  await expect(createDefaultExecutionService().writeTextFile(request({
    absolutePath: path.join(workspace, 'link', 'new', 'file.txt'),
  }))).rejects.toThrow('outside')
  expect(fs.readdirSync(outside)).toEqual([])
})
it.each(['deny', 'cancel'])('rechecks %s after snapshot persistence before changing bytes', async (mode) => {
  fs.writeFileSync(target, 'original')
  const controller = new AbortController()
  let denied = false
  vi.mocked(captureRecoveryAuthorityRecord).mockImplementationOnce(async () => {
    if (mode === 'cancel') controller.abort()
    else denied = true
    return undefined as never
  })
  await expect(createDefaultExecutionService().writeTextFile(request({ abortSignal: controller.signal,
    assertFileAccess: () => { if (denied) throw new Error('denied') },
  }))).rejects.toThrow()
  expect(fs.readFileSync(target, 'utf8')).toBe('original')
})
it('pre-cancelled writes create no directories', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(createDefaultExecutionService().writeTextFile(request({
    absolutePath: path.join(workspace, 'new', 'file.txt'), abortSignal: controller.signal,
  }))).rejects.toThrow()
  expect(fs.readdirSync(workspace)).toEqual([])
})
it('checks the opened write object before truncation and closes it on denial', () => {
  fs.writeFileSync(target, 'original')
  const moved = path.join(workspace, 'denied.txt')
  const open = fs.openSync
  const close = vi.spyOn(fs, 'closeSync')
  let descriptor = -1
  vi.spyOn(fs, 'openSync').mockImplementation((...args: Parameters<typeof fs.openSync>) => {
    const fd = open(...args)
    if (args[0] === target) {
      descriptor = fd
      fs.renameSync(target, moved)
    }
    return fd
  })
  expect(() => createWorkspaceWriteAuthority(workspace).writeFile('note.txt', 'new', (actual) => {
    if (actual === moved) throw new Error('denied')
  })).toThrow('denied')
  expect(fs.readFileSync(moved, 'utf8')).toBe('original')
  expect(close).toHaveBeenCalledWith(descriptor)
})
it.each(['write', 'edit'])('forwards %s access and cancellation to the final write service', async (name) => {
  fs.writeFileSync(target, 'original')
  const service = createDefaultExecutionService()
  const controller = new AbortController()
  const check = vi.fn()
  const write = vi.fn(service.writeTextFile)
  const registry = createCoreToolRegistry({ executionService: { ...service, writeTextFile: write } })
  await registry.get(name)!.execute({ path: 'note.txt', content: 'new' }, {
    workspaceRoot: workspace, taskId: 'test', assertFileAccess: check, abortSignal: controller.signal,
  })
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ assertFileAccess: check, abortSignal: controller.signal }))
  expect(fs.readFileSync(target, 'utf8')).toBe('new')
})
it('allows ordinary double-dot-prefixed names', async () => {
  const name = path.join(workspace, '..notes')
  await createDefaultExecutionService().writeTextFile(request({ absolutePath: name }))
  expect(fs.readFileSync(name, 'utf8')).toBe('new')
})

it('accepts a canonical tool target under a symlink workspace root', async () => {
  const alias = path.join(root, 'alias')
  fs.symlinkSync(workspace, alias)
  await createCoreToolRegistry().get('write')!.execute({ path: 'note.txt', content: 'new' }, {
    workspaceRoot: alias, taskId: 'test', assertFileAccess: vi.fn(),
  })
  expect(fs.readFileSync(target, 'utf8')).toBe('new')
})

it.each([1, 2])('rejects the actual object before snapshot/condition read %i', async (readNumber) => {
  fs.writeFileSync(target, 'original')
  const moved = path.join(workspace, 'denied.txt')
  const open = fs.openSync
  const read = vi.spyOn(fs, 'readFileSync')
  const close = vi.spyOn(fs, 'closeSync')
  let reads = 0
  let descriptor = -1
  vi.spyOn(fs, 'openSync').mockImplementation((...args: Parameters<typeof fs.openSync>) => {
    const fd = open(...args)
    if (args[0] === target && ++reads === readNumber) {
      descriptor = fd
      fs.renameSync(target, moved)
      read.mockClear()
    }
    return fd
  })
  await expect(createDefaultExecutionService().writeTextFile(request({ expectedContent: 'original',
    assertFileAccess: (actual) => { if (actual === moved) throw new Error('denied') },
  }))).rejects.toThrow('denied')
  expect(read).not.toHaveBeenCalledWith(descriptor, 'utf8')
  expect(close).toHaveBeenCalledWith(descriptor)
  expect(captureRecoveryAuthorityRecord).toHaveBeenCalledTimes(readNumber - 1)
  expect(fs.readFileSync(moved, 'utf8')).toBe('original')
})
