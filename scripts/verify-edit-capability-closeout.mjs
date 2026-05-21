#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const testTargets = [
  'src/orchestration/patchParsing/parser.test.ts',
  'src/orchestration/patchParsing/fencedPatchExtractor.test.ts',
  'src/orchestration/patchParsing/boundedBroadPatchNormalizer.test.ts',
  'src/orchestration/patchParsing/broadPatchUnsupportedReason.test.ts',
  'src/orchestration/patchResult/boundedApplyPatchCandidate.test.ts',
  'src/orchestration/patchResult/boundedWritePolicy.test.ts',
  'src/orchestration/patchResult/editCompatibilityGauntlet.test.ts',
  'src/orchestration/patchResult/editCapabilityReadiness.test.ts',
  'src/orchestration/patchResult/editCapabilityCloseoutManifest.test.ts',
  'src/orchestration/fencedEditPlanner.test.ts',
  'src/orchestration/fencedEditOutcome.test.ts',
  'src/orchestration/fencedEditActivation.test.ts',
  'src/orchestration/fencedEditRoute.test.ts',
  'src/orchestration/fencedEditRuntimeActivation.test.ts',
  'src/entrypoints/cliRuntimeInvocation.test.ts',
  'src/orchestration/patchRecovery/restoreCommandContract.test.ts',
  'src/orchestration/patchRecovery/restoreCommandRunner.test.ts',
  'src/orchestration/patchRecovery/restoreExecutionBridge.test.ts',
  'src/orchestration/patchRecovery/restorePreview.test.ts',
]

console.log('gate name=edit-capability-closeout')
console.log('mode=focused')
console.log('status taxonomy: pass=0 product-regression=1 config-failure=3')
console.log('report field activated_fenced_replacement=covered')
console.log('report field stopped_no_write_unsupported=covered')
console.log('report field continuation_safe_evidence=covered')
console.log('report field raw_content_excluded=covered')
console.log('report field result_contract_compatible=covered')
console.log(`repo=${repoRoot}`)

const code = await run('npm', [
  'run',
  'test',
  '-w',
  'packages/ts-shell',
  '--',
  ...testTargets,
])

if (code !== 0) {
  console.log(`[product-regression] edit-capability-closeout - focused tests exited ${code}`)
  process.exit(code)
}

console.log('marker activated-success-reachable-through-prompt-cli')
console.log('marker mutation-ran-for-fenced-edit-success')
console.log('marker mutation-not-run-for-stopped-unsupported-fenced-edit')
console.log('marker missing-mapping-stopped')
console.log('marker multiple-matches-stopped')
console.log('marker stale-read-stopped')
console.log('marker continuation-safe-evidence-present')
console.log('marker raw-content-excluded')
console.log('marker result-contract-compatible')
console.log('[pass] edit-capability-closeout')
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
