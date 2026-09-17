#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const testTargets = [
  'src/core/harness/browserTrace.test.ts',
  'src/core/harness/browserTxnReport.test.ts',
  'src/core/harness/browserScore.test.ts',
  'src/core/harness/browserTxnEval.test.ts',
  'src/core/harness/browserTxnGate.test.ts',
  'src/core/harness/browserTxn.test.ts',
  'src/core/harness/browserTxnAgent.test.ts',
  'src/core/harness/browserTxnContinue.test.ts',
  'src/core/harness/browserAgentLoop.test.ts',
  'src/core/harness/browserContinue.test.ts',
  'src/core/harness/pwReal.test.ts',
  'src/core/harness/pwRuntime.test.ts',
  'src/core/harness/pwValidationReport.test.ts',
  'src/core/harness/browserToolServerBackend.test.ts',
]

console.log('gate name=browser-txn-gate')
console.log('mode=focused')
console.log('status taxonomy: pass=0 product-regression=1 config-failure=3')
console.log('boundaries=no-provider,no-public-web,no-auth-session,no-raw-dom,no-image-capture,no-live-mcp,no-page-persistence')
console.log(`repo=${repoRoot}`)

const missingTargets = testTargets.filter(
  (target) => !existsSync(path.join(repoRoot, 'packages', 'ts-shell', target)),
)
if (missingTargets.length > 0) {
  // vitest ignores paths that do not exist, so passing a stale list would run a
  // subset and still exit 0. The gate must say what it did not cover instead of
  // reporting a pass it did not earn.
  console.log(
    `[product-regression] browser-txn-gate - declared ${testTargets.length}, present ${testTargets.length - missingTargets.length}, missing ${missingTargets.length}`,
  )
  for (const target of missingTargets) {
    console.log(`  missing target: ${target}`)
  }
  process.exit(1)
}

const code = await run('npm', [
  'run',
  'test',
  '-w',
  'packages/ts-shell',
  '--',
  ...testTargets,
])

if (code !== 0) {
  console.log(`[product-regression] browser-txn-gate - focused tests exited ${code}`)
  process.exit(code)
}

console.log('[pass] browser-txn-gate')
process.exit(0)

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(3))
  })
}
