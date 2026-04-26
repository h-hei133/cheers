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

function statusForCode(code) {
  if (code === 0) return 'pass'
  if (code === 2) return 'provider-network-inconclusive'
  if (code === 3) return 'config-failure'
  return 'product-regression'
}

console.log('gate name=release-real')
console.log('mode=explicit-real')
console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
console.log(`repo=${repoRoot}`)
console.log('real HOME=D:/Test/home-sf')
console.log('synthetic HOME=D:/Test/pca-home-synth')
console.log('homeCreated=false')
console.log('layering=not part of release-core; run this command explicitly for real-provider release evidence')
console.log('flow=verify-provider-readiness preflight first; run real-user capabilities only after readiness pass')

const providerCode = await runNodeScript('verify-provider-readiness.mjs')
if (providerCode !== 0) {
  const status = statusForCode(providerCode)
  console.log(`[${status}] release-real - provider readiness exited ${providerCode}`)
  process.exit(providerCode)
}

const capabilityCode = await runNodeScript('verify-real-user-capabilities.mjs')
if (capabilityCode !== 0) {
  const status = statusForCode(capabilityCode)
  console.log(`[${status}] release-real - real user capabilities exited ${capabilityCode}`)
  process.exit(capabilityCode)
}

console.log('[pass] release-real')
process.exit(0)
