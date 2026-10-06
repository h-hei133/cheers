import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listDirectoryEntries, listWorkspaceFiles } from './fileWalk.js'
import { createDefaultExecutionService } from './service.js'
import { createCoreToolRegistry } from '../../core/tools/registry.js'

let root: string
let workspace: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'list-access-'))
  workspace = path.join(root, 'workspace')
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, 'public.txt'), 'public')
  fs.writeFileSync(path.join(workspace, 'denied.txt'), 'private')
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})
function check(target: string): void {
  if (path.basename(target).startsWith('denied')) throw new Error('denied')
}
it.each([false, true])('filters denied and escaped entries with git=%s', async (git) => {
  if (git) execFileSync('git', ['init', '-q', workspace])
  fs.mkdirSync(path.join(workspace, 'denied-folder'))
  fs.writeFileSync(path.join(workspace, 'denied-folder', 'private.txt'), 'private')
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside')
  fs.symlinkSync(path.join(root, 'outside.txt'), path.join(workspace, 'escape'))
  fs.symlinkSync(path.join(workspace, 'denied.txt'), path.join(workspace, 'alias'))
  const files = await listWorkspaceFiles(workspace, { assertFileAccess: check })
  expect(files).toEqual(['public.txt'])
})
it('refuses an external listing root before enumerating', async () => {
  const read = vi.spyOn(fs.promises, 'opendir')
  await expect(createDefaultExecutionService().listFilesRecursive({
    operationKind: 'file.list', absoluteRoot: root, workspaceRoot: workspace,
    authority: { mode: 'read-only', source: 'tool-runtime-approval', reason: 'test' },
    caller: 'test', reason: 'test', reportSafeTarget: 'outside',
  })).rejects.toThrow('outside')
  await expect(listDirectoryEntries(workspace, root)).rejects.toThrow('outside')
  expect(read).not.toHaveBeenCalled()
})
it('rejects denied and pre-cancelled directories before opendir', async () => {
  const read = vi.spyOn(fs.promises, 'opendir')
  await expect(listDirectoryEntries(workspace, workspace, { assertFileAccess: () => { throw new Error('denied') } })).rejects.toThrow('denied')
  const controller = new AbortController(); controller.abort()
  await expect(listDirectoryEntries(workspace, workspace, { abortSignal: controller.signal })).rejects.toThrow()
  expect(read).not.toHaveBeenCalled()
})
it('does not descend into denied directories or read denied ignore files in the walk', async () => {
  const denied = path.join(workspace, 'denied-folder')
  fs.mkdirSync(denied)
  fs.writeFileSync(path.join(denied, 'private.txt'), 'private')
  fs.writeFileSync(path.join(workspace, '.ignore'), '*.txt')
  const read = vi.spyOn(fs, 'readFileSync')
  const dirs = vi.spyOn(fs.promises, 'opendir')
  const files = await listWorkspaceFiles(workspace, { assertFileAccess: (target) => {
    check(target)
    if (path.basename(target) === '.ignore') throw new Error('denied')
  } })
  expect(files).toEqual(['public.txt'])
  expect(dirs).not.toHaveBeenCalledWith(denied, expect.anything())
  expect(read).not.toHaveBeenCalledWith(path.join(workspace, '.ignore'), 'utf8')
})
it('read directory output omits denied paths and explains omissions', async () => {
  const result = await createCoreToolRegistry().get('read')!.execute({ path: '.' }, {
    workspaceRoot: workspace, taskId: 'test', assertFileAccess: check,
  })
  expect(result.success).toBe(true)
  expect(result.output).toContain('public.txt')
  expect(result.output).not.toContain('denied.txt')
  expect(result.output).toContain('access rules')
})
it('glob forwards policy into the real execution service', async () => {
  const result = await createCoreToolRegistry().get('glob')!.execute({ pattern: '*.txt' }, {
    workspaceRoot: workspace, taskId: 'test', assertFileAccess: check,
  })
  expect(result.success).toBe(true)
  expect(result.output).toBe('public.txt')
})
it('retains ordinary double-dot-prefixed files in the fallback walk', async () => {
  fs.writeFileSync(path.join(workspace, '..notes'), 'notes')
  expect(await listWorkspaceFiles(workspace, { respectIgnore: false })).toContain('..notes')
})
