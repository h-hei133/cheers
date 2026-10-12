import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadDirectoryMatcher } from './ignoreRules.js'
import { listWorkspaceFiles } from './fileWalk.js'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ignore-syntax-')) })
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })

function write(name: string, content = 'fixture'): void {
  const target = path.join(root, name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

it('preserves significant pattern whitespace in the verified loader and fallback walk', async () => {
  write('.gitignore', ' leading.txt\n #note.txt\ntrailing\\ \n/anchored.txt\n')
  const hidden = [' leading.txt', ' #note.txt', 'anchored.txt', ...(process.platform === 'win32' ? [] : ['trailing '])]
  const visible = ['leading.txt', '#note.txt', 'trailing', 'deep/anchored.txt']
  for (const name of [...hidden, ...visible]) write(name)
  execFileSync('git', ['init', '-q', root])
  const native = execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '-z', '--stdin'], {
    input: [...hidden, ...visible].join('\0') + '\0', encoding: 'utf8',
  }).split('\0').filter(Boolean)
  expect(native).toEqual(hidden)
  const matcher = await loadDirectoryMatcher(root, root)
  {
    for (const name of hidden) expect(matcher.ignores(name), name).toBe(true)
    for (const name of visible) expect(matcher.ignores(name), name).toBe(false)
  }
  fs.mkdirSync(path.join(root, 'empty-bin'))
  vi.stubEnv('PATH', path.join(root, 'empty-bin'))
  const files = await listWorkspaceFiles(root)
  for (const name of hidden) expect(files).not.toContain(name)
  for (const name of visible) expect(files).toContain(name)
})

it.each(['scope', 'literal[1]', '#scope', '!scope', ...(process.platform === 'win32' ? [] : ['star*', 'back\\slash', 'line\nname'])])(
  'keeps nested patterns scoped to the literal directory %j and matches native Git', async directory => {
    write(`${directory}/.gitignore`, 'hidden.txt\ncache/\n/anchored.txt\n leading.txt\n')
    const hidden = [`${directory}/hidden.txt`, `${directory}/deep/hidden.txt`, `${directory}/deep/cache/file.txt`,
      `${directory}/anchored.txt`, `${directory}/ leading.txt`]
    const visible = ['hidden.txt', 'other/hidden.txt', 'star-other/hidden.txt', 'literal1/hidden.txt',
      `${directory}/deep/anchored.txt`, `${directory}/leading.txt`]
    for (const name of [...hidden, ...visible]) write(name)
    execFileSync('git', ['init', '-q', root])
    const native = execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '-z', '--stdin'], {
      input: [...hidden, ...visible].join('\0') + '\0', encoding: 'utf8',
    }).split('\0').filter(Boolean)
    expect(native).toEqual(hidden)
    const target = path.join(root, directory)
    const matcher = await loadDirectoryMatcher(root, target)
    {
      for (const name of hidden) expect(matcher.ignores(name), name).toBe(true)
      for (const name of visible) expect(matcher.ignores(name), name).toBe(false)
    }
    fs.mkdirSync(path.join(root, 'empty-bin'))
    vi.stubEnv('PATH', path.join(root, 'empty-bin'))
    const files = await listWorkspaceFiles(root)
    for (const name of hidden) expect(files).not.toContain(name)
    for (const name of visible) expect(files).toContain(name)
  },
)

it.each([
  { content: '\uFEFFhidden.txt\n', hidden: ['scope/hidden.txt'], visible: ['other/hidden.txt'] },
  { content: '\uFEFF#comment\nhidden.txt\n', hidden: ['scope/hidden.txt'], visible: ['scope/#comment'] },
  { content: '\uFEFF/hidden.txt\n', hidden: ['scope/hidden.txt'], visible: ['scope/deep/hidden.txt'] },
  { content: '\uFEFF!keep.tmp\n', hidden: ['scope/drop.tmp'], visible: ['scope/keep.tmp'] },
  ...(process.platform === 'win32' ? [] : [
    { content: '\t\n\u00a0\n', hidden: ['scope/\t', 'scope/\u00a0'], visible: ['scope/public.txt'] },
    { content: 'cache/\t\n', hidden: ['scope/cache/\t'], visible: ['scope/deep/cache/\t'] },
  ]),
])('preserves BOM and literal whitespace grammar for %j', async ({ content, hidden, visible }) => {
  write('.gitignore', '*.tmp\n')
  write('scope/.gitignore', content)
  for (const name of [...hidden, ...visible]) write(name)
  execFileSync('git', ['init', '-q', root])
  expect(execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '-z', '--stdin'], {
    input: [...hidden, ...visible].join('\0') + '\0', encoding: 'utf8',
  }).split('\0').filter(Boolean)).toEqual(hidden)
  const matcher = await loadDirectoryMatcher(root, path.join(root, 'scope'))
  {
    for (const name of hidden) expect(matcher.ignores(name), name).toBe(true)
    for (const name of visible) expect(matcher.ignores(name), name).toBe(false)
  }
  fs.mkdirSync(path.join(root, 'empty-bin'))
  vi.stubEnv('PATH', path.join(root, 'empty-bin'))
  const files = await listWorkspaceFiles(root)
  for (const name of hidden) expect(files).not.toContain(name)
  for (const name of visible) expect(files).toContain(name)
})
