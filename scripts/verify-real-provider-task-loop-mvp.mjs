#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
  fakeReadyHome,
  sanitizedProviderEnv,
} from './real-provider-smokes/approvedProviderEnv.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const runnerPath = path.join(repoRoot, 'scripts', 'real-provider-smokes', 'taskLoopRunner.ts')

const focusedTests = [
  'src/orchestration/realTaskLoopFixture.test.ts',
  'src/orchestration/realTaskLoopPlan.test.ts',
  'src/orchestration/claimLedgerProjection.test.ts',
  'src/orchestration/realTaskLoopRuntime.test.ts',
  'src/orchestration/realTaskLoopResult.test.ts',
  'src/orchestration/realTaskLoopScorecard.test.ts',
  'src/orchestration/verificationRepairPlanner.test.ts',
  'src/orchestration/verificationRepairLoop.test.ts',
  'src/orchestration/verificationRepairResult.test.ts',
  'src/orchestration/editRepairResult.test.ts',
  'src/orchestration/liveProviderAdapterApproval.test.ts',
  'src/orchestration/openAICompatibleAnchoredSmokeAdapter.test.ts',
  'src/orchestration/anchoredProposalRuntime.test.ts',
  'src/orchestration/anchoredProposalEval.test.ts',
  'src/orchestration/anchoredProposalScorecard.test.ts',
  'src/orchestration/providerOutputValidator.test.ts',
  'src/orchestration/providerProposalAnchors.test.ts',
  'src/orchestration/providerAnchorMatcher.test.ts',
  'src/orchestration/providerAnchorConflict.test.ts',
  'src/orchestration/providerAnchoredProposal.test.ts',
  'src/orchestration/editProposalApply.test.ts',
  'src/orchestration/proposalHunkSetRoute.test.ts',
  'src/orchestration/editSnapshot.test.ts',
  'src/orchestration/harnessScorecard.test.ts',
  'src/orchestration/harnessFailureTaxonomy.test.ts',
]

console.log('gate name=real-provider-task-loop-mvp')
console.log('route=route200-real-provider-task-loop-mvp')
console.log('marker task-loop-default-no-provider-call')
console.log('marker task-loop-default-no-apply')
console.log('marker task-loop-fake-confirmation-required')
console.log('marker task-loop-confirmed-controlled-apply')
console.log('marker task-loop-readback-verification')
console.log('marker task-loop-scorecard')
console.log('marker task-loop-session-continue-evidence')
console.log('marker task-loop-no-broad-mutation')
console.log('marker task-loop-openai-compatible-adapter-approval')
console.log('marker task-loop-openai-compatible-provider-boundary')
console.log('marker task-loop-verification-repair-proof-chain')
console.log('private-config-manual-read=false')

const runnerExit = runTaskLoopRunner()
const testExit = runFocusedTests()

if (runnerExit !== 0) process.exit(runnerExit)
process.exit(testExit)

function runTaskLoopRunner() {
  const liveOptIn = process.env.PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE?.trim() === '1'
  const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === '1'
  const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim()
  const fakeReady = realProviderHome === fakeReadyHome

  console.log(`live-task-loop-opt-in=${liveOptIn ? 'true' : 'false'}`)
  console.log(`real-provider-smoke-opt-in=${realProviderSmokeOptIn ? 'true' : 'false'}`)

  if (!liveOptIn) {
    return runRunner(sanitizedProviderEnv(process.env))
  }

  if (fakeReady) {
    return runRunner({
      ...sanitizedProviderEnv(process.env),
      PRIVATE_AGENTS_TASK_LOOP_FAKE_READY: '1',
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '1',
      PRIVATE_AGENTS_REAL_PROVIDER: 'openai-compatible',
      PRIVATE_AGENTS_TASK_LOOP_PROVIDER_SAFE_LABEL: 'fake-ready-openai-compatible',
      PRIVATE_AGENTS_TASK_LOOP_CONFIG_SOURCE: 'fake-ready',
    })
  }

  if (!realProviderSmokeOptIn) {
    return runRunner(sanitizedProviderEnv(process.env))
  }

  const effective = buildEffectiveProviderEnv(process.env)
  console.log(`configSource=${effective.configSource}`)
  if (effective.providerEnvError) {
    return runRunner({
      ...sanitizedProviderEnv(process.env),
      PRIVATE_AGENTS_TASK_LOOP_CONFIG_SOURCE: effective.configSource,
      PRIVATE_AGENTS_TASK_LOOP_PROVIDER_ENV_ERROR: effective.providerEnvError.reason,
    })
  }

  const canonical = canonicalProviderEnv(effective.env)
  return runRunner({
    ...sanitizedProviderEnv(process.env),
    ...canonical.env,
    PRIVATE_AGENTS_TASK_LOOP_CONFIG_SOURCE: effective.configSource,
    PRIVATE_AGENTS_TASK_LOOP_PROVIDER_SAFE_LABEL: canonical.providerSafeLabel,
  })
}

