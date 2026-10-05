import fs, { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ignore from 'ignore'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadDirectoryMatcher, loadIgnoreFile } from './ignoreRules.js'
import { listDirectoryEntries } from './fileWalk.js'

let root: string
let workspace: string
let file: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-read-'))
  workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace)
  file = path.join(workspace, '.ignore')
  fs.writeFileSync(file, 'original.txt\n')
  fs.writeFileSync(path.join(root, 'outside'), 'PRIVATE_PATTERN\n')
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })
it('does not read an ignore file replaced after opening', async () => {
  const open = fsp.open
  let handle: Awaited<ReturnType<typeof fsp.open>> | undefined
  let read: ReturnType<typeof vi.spyOn> | undefined
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    handle = await open(...args)
    read = vi.spyOn(handle, 'readFile')
    fs.renameSync(file, path.join(workspace, 'old'))
    fs.symlinkSync(path.join(root, 'outside'), file)
    return handle
  })
  const matcher = ignore()
  await loadIgnoreFile(matcher, file, '', workspace)
  expect(handle).toBeDefined()
  expect(read).not.toHaveBeenCalled()
  expect(handle?.fd).toBe(-1)
  expect(matcher.ignores('PRIVATE_PATTERN')).toBe(false)
})
it('uses the open file and refuses changed-path patterns after the read', async () => {
  const open = fsp.open
  let observed: unknown
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    const read = handle.readFile.bind(handle)
    vi.spyOn(handle, 'readFile').mockImplementation(async (options: any) => {
      fs.renameSync(file, path.join(workspace, 'old'))
      fs.symlinkSync(path.join(root, 'outside'), file)
      observed = await read(options)
      return observed as string
    })
    return handle
  })
  const matcher = ignore()
  await loadIgnoreFile(matcher, file, '', workspace)
  expect(observed).toBe('original.txt\n')
  expect(matcher.ignores('original.txt')).toBe(false)
  expect(matcher.ignores('PRIVATE_PATTERN')).toBe(false)
})
it('applies ancestor and nested negation rules through the verified loader', async () => {
  fs.writeFileSync(file, '*.tmp\n')
  const nested = path.join(workspace, '..notes')
  fs.mkdirSync(nested)
  fs.writeFileSync(path.join(nested, '.ignore'), '!keep.tmp\n')
  const matcher = await loadDirectoryMatcher(workspace, nested)
  expect(matcher.ignores('..notes/drop.tmp')).toBe(true)
  expect(matcher.ignores('..notes/keep.tmp')).toBe(false)
  expect(matcher.ignores('elsewhere/keep.tmp')).toBe(true)
})
it('directory listing uses verified ignore reads instead of direct readFileSync', async () => {
  fs.writeFileSync(path.join(workspace, 'original.txt'), 'hidden')
  fs.writeFileSync(path.join(workspace, 'public.txt'), 'public')
  const opened = vi.spyOn(fsp, 'open')
  const result = await listDirectoryEntries(workspace, workspace)
  expect(result.entries.map(entry => entry.name)).toContain('public.txt')
  expect(result.entries.map(entry => entry.name)).not.toContain('original.txt')
  expect(opened).toHaveBeenCalledWith(file, expect.any(Number))
})
it('does not swallow cancellation as missing ignore rules', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(loadIgnoreFile(ignore(), file, '', workspace, { abortSignal: controller.signal })).rejects.toThrow()
})

it('does not load patterns from an external ignore-file symlink', async () => {
  fs.unlinkSync(file)
  fs.symlinkSync(path.join(root, 'outside'), file)
  const matcher = ignore()
  await loadIgnoreFile(matcher, file, '', workspace)
  expect(matcher.ignores('PRIVATE_PATTERN')).toBe(false)
})
