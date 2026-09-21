import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listWorkspaceFiles } from './fileWalk.js'

let root: string | undefined

function makeRoot(): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-walk-'))
  return root
}

function write(relative: string, content = ''): void {
  const full = path.join(root as string, relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

function gitInit(): void {
  execFileSync('git', ['init', '-q'], { cwd: root })
}

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true })
  root = undefined
})

describe('workspace file walk', () => {
  it('does not descend into the directories that hold no source', async () => {
    makeRoot()
    write('src/a.ts')
    write('node_modules/pkg/index.js')
    write('dist/bundle.js')
    write('.git/config')
    write('.normproof/out.json')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toEqual(['src/a.ts'])
  })

  it('prunes a nested copy of a pruned directory, not just a top-level one', async () => {
    makeRoot()
    write('packages/app/src/index.ts')
    write('packages/app/node_modules/dep/index.js')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toContain('packages/app/src/index.ts')
    expect(files).not.toContain('packages/app/node_modules/dep/index.js')
  })

  it('returns paths relative to the walk root, not absolute ones', async () => {
    makeRoot()
    write('src/deep/a.ts')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toEqual(['src/deep/a.ts'])
  })

  it('honours the repository ignore rules, including negation', async () => {
    makeRoot()
    gitInit()
    write('.gitignore', '*.log\n!keep.log\nbuild/\n')
    write('app.ts')
    write('x.log')
    write('keep.log')
    write('build/out.js')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toContain('app.ts')
    // A negated pattern re-includes the file the earlier line excluded.
    expect(files).toContain('keep.log')
    expect(files).not.toContain('x.log')
    expect(files).not.toContain('build/out.js')
  })

  it('honours an ignore file in a subdirectory', async () => {
    makeRoot()
    gitInit()
    write('.gitignore', '*.tmp\n')
    write('src/.gitignore', 'inner.log\n')
    write('src/ok.ts')
    write('src/inner.log')
    write('src/other.tmp')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toContain('src/ok.ts')
    expect(files).not.toContain('src/inner.log')
    expect(files).not.toContain('src/other.tmp')
  })

  it('applies the same rules when there is no repository to ask', async () => {
    makeRoot()
    // Deliberately no git init: this is the case where `git ls-files` exits 128
    // and the in-process matcher has to answer instead.
    write('.gitignore', '*.log\n!keep.log\nbuild/\n')
    write('app.ts')
    write('x.log')
    write('keep.log')
    write('build/out.js')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toContain('app.ts')
    expect(files).toContain('keep.log')
    expect(files).not.toContain('x.log')
    expect(files).not.toContain('build/out.js')
  })

  it('anchors a subdirectory pattern to its own directory', async () => {
    makeRoot()
    // No git: this exercises the in-process nested rewrite, where a pattern in
    // `sub/.gitignore` must not also hide the same name at the root.
    write('sub/.gitignore', 'thing.ts\n')
    write('sub/thing.ts')
    write('thing.ts')

    const files = await listWorkspaceFiles(root as string)

    expect(files).toContain('thing.ts')
    expect(files).not.toContain('sub/thing.ts')
  })

  it('treats a directory-only pattern as matching directories only', async () => {
    makeRoot()
    write('.gitignore', 'build/\n')
    write('build/out.js')
    write('notes/build')

    const files = await listWorkspaceFiles(root as string)

    expect(files).not.toContain('build/out.js')
    // `build/` names a directory; a file of that name is a different thing.
    expect(files).toContain('notes/build')
  })

  it('can be asked to ignore nothing', async () => {
    makeRoot()
    write('.gitignore', '*.log\n')
    write('x.log')

    const files = await listWorkspaceFiles(root as string, { respectIgnore: false })

    expect(files).toContain('x.log')
  })

  it('returns an empty list for a directory that does not exist', async () => {
    makeRoot()
    const missing = path.join(root as string, 'nope')

    await expect(listWorkspaceFiles(missing)).resolves.toEqual([])
  })
})