function runRunner(env) {
  const bundle = buildRunnerBundle(env)
  const outputDir = path.dirname(bundle)
  const stdoutPath = path.join(outputDir, 'taskLoopRunner.stdout.log')
  const stderrPath = path.join(outputDir, 'taskLoopRunner.stderr.log')
  const stdoutFd = fs.openSync(stdoutPath, 'w')
  const stderrFd = fs.openSync(stderrPath, 'w')
  const result = spawnSync(process.execPath, [bundle], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', stdoutFd, stderrFd],
  })
  fs.closeSync(stdoutFd)
  fs.closeSync(stderrFd)
  const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : ''
  const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : ''
  if (stdout) fs.writeSync(process.stdout.fd, redact(stdout))
  if (stderr) fs.writeSync(process.stderr.fd, redact(stderr))
  const runnerStatus = result.status ?? 1
  if (runnerStatus !== 0) return runnerStatus
  return validateRunnerSuccessMarkers(stdout, env)
}

function validateRunnerSuccessMarkers(stdout, env) {
  const expectedMarkers = expectedRunnerSuccessMarkers(env)
  const missing = expectedMarkers.filter((marker) => !stdout.includes(marker))
  if (missing.length > 0) {
    console.log('[product-regression] real-provider-task-loop-mvp runner markers missing')
    for (const marker of missing) console.log(`missing-marker=${marker}`)
    return 1
  }
  console.log('[pass] real-provider-task-loop-mvp runner markers validated')
  return 0
}

function expectedRunnerSuccessMarkers(env) {
  const liveOptIn = env.PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE?.trim() === '1'
  const confirmApply = env.PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY?.trim() === '1'
  const repairProof = env.PRIVATE_AGENTS_TASK_LOOP_REPAIR_PROOF?.trim() === '1'
  const confirmRepairApply = env.PRIVATE_AGENTS_CONFIRM_TASK_LOOP_REPAIR_APPLY?.trim() === '1'
  const fakeReady = env.PRIVATE_AGENTS_TASK_LOOP_FAKE_READY?.trim() === '1'
  const base = [
    'no-broad-mutation=true',
    'provider-call-during-apply=false',
    'Raw provider output: excluded',
    'claim-ledger=claim_ledger_',
  ]
  if (!liveOptIn) {
    return [
      ...base,
      'claim-ledger-source=default-safe',
      'claim-ledger-terminal=skipped',
      'claim-ledger-live-success=false',
      'provider-called=false',
      'output-validation=none',
      'anchor-quality=none',
      'confirmation=not-requested',
      'apply=not-run',
      'verification=not-run',
      'status=skipped-no-provider-opt-in',
    ]
  }
  if (confirmApply) {
    if (repairProof && !confirmRepairApply) {
      return [
        ...base,
        `claim-ledger-source=${fakeReady ? 'fake-ready' : 'live-provider'}`,
        'claim-ledger-terminal=repair-confirmation-required',
        'claim-ledger-live-success=false',
        'provider-called=true',
        'output-validation=valid-exact-single-target',
        'anchor-quality=exact-ready',
        'confirmation=trusted-confirmed',
        'apply=succeeded',
        'verification=failed',
        'mutation-scope=controlled-temp-workspace',
        'snapshot=created',
        'recovery=available',
        'repair-status=repair-confirmation-required',
        'repair-proposal=created',
        'repair-anchor=exact-ready',
        'repair-confirmation=required',
        'repair-apply=not-run',
        'repair-verification=not-run',
        'repair-evidence-original-readback=true',
        'repair-evidence-proposal-source=fake-provider',
        'repair-evidence-existing-exact-apply-lane=false',
        'repair-evidence-final-readback=false',
        'repair-evidence-runtime-derived=false',
        'status=repair-confirmation-required',
      ]
    }
    if (repairProof && fakeReady) {
      return [
        ...base,
        'claim-ledger-source=fake-ready',
        'claim-ledger-terminal=verification-succeeded-with-repair-not-live',
        'claim-ledger-live-success=false',
        'claim-ledger-not-proven=repair,provider',
        'provider-called=true',
        'output-validation=valid-exact-single-target',
        'anchor-quality=exact-ready',
        'confirmation=trusted-confirmed',
        'apply=succeeded',
        'verification=failed',
        'mutation-scope=controlled-temp-workspace',
        'snapshot=created',
        'recovery=available',
        'repair-status=repair-verification-succeeded',
        'repair-proposal=created',
        'repair-anchor=exact-ready',
        'repair-confirmation=trusted-confirmed',
        'repair-apply=succeeded',
        'repair-verification=succeeded',
        'repair-evidence-original-readback=true',
        'repair-evidence-proposal-source=fake-provider',
        'repair-evidence-existing-exact-apply-lane=true',
        'repair-evidence-final-readback=true',
        'repair-evidence-runtime-derived=true',
        'status=verification-succeeded-with-repair',
      ]
    }
    if (repairProof) {
      return [
        ...base,
        'claim-ledger-source=live-provider',
        'claim-ledger-terminal=verification-succeeded-with-repair-not-live',
        'claim-ledger-live-success=false',
        'claim-ledger-not-proven=repair',
        'provider-called=true',
        'output-validation=valid-exact-single-target',
        'anchor-quality=exact-ready',
        'confirmation=trusted-confirmed',
        'apply=succeeded',
        'verification=failed',
        'mutation-scope=controlled-temp-workspace',
        'snapshot=created',
        'recovery=available',
        'repair-status=repair-verification-succeeded',
        'repair-proposal=created',
        'repair-anchor=exact-ready',
        'repair-confirmation=trusted-confirmed',
        'repair-apply=succeeded',
        'repair-verification=succeeded',
        'repair-evidence-original-readback=true',
        'repair-evidence-proposal-source=fake-provider',
        'repair-evidence-existing-exact-apply-lane=true',
        'repair-evidence-final-readback=true',
        'repair-evidence-runtime-derived=true',
        'status=verification-succeeded-with-repair',
      ]
    }
    if (fakeReady) {
      return [
        ...base,
        'claim-ledger-source=fake-ready',
        'claim-ledger-terminal=verification-succeeded-not-live',
        'claim-ledger-live-success=false',
        'claim-ledger-not-proven=provider',
        'provider-called=true',
        'output-validation=valid-exact-single-target',
        'anchor-quality=exact-ready',
        'confirmation=trusted-confirmed',
        'apply=succeeded',
        'verification=succeeded',
        'mutation-scope=controlled-temp-workspace',
        'snapshot=created',
        'recovery=available',
        'status=verification-succeeded',
      ]
    }
    return [
      ...base,
      'claim-ledger-source=live-provider',
      'claim-ledger-terminal=verified-success',
      'claim-ledger-live-success=true',
      'claim-ledger-not-proven=none',
      'provider-called=true',
      'output-validation=valid-exact-single-target',
      'anchor-quality=exact-ready',
      'confirmation=trusted-confirmed',
      'apply=succeeded',
      'verification=succeeded',
      'mutation-scope=controlled-temp-workspace',
      'snapshot=created',
      'recovery=available',
      'status=task-loop-complete',
    ]
  }
  return [
    ...base,
    `claim-ledger-source=${fakeReady ? 'fake-ready' : 'live-provider'}`,
    'claim-ledger-terminal=confirmation-required',
    'claim-ledger-live-success=false',
    'provider-called=true',
    'output-validation=valid-exact-single-target',
    'anchor-quality=exact-ready',
    'confirmation=required',
    'apply=not-run',
    'verification=not-run',
    'mutation-scope=none',
    'snapshot=not-run',
    'recovery=not-run',
    'status=confirmation-required',
  ]
}

