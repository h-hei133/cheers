import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultExecutionService } from '../../runtime/execution/service.js'
import { createGrepToolDefinition } from './grep.js'
import { forgetRipgrepBinary, MAX_SEARCHED_FILE_BYTES } from './grepRipgrep.js'

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-paths-'))
  for (const directory of ['.hidden', 'hidden', 'src', 'src-other', ' space ', 'empty-bin']) {
    await fs.mkdir(path.join(root, directory))
  }
  for (const directory of ['.hidden', 'hidden', 'src', 'src-other', ' space ']) {
    await fs.writeFile(path.join(root, directory, 'file.txt'), `needle ${directory} marker\n`)
  }
  await fs.symlink(path.join(root, '.hidden'), path.join(root, 'alias'), 'dir')
  forgetRipgrepBinary()
})
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); forgetRipgrepBinary(); await fs.rm(root, { recursive: true, force: true }) })

describe.each(['native', 'fallback'])('%s search target semantics', mode => {
  it('preserves dot directories, spaces, absolute paths and internal aliases', async () => {
    if (mode === 'fallback') vi.stubEnv('PATH', path.join(root, 'empty-bin'))
    const service = createDefaultExecutionService()
    const list = vi.spyOn(service, 'listFilesRecursive')
    const tool = createGrepToolDefinition(service)
    for (const target of ['.hidden', './.hidden', path.join(root, '.hidden'), 'alias', '.hidden/file.txt']) {
      const result = await tool.execute({ pattern: 'needle', path: target }, { workspaceRoot: root, taskId: 'hidden' })
      expect(result.success, target).toBe(true)
      expect(result.output).toContain('needle .hidden marker')
      expect(result.output).not.toContain('needle hidden marker')
    }
    const plain = await tool.execute({ pattern: 'needle', path: 'hidden' }, { workspaceRoot: root, taskId: 'plain' })
    expect(plain.output).toContain('needle hidden marker')
    expect(plain.output).not.toContain('needle .hidden marker')
    const spaced = await tool.execute({ pattern: 'needle', path: ' space ' }, { workspaceRoot: root, taskId: 'spaces' })
    expect(spaced.output).toContain('needle  space  marker')
    if (mode === 'native') expect(list).not.toHaveBeenCalled()
    else expect(list).toHaveBeenCalled()
  })

  it('does not match a sibling with the same prefix', async () => {
    if (mode === 'fallback') vi.stubEnv('PATH', path.join(root, 'empty-bin'))
    const result = await createGrepToolDefinition(createDefaultExecutionService()).execute(
      { pattern: 'needle', path: 'src' }, { workspaceRoot: root, taskId: 'prefix' })
    expect(result.output).toContain('needle src marker')
    expect(result.output).not.toContain('src-other')
  })

  it('rejects outside paths, stable symlink escapes and nonexistent targets without walking', async () => {
    if (mode === 'fallback') vi.stubEnv('PATH', path.join(root, 'empty-bin'))
    await fs.symlink(path.dirname(root), path.join(root, 'escape'), 'dir')
    const service = createDefaultExecutionService()
    const list = vi.spyOn(service, 'listFilesRecursive')
    const tool = createGrepToolDefinition(service)
    for (const target of ['../', path.dirname(root), 'escape', 'missing']) {
      expect((await tool.execute({ pattern: 'needle', path: target }, { workspaceRoot: root, taskId: 'outside' })).success).toBe(false)
    }
    expect(list).not.toHaveBeenCalled()
  })
})

it.each(['exit', 'permission', 'interpreter'])('does not fall back when the native probe fails: %s', async mode => {
  const executable = path.join(root, 'empty-bin', 'rg')
  await fs.writeFile(executable, `#!${mode === 'interpreter' ? path.join(root, 'missing-interpreter') : process.execPath}\nprocess.exit(2);\n`, { mode: mode === 'permission' ? 0o644 : 0o755 })
  vi.stubEnv('PATH', path.dirname(executable))
  const service = createDefaultExecutionService()
  const list = vi.spyOn(service, 'listFilesRecursive')
  const result = await createGrepToolDefinition(service).execute({ pattern: 'needle' }, { workspaceRoot: root, taskId: 'probe' })
  expect(result.success).toBe(false)
  expect(result.error).toContain('failed')
  expect(list).not.toHaveBeenCalled()
})

it('uses the verified execution reader and per-file denial in the fallback', async () => {
  vi.stubEnv('PATH', path.join(root, 'empty-bin'))
  const service = createDefaultExecutionService()
  const read = vi.spyOn(service, 'readTextFile')
  const result = await createGrepToolDefinition(service).execute({ pattern: 'needle' }, {
    workspaceRoot: root, taskId: 'denied', assertFileAccess: target => {
      if (target === path.join(root, '.hidden/file.txt')) throw new Error('denied')
    },
  })
  expect(read).toHaveBeenCalled()
  expect(result.output).not.toContain('needle .hidden marker')
  expect(result.output).toContain('needle hidden marker')
})

it('bounds fallback reads when a candidate grows after its size precheck', async () => {
  vi.stubEnv('PATH', path.join(root, 'empty-bin'))
  const file = path.join(root, 'src/file.txt')
  const service = createDefaultExecutionService()
  const read = service.readTextFile.bind(service)
  let bytesRead = 0
  let closed = false
  const open = fs.open.bind(fs)
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args)
    if (args[0] === file) {
      const readChunk = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementation(async (...readArgs: Parameters<typeof handle.read>) => {
        const result = await readChunk(...readArgs)
        bytesRead += result.bytesRead
        return result
      })
      const close = handle.close.bind(handle)
      vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); closed = true })
    }
    return handle
  })
  vi.spyOn(service, 'readTextFile').mockImplementation(async request => {
    await fs.writeFile(file, Buffer.alloc(MAX_SEARCHED_FILE_BYTES + 65536, 'x'))
    return read(request)
  })
  const result = await createGrepToolDefinition(service).execute({ pattern: 'needle', path: 'src' }, { workspaceRoot: root, taskId: 'growing' })
  expect(result.success).toBe(false)
  expect(result.error).toContain('read byte limit')
  expect(result.output ?? '').not.toContain('No matches')
  expect(bytesRead).toBe(MAX_SEARCHED_FILE_BYTES + 1)
  expect(closed).toBe(true)
})

it('keeps the existing ten MiB candidate boundary usable in the fallback', async () => {
  vi.stubEnv('PATH', path.join(root, 'empty-bin'))
  const content = Buffer.alloc(MAX_SEARCHED_FILE_BYTES, 'x')
  content.write('needle\n')
  await fs.writeFile(path.join(root, 'src/file.txt'), content)
  const result = await createGrepToolDefinition(createDefaultExecutionService()).execute({ pattern: 'needle', path: 'src' }, { workspaceRoot: root, taskId: 'bounded' })
  expect(result.success).toBe(true)
  expect(result.output).toContain('src/file.txt:1: needle')
})
