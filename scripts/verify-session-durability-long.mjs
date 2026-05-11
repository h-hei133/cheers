#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        PRIVATE_AGENTS_REAL_HOME: '',
        PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(3))
  })
}

console.log('gate name=session-durability-long')
console.log('mode=synthetic')
console.log('provider=not-used')
console.log('realProviderTouched=false')
console.log('scope=long-session auto-compact reload continue mutation durability')

const code = await run('npm', [
  'run',
  'test',
  '-w',
  'packages/ts-shell',
  '--',
  'src/session/longSessionDurability.test.ts',
])

if (code !== 0) {
  console.log(`[product-regression] session-durability-long - focused test exited ${code}`)
  process.exit(code)
}

console.log('[pass] session-durability-long')
process.exit(0)