function buildRunnerBundle(env) {
  const esbuild = require('esbuild')
  const testRoot = env.PRIVATE_AGENTS_TEST_ROOT?.trim() || '/tmp/private-agents-test'
  const bundleDir = path.join(testRoot, 'real-provider-task-loop-mvp', 'runner')
  fs.mkdirSync(bundleDir, { recursive: true })
  const outfile = path.join(bundleDir, 'taskLoopRunner.cjs')
  esbuild.buildSync({
    entryPoints: [runnerPath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent',
  })
  return outfile
}

function runFocusedTests() {
  const testEnv = sanitizedProviderEnv(process.env)
  testEnv.PRIVATE_AGENTS_PROVIDER_MODE = 'synthetic'
  testEnv.PRIVATE_AGENTS_REAL_HOME = ''
  testEnv.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE = ''
  testEnv.PRIVATE_AGENTS_LIVE_TASK_LOOP_SMOKE = ''
  testEnv.PRIVATE_AGENTS_CONFIRM_TASK_LOOP_APPLY = ''
  testEnv.PRIVATE_AGENTS_TASK_LOOP_SIMULATE_VERIFICATION_FAILURE = ''
  testEnv.PRIVATE_AGENTS_TASK_LOOP_REPAIR_PROOF = ''
  testEnv.PRIVATE_AGENTS_CONFIRM_TASK_LOOP_REPAIR_APPLY = ''

  const result = spawnSync(
    'npm',
    ['run', 'test', '-w', 'packages/ts-shell', '--', ...focusedTests],
    {
      stdio: 'inherit',
      env: testEnv,
    },
  )
  if (result.status !== 0) {
    console.log(`[product-regression] real-provider-task-loop-mvp focused tests exited ${result.status}`)
    return result.status ?? 1
  }
  console.log('[pass] real-provider-task-loop-mvp focused tests passed')
  return 0
}

function redact(input) {
  return String(input ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g, '[REDACTED_API_KEY]')
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi, '$1$2$3[REDACTED]')
    .replace(/\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi, '[REAL_PROVIDER_HOME]')
}
