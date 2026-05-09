#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRealProviderHome, getTestRoot } from './support/testPaths.mjs'

const DEFAULT_FIXTURE_PREFIX = 'pca-real-single-file-update-'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function createSingleFileUpdateFixture(options = {}) {
  const baseDir = path.resolve(options.baseDir ?? path.join(getTestRoot(), 'real-provider-single-file-update'))
  fs.mkdirSync(baseDir, { recursive: true })
  const fixtureDir = fs.mkdtempSync(path.join(baseDir, DEFAULT_FIXTURE_PREFIX))
  assertSafeFixturePath(fixtureDir)

  const files = {
    'src/app.ts': [
      'export const status = "draft"',
      'export const owner = "fixture"',
      '',
    ].join('\n'),
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(fixtureDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }
  initializeFixtureGitRepo(fixtureDir, Object.keys(files))

  return {
    fixtureDir,
    targetPath: 'src/app.ts',
    files: Object.keys(files).sort(),
    prompt: buildSingleFileUpdatePrompt(),
  }
}

export function buildSingleFileUpdatePrompt() {
  return [
    'This is an isolated selected-workspace update-only smoke.',
    'Return exactly one apply_patch block and no explanation.',
    'Do not run tools or shell commands.',
    'Do not create, add, delete, move, or rename files.',
    'Target existing file: src/app.ts',
    'Current src/app.ts content:',
    '```ts',
    'export const status = "draft"',
    'export const owner = "fixture"',
    '```',
    'Required update: modify only src/app.ts by replacing status "draft" with "ready".',
    'Use this exact patch shape:',
    '*** Begin Patch',
    '*** Update File: src/app.ts',
    '@@',
    '-export const status = "draft"',
    '+export const status = "ready"',
    '*** End Patch',
  ].join('\n')
}

export function snapshotSingleFileUpdateFixture(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertSafeFixturePath(root)
  const files = new Map()

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory() && entry.name === '.git') {
        continue
      }
      const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      files.set(relativePath, sha256(fs.readFileSync(absolutePath)))
    }
  }

  visit(root)
  return Object.freeze(Object.fromEntries([...files.entries()].sort()))
}

export function compareSingleFileUpdateSnapshots(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)])
  const added = []
  const removed = []
  const changed = []

  for (const name of [...names].sort()) {
    if (!(name in before)) {
      added.push(name)
    } else if (!(name in after)) {
      removed.push(name)
    } else if (before[name] !== after[name]) {
      changed.push(name)
    }
  }

  return {
    ok: added.length === 0 && removed.length === 0 && changed.length === 0,
    added,
    removed,
    changed,
  }
}

export function readSingleFileUpdateTarget(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertSafeFixturePath(root)
  return fs.readFileSync(path.join(root, 'src', 'app.ts'), 'utf8')
}

export function cleanupSingleFileUpdateFixture(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertSafeFixturePath(root)
  if (!path.basename(root).startsWith(DEFAULT_FIXTURE_PREFIX)) {
    throw new Error(`Refusing to clean non-fixture directory: ${root}`)
  }
  fs.rmSync(root, { recursive: true, force: true })
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function initializeFixtureGitRepo(fixtureDir, files) {
  execFileSync('git', ['init', '--quiet'], { cwd: fixtureDir, stdio: 'ignore' })
  execFileSync('git', ['add', '--', ...files], { cwd: fixtureDir, stdio: 'ignore' })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Private Agents Fixture',
      '-c',
      'user.email=private-agents-fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'seed single-file update fixture',
    ],
    { cwd: fixtureDir, stdio: 'ignore' },
  )
}

function assertSafeFixturePath(targetPath) {
  const target = normalizePath(targetPath)
  const normalizedRepoRoot = normalizePath(repoRoot)
  if (target === normalizedRepoRoot || target.startsWith(`${normalizedRepoRoot}/`)) {
    throw new Error('Refusing to use repository root for single-file update fixture')
  }

  const realHome = getRealProviderHome({ allowDefault: true })
  if (realHome) {
    const normalizedRealHome = normalizePath(realHome)
    if (target === normalizedRealHome || target.startsWith(`${normalizedRealHome}/`)) {
      throw new Error('Refusing to use real-provider home for single-file update fixture')
    }
  }

  const testRoot = normalizePath(getTestRoot())
  if (!(target === testRoot || target.startsWith(`${testRoot}/`))) {
    throw new Error('Refusing to use a single-file update fixture outside the configured test root')
  }
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function runSelfTest() {
  const fixture = createSingleFileUpdateFixture()
  try {
    const before = snapshotSingleFileUpdateFixture(fixture.fixtureDir)
    const after = snapshotSingleFileUpdateFixture(fixture.fixtureDir)
    const comparison = compareSingleFileUpdateSnapshots(before, after)
    const content = readSingleFileUpdateTarget(fixture.fixtureDir)
    const promptOk =
      fixture.prompt.includes('Return exactly one apply_patch block') &&
      fixture.prompt.includes('*** Update File: src/app.ts') &&
      fixture.prompt.includes('Do not create, add, delete, move, or rename files.')
    const passed =
      fixture.files.join(',') === 'src/app.ts' &&
      fixture.targetPath === 'src/app.ts' &&
      content.includes('status = "draft"') &&
      comparison.ok &&
      promptOk

    console.log(`fixture=${fixture.fixtureDir}`)
    console.log(`files=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-provider-single-file-update-fixture-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupSingleFileUpdateFixture(fixture.fixtureDir)
  }
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false

if (isMain) {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
  } else {
    console.log('Usage: node scripts/real-provider-single-file-update-fixture.mjs --self-test')
  }
}
