import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WalkBudget } from './budget.js'
import { listDirectoryEntries, listWorkspaceFiles } from '../fileWalk.js'
import { loadDirectoryMatcher } from '../ignoreRules.js'
import { executeLocally } from '../local.js'
import { completeNativeRead, isNativeFileQuery } from '../../../test-utils/native.js'
import { repositoryMarker } from '../view/git.js'
import { configureGitView } from '../view/config.js'

// Isolate native-output/fallback accounting from separately tested metadata and
// mirror traversal; retain the real read plan and launcher completion verifier.
vi.mock('../view/git.js', () => ({ repositoryMarker: vi.fn() }))
vi.mock('../view/config.js', () => ({ configureGitView: vi.fn() }))
vi.mock('../view/tree.js', () => ({ materializeView: async () => {} }))

vi.mock('../local.js', () => ({ executeLocally: vi.fn() }))
let root: string
let query: typeof executeLocally
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-budget-'))
  vi.mocked(repositoryMarker).mockReset().mockResolvedValue(undefined)
  vi.mocked(configureGitView).mockReset().mockResolvedValue({ ignoreCase: false })
  query = async input => {
    completeNativeRead(input, 128)
    return { status: 'failed', exitCode: 128, stdout: '', stderr: '' }
  }
  vi.mocked(executeLocally).mockReset().mockImplementation(async input => {
    if (isNativeFileQuery(input)) return query(input)
    completeNativeRead(input)
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' }
  })
})
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }) })

function native(): void { vi.mocked(repositoryMarker).mockResolvedValue(path.join(root, '.git')) }

async function put(name: string, content = ''): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true })
  await fs.writeFile(path.join(root, name), content)
}

it.each(['entries', 'directories'])('shares the %s budget across sibling directories', async kind => {
  for (const name of ['a/one', 'b/two', 'c/three']) await put(name)
  await expect(listWorkspaceFiles(root, { respectIgnore: false,
    limits: kind === 'entries' ? { entries: 4 } : { directories: 2 },
  })).rejects.toMatchObject({ name: 'WalkLimitError', reason: kind })
})

it('stops at the depth budget before opening the deeper directory', async () => {
  await put('a/b/c/one')
  const open = vi.spyOn(fs, 'opendir')
  await expect(listWorkspaceFiles(root, { respectIgnore: false, limits: { depth: 1 } })).rejects.toMatchObject({ reason: 'depth' })
  expect(open).toHaveBeenCalledTimes(2)
})

it.each(['walk', 'listing'])('counts UTF-8 path bytes during %s enumeration', async kind => {
  await put('界'.repeat(30))
  const options = { respectIgnore: false, limits: { pathBytes: 20 } }
  await expect(kind === 'walk' ? listWorkspaceFiles(root, options) : listDirectoryEntries(root, root, options)).rejects.toMatchObject({ reason: 'pathBytes' })
})

it('keeps a single deadline across native fallback and directory reads', async () => {
  native()
  await put('a/one')
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.mocked(configureGitView).mockImplementation(async () => {
    clock = 4
    return null
  })
  const opendir = fs.opendir
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args) => {
    const stream = await opendir(...args)
    const close = stream.close.bind(stream)
    vi.spyOn(stream, 'close').mockImplementation(async () => { await close(); clock += 2 })
    return stream
  })
  await expect(listWorkspaceFiles(root, { limits: { timeoutMs: 5 } })).rejects.toMatchObject({ reason: 'deadline' })
  expect(vi.mocked(fs.opendir)).toHaveBeenCalledTimes(1)
})

it('shares ignore bytes across ancestor files and fails without applying partial rules', async () => {
  await put('.gitignore', 'absent-a\n')
  await put('a/.gitignore', 'absent-b\n')
  await expect(loadDirectoryMatcher(root, path.join(root, 'a'), { limits: { ignoreBytes: 15 } })).rejects.toMatchObject({ reason: 'ignoreBytes' })
})

it('checks the deadline after a denied missing ignore source without trying another source', async () => {
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const assertFileAccess = vi.fn(() => { clock = 6; throw new Error('denied') })
  await expect(loadDirectoryMatcher(root, path.join(root, 'nested'), {
    limits: { timeoutMs: 5 }, assertFileAccess,
  })).rejects.toMatchObject({ name: 'WalkLimitError', reason: 'deadline' })
  expect(assertFileAccess).toHaveBeenCalledTimes(1)
})

