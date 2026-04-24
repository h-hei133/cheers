#!/usr/bin/env node

import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runNodeScript(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(3))
  })
}

console.log('gate name=release-smoke')
console.log('mode=smoke')
console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
console.log(`repo=${repoRoot}`)

const providerCode = await runNodeScript('verify-provider-readiness.mjs')
if (providerCode !== 0) {
  const status =
    providerCode === 2
      ? 'provider-network-inconclusive'
      : providerCode === 3
        ? 'config-failure'
        : 'product-regression'
  console.log(`[${status}] release-smoke - provider readiness exited ${providerCode}`)
  process.exit(providerCode)
}

console.log('[pass] release-smoke')
process.exit(0)
