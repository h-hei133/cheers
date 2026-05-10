#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRealProviderHome, getTestRoot } from './support/testPaths.mjs'

const DEFAULT_FIXTURE_PREFIX = 'pca-real-single-file-create-'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetPath = 'src/new-note.txt'
const plannedContent = 'hello real create smoke\ncreated by real provider'

export function createSingleFileCreateFixture(options = {}) {
  const baseDir = path.resolve(options.baseDir ?? path.join(getTestRoot(), 'real-provider-single-file-create'))
  fs.mkdirSync(baseDir, { recursive: true })
  const fixtureDir = fs.mkdtempSync(path.join(baseDir, DEFAULT_FIXTURE_PREFIX))
  assertSafeFixturePath(fixtureDir)

  const files = {
    'src/.keep': 'parent exists\n',
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(fixtureDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }
  initializeFixtureGitRepo(fixtureDir, Object.keys(files))

  return {
    fixtureDir,
    targetPath,
    plannedContent,
    files: Object.keys(files).sort(),
    prompt: buildSingleFileCreatePrompt(),
  }
}

export function buildSingleFileCreatePrompt() {
  return [
    'This is an isolated selected-workspace create-only smoke.',
    'Return exactly one apply_patch block and no explanation.',
    'Do not run tools or shell commands.',
    'Do not update, delete, move, rename, or modify existing files.',
    'Create exactly one new file: src/new-note.txt',
    'The parent directory src already exists.',
    'The target file src/new-note.txt does not exist.',
    'Required content for src/new-note.txt:',
    '```text',
    plannedContent,
    '```',
    'Use this exact patch shape:',
    '*** Begin Patch',
    '*** Add File: src/new-note.txt',
    '+hello real create smoke',
    '+created by real provider',
    '*** End Patch',
  ].join('\n')
}

export function snapshotSingleFileCreateFixture(fixtureDir) {
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

export function compareSingleFileCreateSnapshots(before, after) {
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

export function readSingleFileCreateTarget(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertSafeFixturePath(root)
  const absoluteTarget = path.join(root, targetPath)
  return fs.existsSync(absoluteTarget)
    ? fs.readFileSync(absoluteTarget, 'utf8')
    : undefined
}

export function cleanupSingleFileCreateFixture(fixtureDir) {
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
      'seed single-file create fixture',
    ],
    { cwd: fixtureDir, stdio: 'ignore' },
  )
}

function assertSafeFixturePath(targetPath) {
  const target = normalizePath(targetPath)
  const normalizedRepoRoot = normalizePath(repoRoot)
  if (target === normalizedRepoRoot || target.startsWith(`${normalizedRepoRoot}/`)) {
    throw new Error('Refusing to use repository root for single-file create fixture')
  }

  const realHome = getRealProviderHome({ allowDefault: true })
  if (realHome) {
    const normalizedRealHome = normalizePath(realHome)
    if (target === normalizedRealHome || target.startsWith(`${normalizedRealHome}/`)) {
      throw new Error('Refusing to use real-provider home for single-file create fixture')
    }
  }

  const testRoot = normalizePath(getTestRoot())
  if (!(target === testRoot || target.startsWith(`${testRoot}/`))) {
    throw new Error('Refusing to use a single-file create fixture outside the configured test root')
  }
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function runSelfTest() {
  const fixture = createSingleFileCreateFixture()
  try {
    const before = snapshotSingleFileCreateFixture(fixture.fixtureDir)
    const after = snapshotSingleFileCreateFixture(fixture.fixtureDir)
    const comparison = compareSingleFileCreateSnapshots(before, after)
    const targetContent = readSingleFileCreateTarget(fixture.fixtureDir)
    const promptOk =
      fixture.prompt.includes('Return exactly one apply_patch block') &&
      fixture.prompt.includes('*** Add File: src/new-note.txt') &&
      fixture.prompt.includes('Do not update, delete, move, rename, or modify existing files.')
    const passed =
      fixture.files.join(',') === 'src/.keep' &&
      fixture.targetPath === 'src/new-note.txt' &&
      fixture.plannedContent === plannedContent &&
      targetContent === undefined &&
      comparison.ok &&
      promptOk

    console.log(`fixture=${fixture.fixtureDir}`)
    console.log(`files=${fixture.files.join(',')}`)
    console.log(`targetMissing=${targetContent === undefined}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-provider-single-file-create-fixture-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupSingleFileCreateFixture(fixture.fixtureDir)
  }
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false

if (isMain) {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
  } else {
    console.log('Usage: node scripts/real-provider-single-file-create-fixture.mjs --self-test')
  }
}