it('accepts an ignore file at the exact byte ceiling after observing EOF', async () => {
  const content = 'hidden.txt\n'
  await put('.gitignore', content)
  const matcher = await loadDirectoryMatcher(root, root, { limits: { ignoreBytes: Buffer.byteLength(content) } })
  expect(matcher.ignores('hidden.txt')).toBe(true)
  expect(matcher.ignores('public.txt')).toBe(false)
})

it.each(['entries', 'pathBytes'])('retains consumed native %s when metadata preparation falls back', async kind => {
  await put('one')
  native()
  vi.mocked(configureGitView).mockImplementation(async sources => {
    sources.input.budget.take(kind, kind === 'entries' ? 1 : 4)
    return null
  })
  const opendir = vi.spyOn(fs, 'opendir')
  await expect(listWorkspaceFiles(root, {
    limits: kind === 'entries' ? { entries: 1 } : { pathBytes: 5 },
  })).rejects.toMatchObject({ name: 'WalkLimitError', reason: kind })
  expect(opendir).toHaveBeenCalledTimes(1)
})

it('bounds actual ignore reads and closes the handle after exceeding the byte budget', async () => {
  await put('.gitignore', 'x'.repeat(2 * 1024 * 1024))
  const open = fs.open
  let bytes = 0
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  const fullReads = vi.fn()
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    handle = await open(...args)
    const read = handle.read.bind(handle)
    vi.spyOn(handle, 'readFile').mockImplementation(fullReads)
    vi.spyOn(handle, 'read').mockImplementation(async (...options: any[]) => {
      const result = await read(...options as [any]); bytes += result.bytesRead; return result
    })
    return handle
  })
  await expect(loadDirectoryMatcher(root, root, { limits: { ignoreBytes: 256 } })).rejects.toMatchObject({ reason: 'ignoreBytes' })
  expect(bytes).toBe(257)
  expect(fullReads).not.toHaveBeenCalled()
  expect(handle?.fd).toBe(-1)
})

it.each(['rules', 'ruleBytes'])('limits cumulative %s after nested rule expansion', async kind => {
  await put('.gitignore', 'first\nsecond\n')
  await put('nested/.gitignore', 'third\nfourth\n')
  await expect(loadDirectoryMatcher(root, path.join(root, 'nested'), {
    limits: kind === 'rules' ? { rules: 3 } : { ruleBytes: 20 },
  })).rejects.toMatchObject({ reason: kind })
})

it.each(['entries', 'pathBytes'])('stops native output at the %s budget without launching fallback', async kind => {
  native()
  query = async input => {
    input.onStdout?.(Buffer.from('one\0two\0three\0'))
    expect(input.abortSignal?.aborted).toBe(true)
    return { status: 'cancelled', exitCode: null, failureKind: 'cancelled', stdout: '', stderr: '' }
  }
  const open = vi.spyOn(fs, 'opendir')
  await expect(listWorkspaceFiles(root, { limits: kind === 'entries' ? { entries: 2 } : { pathBytes: 5 } })).rejects.toMatchObject({ reason: kind })
  expect(open).not.toHaveBeenCalled()
})

it('keeps unverified native cleanup ahead of a traversal limit', async () => {
  native()
  query = async input => {
    input.onStdout?.(Buffer.from('one\0two\0'))
    return { status: 'failed', exitCode: null, failureKind: 'execution_failure', stdout: '', stderr: 'PRIVATE_DIAGNOSTIC' }
  }
  await expect(listWorkspaceFiles(root, { limits: { entries: 1 } })).rejects.toThrow('process cleanup could not be verified')
})

it('does not read an oversized denied ignore file', async () => {
  await put('.gitignore', 'x'.repeat(2 * 1024 * 1024))
  await put('one.txt')
  expect(await listWorkspaceFiles(root, { limits: { ignoreBytes: 1 }, assertFileAccess: target => {
    if (path.basename(target) === '.gitignore') throw new Error('denied')
  } })).toEqual(['one.txt'])
})

it('does not let callers raise fixed cumulative ceilings', () => {
  const budget = new WalkBudget(undefined, { entries: 1_000_000 })
  expect(() => budget.take('entries', 100_001)).toThrow('entry count')
})

it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid traversal bounds %s before enumeration', async entries => {
  const open = vi.spyOn(fs, 'opendir')
  await expect(listWorkspaceFiles(root, { limits: { entries } })).rejects.toThrow('positive safe integers')
  expect(open).not.toHaveBeenCalled()
})
