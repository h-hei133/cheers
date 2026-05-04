#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRealProviderHome, getTestRoot } from './support/testPaths.mjs'

const DEFAULT_FIXTURE_PREFIX = 'pca-real-coding-flow-'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function createCodingFlowFixture(options = {}) {
  const baseDir = path.resolve(options.baseDir ?? path.join(getTestRoot(), 'real-provider-coding-flow'))
  fs.mkdirSync(baseDir, { recursive: true })
  const fixtureDir = fs.mkdtempSync(path.join(baseDir, DEFAULT_FIXTURE_PREFIX))
  assertSafeFixturePath(fixtureDir)

  const files = {
    'README.md': [
      '# Real coding flow fixture',
      '',
      'This fixture verifies that a real provider coding smoke can operate in an isolated workspace.',
      'Only note.txt is editable. README.md and LOCKED.md are protected.',
      '',
    ].join('\n'),
    'note.txt': [
      'status: draft',
      'owner: fixture',
      '',
    ].join('\n'),
    'LOCKED.md': [
      'Do not modify this file.',
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
    editableFiles: ['note.txt'],
    protectedFiles: ['README.md', 'LOCKED.md'],
    files: Object.keys(files).sort(),
    prompt: buildCodingFlowPrompt(),
  }
}

export function buildCodingFlowPrompt() {
  return [
    'This is an isolated fixture coding task.',
    'Edit only note.txt.',
    'Change the line "status: draft" to exactly "status: ready".',
    'Do not modify README.md.',
    'Do not modify LOCKED.md.',
    'Verify note.txt contains "status: ready" and protected files are unchanged.',
  ].join('\n')
}

export function snapshotCodingFlowFixture(fixtureDir) {
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
      const content = fs.readFileSync(absolutePath)
      files.set(relativePath, sha256(content))
    }
  }

  visit(root)
  return Object.freeze(Object.fromEntries([...files.entries()].sort()))
}

export function compareCodingFlowSnapshots(before, after) {
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

export function changedFilesFromCodingComparison(comparison) {
  return [...comparison.added, ...comparison.removed, ...comparison.changed].sort()
}

export function assertOnlyExpectedCodingFixtureChanges(
  comparison,
  expectedChangedFiles,
  protectedFiles = [],
) {
  const observed = changedFilesFromCodingComparison(comparison)
  const expected = [...expectedChangedFiles].sort()
  const unexpected = observed.filter((name) => !expected.includes(name))
  const missing = expected.filter((name) => !observed.includes(name))
  const protectedChanged = protectedFiles.filter((name) => observed.includes(name))
  const passed =
    comparison.added.length === 0 &&
    comparison.removed.length === 0 &&
    unexpected.length === 0 &&
    missing.length === 0 &&
    protectedChanged.length === 0

  return {
    ok: passed,
    observed,
    expected,
    unexpected,
    missing,
    protectedChanged,
  }
}

export function cleanupCodingFlowFixture(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertSafeFixturePath(root)
  if (!path.basename(root).startsWith(DEFAULT_FIXTURE_PREFIX)) {
    throw new Error(`Refusing to clean non-fixture directory: ${root}`)
  }
  fs.rmSync(root, { recursive: true, force: true })
}

export function buildCodingFlowDryRunContract(fixture) {
  return {
    capability: 'real-provider-coding-flow-smoke',
    provider: 'real',
    mode: 'dry-run',
    optInRequired: true,
    realProviderExecution: false,
    modelTurn: false,
    fixtureWorkspace: 'temporary-test-root',
    expectedChangedFiles: ['note.txt'],
    protectedFiles: fixture.protectedFiles,
    expectedVerification: 'passed',
    expectedTerminalResult: 'success-or-attributed-provider-failure',
    skip: {
      defaultGate: true,
      reason: 'real-provider coding flow smoke requires explicit opt-in',
    },
  }
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
      'seed real coding flow fixture',
    ],
    { cwd: fixtureDir, stdio: 'ignore' },
  )
}

function assertSafeFixturePath(targetPath) {
  const target = normalizePath(targetPath)
  const normalizedRepoRoot = normalizePath(repoRoot)
  if (target === normalizedRepoRoot || target.startsWith(`${normalizedRepoRoot}/`)) {
    throw new Error('Refusing to use repository root for real coding flow fixture')
  }

  const realHome = getRealProviderHome({ allowDefault: true })
  if (realHome) {
    const normalizedRealHome = normalizePath(realHome)
    if (target === normalizedRealHome || target.startsWith(`${normalizedRealHome}/`)) {
      throw new Error('Refusing to use real-provider home for real coding flow fixture')
    }
  }

  const testRoot = normalizePath(getTestRoot())
  if (!(target === testRoot || target.startsWith(`${testRoot}/`))) {
    throw new Error('Refusing to use a coding flow fixture outside the configured test root')
  }
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function runSelfTest() {
  const fixture = createCodingFlowFixture()
  try {
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noMutation = compareCodingFlowSnapshots(before, before)
    const notePath = path.join(fixture.fixtureDir, 'note.txt')
    fs.writeFileSync(notePath, 'status: ready\nowner: fixture\n', 'utf8')
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const noteContent = fs.readFileSync(notePath, 'utf8')
    const promptOk =
      fixture.prompt.includes('Edit only note.txt') &&
      fixture.prompt.includes('Do not modify README.md') &&
      fixture.prompt.includes('Do not modify LOCKED.md')
    const passed =
      noMutation.ok &&
      expected.ok &&
      noteContent.includes('status: ready') &&
      promptOk

    console.log(`fixture=${fixture.fixtureDir}`)
    console.log(`files=${fixture.files.join(',')}`)
    console.log(`changedFiles=${expected.observed.join(',')}`)
    console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-provider-coding-fixture-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
  }
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false

if (isMain) {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
  } else {
    console.log('Usage: node scripts/real-provider-coding-fixture.mjs --self-test')
  }
}
