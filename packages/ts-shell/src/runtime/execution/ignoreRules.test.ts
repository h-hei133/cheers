import fs, { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ignore from 'ignore'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadDirectoryMatcher, loadIgnoreFile, loadIgnoredViaGit, listIgnoredViaGit, listWorkspaceFilesViaGit } from './ignoreRules.js'
import { listDirectoryEntries, listWorkspaceFiles } from './fileWalk.js'

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
    read = vi.spyOn(handle, 'read')
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
    const read = handle.read.bind(handle)
    vi.spyOn(handle, 'read').mockImplementationOnce(async (options: any) => {
      fs.renameSync(file, path.join(workspace, 'old'))
      fs.symlinkSync(path.join(root, 'outside'), file)
      const result = await read(options)
      observed = options.buffer.subarray(0, result.bytesRead).toString('utf8')
      return result
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

it.each(['files', 'ignore', 'discovery'])('does not execute configured filesystem monitors during %s queries', async query => {
  execFileSync('git', ['init', '-q', workspace])
  fs.writeFileSync(path.join(workspace, 'tracked.txt'), 'tracked')
  fs.writeFileSync(path.join(workspace, '.gitignore'), '*.tmp\n')
  fs.writeFileSync(path.join(workspace, 'hidden.tmp'), 'hidden')
  execFileSync('git', ['-C', workspace, 'add', 'tracked.txt'])
  const marker = path.join(root, 'monitor-ran')
  const monitor = path.join(root, 'monitor.cjs')
  fs.writeFileSync(monitor, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdout.write('token\\0');\n`, { mode: 0o755 })
  execFileSync('git', ['-C', workspace, 'config', 'core.fsmonitor', monitor])
  if (query === 'files') {
    const files = await listWorkspaceFilesViaGit(workspace)
    expect(files).toContain('tracked.txt')
    expect(files).not.toContain('hidden.tmp')
  } else if (query === 'ignore') {
    expect(await loadIgnoredViaGit(workspace, ['tracked.txt', 'hidden.tmp'])).toEqual(new Set(['hidden.tmp']))
  } else {
    expect(listIgnoredViaGit(workspace, ['tracked.txt', 'hidden.tmp'])).toEqual(new Set(['hidden.tmp']))
  }
  expect(fs.existsSync(marker)).toBe(false)
})

const literalNames = [
  'space name', '中文', '[brackets]',
  ...(process.platform === 'win32' ? [] : ['quote"name', 'tab\tname', 'line\nname', 'back\\slash']),
]

it('resolves relative runtime Git directories exactly once', async () => {
  execFileSync('git', ['init', '-q', workspace])
  fs.writeFileSync(path.join(workspace, '.gitignore'), '*.tmp\n')
  fs.writeFileSync(path.join(workspace, 'public.txt'), 'public')
  const relative = path.relative(process.cwd(), workspace)
  expect(await listWorkspaceFilesViaGit(relative)).toContain('public.txt')
  expect(await loadIgnoredViaGit(relative, ['hidden.tmp', 'public.txt'])).toEqual(new Set(['hidden.tmp']))
})

it.each(['true', 'false'])('preserves tracked and untracked Git paths with core.quotePath=%s', async quotePath => {
  execFileSync('git', ['init', '-q', workspace])
  const nested = path.join(workspace, 'nested')
  fs.mkdirSync(nested)
  execFileSync('git', ['init', '-q', nested])
  execFileSync('git', ['-C', nested, 'config', 'core.quotePath', quotePath])
  fs.writeFileSync(path.join(nested, '.git', 'info', 'exclude'), 'ignored.tmp\n')
  const tracked = literalNames.map(name => `tracked-${name}.tmp`)
  const untracked = literalNames.map(name => `untracked-${name}.txt`)
  for (const name of [...tracked, ...untracked, 'ignored.tmp']) fs.writeFileSync(path.join(nested, name), 'content')
  execFileSync('git', ['--literal-pathspecs', '-C', nested, 'add', '-f', '--', ...tracked])

  expect([...(await listWorkspaceFilesViaGit(nested) ?? [])].sort()).toEqual([...tracked, ...untracked].sort())
})

it.each([listIgnoredViaGit, loadIgnoredViaGit])('checks literal ignore records without interpreting quotes or splitting embedded newlines (%#)', async query => {
  execFileSync('git', ['init', '-q', workspace])
  fs.writeFileSync(path.join(workspace, '.gitignore'), '*.tmp\n')
  fs.writeFileSync(path.join(workspace, 'tracked.tmp'), 'tracked')
  execFileSync('git', ['-C', workspace, 'add', '-f', 'tracked.tmp'])
  const ignored = literalNames.map(name => `${name}.tmp`)
  const visible = ['tracked.tmp', 'public.txt', ...(process.platform === 'win32' ? [] : ['hidden.tmp\npublic.txt', '"quoted.tmp"'])]

  expect(await query(workspace, [...ignored, ...visible])).toEqual(new Set(ignored))
  expect(await query(workspace, visible)).toEqual(new Set())
})

it.each([listIgnoredViaGit, loadIgnoredViaGit])('checks leading-colon names as literal paths without changing ordinary wildcard names (%#)', async query => {
  execFileSync('git', ['init', '-q', workspace])
  fs.writeFileSync(path.join(workspace, '.gitignore'), '*.tmp\n')
  const ignored = [':secret.tmp', './:secret.tmp', ':(literal)secret.tmp', '*secret.tmp', '[secret].tmp']
  expect(await query(workspace, [...ignored, ':public.txt', './:explicit.tmp'])).toEqual(new Set([...ignored, './:explicit.tmp']))
})

it('applies ignore and deny policies to the exact names returned by Git', async () => {
  execFileSync('git', ['init', '-q', workspace])
  fs.writeFileSync(path.join(workspace, '.gitignore'), '*.tmp\n')
  const visible = literalNames.map(name => `${name}.txt`)
  const ignored = literalNames.map(name => `${name}.tmp`)
  const denied = visible.pop()!
  for (const name of [...visible, ...ignored, denied]) fs.writeFileSync(path.join(workspace, name), 'content')
  const checked: string[] = []
  const options = { assertFileAccess: (target: string) => {
    checked.push(target)
    if (target === path.join(workspace, denied)) throw new Error('Denied fixture file')
  } }

  const files = await listWorkspaceFiles(workspace, options)
  const listing = await listDirectoryEntries(workspace, workspace, options)
  const names = listing.entries.map(entry => entry.name)
  for (const name of visible) {
    expect(files).toContain(name)
    expect(names).toContain(name)
    expect(checked).toContain(path.join(workspace, name))
  }
  for (const name of [...ignored, denied]) {
    expect(files).not.toContain(name)
    expect(names).not.toContain(name)
  }
  expect(checked).toContain(path.join(workspace, denied))
  expect(listing.omittedCount).toBe(ignored.length + 2) // ignored files, denied file, .git
})
