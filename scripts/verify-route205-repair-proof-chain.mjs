#!/usr/bin/env node

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  fakeReadyHome,
  sanitizedProviderEnv,
} from './real-provider-smokes/approvedProviderEnv.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const taskLoopVerifier = path.join(repoRoot, 'scripts', 'verify-real-provider-task-loop-mvp.mjs')

console.log('gate name=route205-repair-proof-chain')
console.log('delegates=verify-real-provider-task-loop-mvp')
console.log('real-api-run=false')
console.log('private-config-manual-read=false')
console.log('marker route205-original-verification-failure-preserved')
console.log('marker route205-repair-proposal-confirmation-required')
console.log('marker route205-repair-confirmed-existing-exact-lane')
console.log('marker route205-repair-reverification-succeeded')
console.log('marker route205-claim-ledger-verified-success-with-repair')
console.log('marker route205-fake-repair-not-live-success')
console.log('marker route205-provider-call-during-apply-false')
console.log('marker route205-no-production-workspace-mutation')

const scenarios = [
  {
    name: 'claim-ledger-live-repair-terminal',
    command: 'npm',
    args: [
      'run',
      'test',
      '-w',
      'packages/ts-shell',
      '--',
      'src/orchestration/claimLedgerProjection.test.ts',
      '-t',
      'derives live verified success with repair only from preserved failure plus re-verification',
    ],
    env: isolatedEnv('route205-claim-ledger-live-repair', {}),
    markers: [
      'route205-marker claim-ledger-terminal=verified-success-with-repair source=claimLedgerProjection.test',
    ],
  },
  {
    name: 'repair-confirmation-required',
    command: process.execPath,
    args: [taskLoopVerifier],
    env: isolatedEnv('route205-repair-confirmation-required', {
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '1',
      PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE: '1',
      PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY: '1',
      PRIVATE_AGENTS_TASK_LOOP_SIMULATE_VERIFICATION_FAILURE: '1',
      PRIVATE_AGENTS_TASK_LOOP_REPAIR_PROOF: '1',
      PRIVATE_AGENTS_REAL_HOME: fakeReadyHome,
    }),
    requiredOutput: [
      'verification=failed',
      'repair-evidence-original-readback=true',
      'claim-ledger-terminal=repair-confirmation-required',
      'repair-proposal=created',
      'repair-confirmation=required',
      'repair-apply=not-run',
      'mutation-scope=controlled-temp-workspace',
      'provider-call-during-apply=false',
      'no-broad-mutation=true',
    ],
    markers: [
      'route205-marker original-verification-failure-preserved=pass',
      'route205-marker repair-proposal-no-write-confirmation-required=pass',
      'route205-marker provider-call-during-apply=false',
      'route205-marker no-production-workspace-mutation=pass',
    ],
  },
  {
    name: 'repair-confirmed-not-live',
    command: process.execPath,
    args: [taskLoopVerifier],
    env: isolatedEnv('route205-repair-confirmed', {
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '1',
      PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE: '1',
      PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY: '1',
      PRIVATE_AGENTS_TASK_LOOP_SIMULATE_VERIFICATION_FAILURE: '1',
      PRIVATE_AGENTS_TASK_LOOP_REPAIR_PROOF: '1',
      PRIVATE_AGENTS_CONFIRM_TASK_LOOP_REPAIR_APPLY: '1',
      PRIVATE_AGENTS_REAL_HOME: fakeReadyHome,
    }),
    requiredOutput: [
      'verification=failed',
      'repair-evidence-original-readback=true',
      'repair-confirmation=trusted-confirmed',
      'repair-apply=succeeded',
      'repair-verification=succeeded',
      'repair-evidence-existing-exact-apply-lane=true',
      'repair-evidence-final-readback=true',
      'repair-evidence-runtime-derived=true',
      'status=verification-succeeded-with-repair',
      'claim-ledger-terminal=verification-succeeded-with-repair-not-live',
      'claim-ledger-live-success=false',
      'claim-ledger-not-proven=repair,provider',
      'mutation-scope=controlled-temp-workspace',
      'provider-call-during-apply=false',
      'no-broad-mutation=true',
    ],
    markers: [
      'route205-marker repair-confirmed-existing-exact-lane=pass',
      'route205-marker repair-reverification-succeeded=pass',
      'route205-marker fake-repair-not-live-success=pass',
      'route205-marker provider-call-during-apply=false',
      'route205-marker no-production-workspace-mutation=pass',
    ],
  },
]

for (const scenario of scenarios) {
  const result = spawnSync(scenario.command, scenario.args, {
    cwd: repoRoot,
    env: scenario.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = redact(result.stdout ?? '')
  const stderr = redact(result.stderr ?? '')
  if ((result.status ?? 1) !== 0) {
    console.log(`[product-regression] route205 scenario failed: ${scenario.name}`)
    printTail(stdout, stderr)
    process.exit(result.status ?? 1)
  }
  const missing = (scenario.requiredOutput ?? []).filter((marker) => !stdout.includes(marker))
  if (missing.length > 0) {
    console.log(`[product-regression] route205 markers missing: ${scenario.name}`)
    for (const marker of missing) console.log(`missing-marker=${marker}`)
    printTail(stdout, stderr)
    process.exit(1)
  }
  console.log(`[pass] route205 scenario ${scenario.name}`)
  for (const marker of scenario.markers) console.log(marker)
}

console.log('[pass] route205-repair-proof-chain')

function isolatedEnv(name, extra) {
  const root = `/tmp/private-agents-test/${name}`
  return {
    ...sanitizedProviderEnv(process.env),
    PRIVATE_AGENTS_REAL_HOME: '',
    PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '',
    PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE: '',
    PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY: '',
    PRIVATE_AGENTS_TASK_LOOP_SIMULATE_VERIFICATION_FAILURE: '',
    PRIVATE_AGENTS_TASK_LOOP_REPAIR_PROOF: '',
    PRIVATE_AGENTS_CONFIRM_TASK_LOOP_REPAIR_APPLY: '',
    PRIVATE_AGENTS_TEST_ROOT: root,
    HOME: `${root}-home`,
    USERPROFILE: `${root}-home`,
    ...extra,
  }
}

function printTail(stdout, stderr) {
  const output = [stdout, stderr].filter(Boolean).join('\n')
  for (const line of output.split(/\r?\n/).slice(-80)) {
    if (line.trim()) console.log(line)
  }
}

function redact(input) {
  return String(input ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g, '[REDACTED_API_KEY]')
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi, '$1$2$3[REDACTED]')
    .replace(/\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi, '[REAL_PROVIDER_HOME]')
}
