#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectVitestModule } from './toolchain.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const nodeExe = process.execPath
const vitestModule = detectVitestModule(rootDir)

function runStack(name, command, args, extraEnv = {}) {
  process.stdout.write(`\n${'='.repeat(60)}\n`)
  process.stdout.write(`Running: ${name}\n`)
  process.stdout.write(`${'='.repeat(60)}\n\n`)

  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    shell: false,
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status}`)
  }

  process.stdout.write(`\n✓ ${name} PASSED\n`)
}

function main() {
  process.stdout.write(`${'='.repeat(60)}\n`)
  process.stdout.write('TypeScript Test Infrastructure - Unified Runner\n')
  process.stdout.write(`${'='.repeat(60)}\n`)

  runStack('TypeScript Tests (vitest)', nodeExe, [vitestModule, 'run', '--dir', 'packages/ts-shell/src'])
  // The gates under scripts/ carry their own tests so a gate that stops
  // detecting what it was written for fails here rather than silently passing.
  runStack('Script Tests (node --test)', nodeExe, ['--test', 'scripts/*.test.mjs'])

  process.stdout.write(`\n${'='.repeat(60)}\n`)
  process.stdout.write('✓ All tests PASSED\n')
  process.stdout.write(`${'='.repeat(60)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`\n✗ UNIFIED TEST FAILED\n`)
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
