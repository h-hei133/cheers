#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_FIXTURE_PREFIX = 'pca-real-readonly-coding-'
const FORBIDDEN_REAL_HOME_FRAGMENT = normalizePath('D:/Test/home-sf')

export function createReadonlyCodingFixture(options = {}) {
  const baseDir = path.resolve(options.baseDir ?? os.tmpdir())
  const fixtureDir = fs.mkdtempSync(path.join(baseDir, DEFAULT_FIXTURE_PREFIX))
  assertNotRealProviderHome(fixtureDir)

  const files = {
    'README.md': [
      '# Read-only fixture',
      '',
      'This fixture is used to verify that a real provider can inspect project context without changing files.',
      'The expected summary should mention Project Atlas, the data flow, and the safety constraint.',
      '',
    ].join('\n'),
    'src/context.txt': [
      'Project: Project Atlas',
      'Runtime: TypeScript control plane with provider-backed query loop.',
      'Important: this smoke must not edit, create, delete, rename, or rewrite files.',
      '',
    ].join('\n'),
    'docs/flow.md': [
      '# Flow',
      '',
      '1. User asks for a read-only summary.',
      '2. The model reads fixture files.',
      '3. The terminal result reports success with changedFiles empty.',
      '',
    ].join('\n'),
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(fixtureDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }

  return {
    fixtureDir,
    files: Object.keys(files).sort(),
    prompt: buildReadonlyCodingPrompt(Object.keys(files).sort()),
  }
}

export function buildReadonlyCodingPrompt(files) {
  return [
    'Read the fixture files listed below and summarize the project in three bullets.',
    'This is a read-only task: do not edit, create, delete, rename, or rewrite any file.',
    'Do not run shell commands.',
    'Mention Project Atlas, the TypeScript control-plane data flow, and the no-mutation safety constraint.',
    'Files:',
    ...files.map((file) => `- ${file}`),
    'Expected evidence: terminal result is success, changedFiles is empty, and the fixture snapshot is unchanged.',
  ].join('\n')
}

export function snapshotReadonlyFixture(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertNotRealProviderHome(root)
  const files = new Map()

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name)
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

export function compareReadonlySnapshots(before, after) {
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

export function cleanupReadonlyFixture(fixtureDir) {
  const root = path.resolve(fixtureDir)
  assertNotRealProviderHome(root)
  if (!path.basename(root).startsWith(DEFAULT_FIXTURE_PREFIX)) {
    throw new Error(`Refusing to clean non-fixture directory: ${root}`)
  }
  fs.rmSync(root, { recursive: true, force: true })
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function assertNotRealProviderHome(targetPath) {
  const normalized = normalizePath(targetPath)
  if (normalized === FORBIDDEN_REAL_HOME_FRAGMENT || normalized.startsWith(`${FORBIDDEN_REAL_HOME_FRAGMENT}/`)) {
    throw new Error('Refusing to use real-provider home for read-only fixture')
  }
}

function normalizePath(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function runSelfTest() {
  const fixture = createReadonlyCodingFixture()
  try {
    const before = snapshotReadonlyFixture(fixture.fixtureDir)
    const after = snapshotReadonlyFixture(fixture.fixtureDir)
    const comparison = compareReadonlySnapshots(before, after)
    const expectedFiles = ['README.md', 'docs/flow.md', 'src/context.txt']
    const filesOk = expectedFiles.every((file) => fixture.files.includes(file))
    const promptOk =
      fixture.prompt.includes('read-only task') &&
      fixture.prompt.includes('changedFiles is empty') &&
      fixture.prompt.includes('Project Atlas')
    const passed = filesOk && promptOk && comparison.ok
    console.log(`fixture=${fixture.fixtureDir}`)
    console.log(`files=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-provider-readonly-fixture-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupReadonlyFixture(fixture.fixtureDir)
  }
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false

if (isMain) {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
  } else {
    console.log('Usage: node scripts/real-provider-readonly-fixture.mjs --self-test')
  }
}
