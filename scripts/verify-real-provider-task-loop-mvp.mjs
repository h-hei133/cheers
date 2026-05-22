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
  'src/orchestration/realTaskLoopRuntime.test.ts',
  'src/orchestration/realTaskLoopResult.test.ts',
  'src/orchestration/realTaskLoopScorecard.test.ts',
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
  return result.status ?? 1
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
