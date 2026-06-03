#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
  fakeReadyHome,
  sanitizedProviderEnv,
} from './real-provider-smokes/approvedProviderEnv.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const anchoredSmokeRunnerPath = path.join(
  repoRoot,
  'scripts',
  'real-provider-smokes',
  'anchoredSmokeRunner.ts',
)

const focusedTests = [
  'src/orchestration/liveProviderAdapterApproval.test.ts',
  'src/orchestration/openAICompatibleAnchoredSmokeAdapter.test.ts',
  'src/orchestration/liveProviderSmokeFixture.test.ts',
  'src/orchestration/liveProviderSmokeEvidence.test.ts',
  'src/orchestration/liveProviderSmokeCalibration.test.ts',
  'src/orchestration/liveProviderSmokeResult.test.ts',
  'src/orchestration/anchoredProviderSmokeGate.test.ts',
  'src/orchestration/proposalQualityCorpus.test.ts',
  'src/orchestration/proposalQualityReport.test.ts',
  'src/orchestration/providerSmokeResult.test.ts',
  'src/orchestration/anchoredProviderSmoke.test.ts',
  'src/orchestration/realProviderProposalDryRun.test.ts',
  'src/orchestration/providerPromptAudit.test.ts',
  'src/orchestration/providerOutputValidator.test.ts',
  'src/orchestration/providerAnchorQuality.test.ts',
  'src/orchestration/providerAnchorCandidate.test.ts',
  'src/orchestration/providerProposalAnchors.test.ts',
  'src/orchestration/providerAnchorMatcher.test.ts',
  'src/orchestration/providerAnchorConflict.test.ts',
  'src/orchestration/providerAnchoredProposal.test.ts',
  'src/orchestration/providerAnchoringResult.test.ts',
  'src/orchestration/anchoredProposalRuntime.test.ts',
  'src/orchestration/anchoredProposalEval.test.ts',
  'src/orchestration/anchoredProposalScorecard.test.ts',
  'src/orchestration/harnessTrace.test.ts',
  'src/orchestration/harnessScorecard.test.ts',
  'src/orchestration/harnessFailureTaxonomy.test.ts',
  'src/session/sessionResultParity.test.ts',
  'src/session/continuationEvidenceParity.test.ts',
]

const realHomePathPattern =
  /(?:\/[^\s"'`<>]*\.private-agents-real|[A-Za-z]:[\\/]+Test[\\/]+home-sf)(?:[\\/][^\s"'`<>]*)?/gi
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi

console.log('gate name=live-real-provider-anchored-smoke')
console.log('mode=route199-openai-compatible-anchored-provider-smoke')
console.log('route=route199-openai-compatible-anchored-provider-smoke')
console.log('status taxonomy: pass=0 product-regression=1 provider-network=2 config-or-skip=3')
console.log('marker live-smoke-default-no-provider-call')
console.log('marker live-smoke-no-opt-in-safe-skip')
console.log('marker live-smoke-provider-not-configured-safe-skip')
console.log('marker live-smoke-provider-unavailable-safe-skip')
console.log('marker live-smoke-openai-compatible-adapter-approval')
console.log('marker live-smoke-openai-compatible-provider-boundary')
console.log('marker live-smoke-fake-ready-provider-called')
console.log('marker live-smoke-calibration-substrate')
console.log('marker live-smoke-result-provider-called-no-write')
console.log('marker live-smoke-harness-scorecard')
console.log('marker live-smoke-session-continue')
console.log('marker live-smoke-no-apply')
console.log('marker live-smoke-raw-output-excluded')
console.log('marker live-smoke-failure-taxonomy')

const liveOptIn = process.env.PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE?.trim() === '1'
const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === '1'
const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim()
const fakeReady = realProviderHome === fakeReadyHome
const approvedRealProviderHomeSelected = realProviderHome === approvedRealProviderHome
const effectiveRealProviderSmokeOptIn = realProviderSmokeOptIn || (liveOptIn && approvedRealProviderHomeSelected)

console.log(`live-smoke-opt-in=${liveOptIn ? 'true' : 'false'}`)
console.log(`real-provider-smoke-opt-in=${effectiveRealProviderSmokeOptIn ? 'true' : 'false'}`)
console.log('private-config-manual-read=false')

let liveExitCode = 0
if (!liveOptIn) {
  printScriptSkip({
    name: 'live-anchored-provider-smoke-opt-in',
    skipReason: 'no-opt-in',
    providerKind: 'unknown',
    providerSafeLabel: 'not-ready',
    detail: 'Set PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 to request the optional live provider smoke.',
  })
} else if (!effectiveRealProviderSmokeOptIn && !fakeReady) {
  printScriptSkip({
    name: 'live-anchored-provider-smoke-real-provider-opt-in',
    skipReason: 'real-provider-smoke-not-enabled',
    providerKind: 'unknown',
    providerSafeLabel: 'not-ready',
    detail: 'Set PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 to allow the approved real-provider boundary.',
  })
} else if (fakeReady) {
  liveExitCode = runAnchoredSmokeRunner({
    ...sanitizedProviderEnv(process.env),
    PRIVATE_AGENTS_ANCHORED_SMOKE_FAKE_READY: '1',
    PRIVATE_AGENTS_REAL_PROVIDER: 'openai-compatible',
    PRIVATE_AGENTS_ANCHORED_SMOKE_PROVIDER_SAFE_LABEL: 'fake-ready-openai-compatible',
    PRIVATE_AGENTS_ANCHORED_SMOKE_CONFIG_SOURCE: 'fake-ready',
  })
} else {
  const providerEnvProcess = effectiveRealProviderSmokeOptIn
    ? { ...process.env, PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '1' }
    : process.env
  const effective = buildEffectiveProviderEnv(providerEnvProcess)
  console.log(`configSource=${effective.configSource}`)
  if (effective.providerEnvError) {
    printScriptSkip({
      name: 'live-anchored-provider-smoke-provider-env',
      skipReason: 'provider-not-configured',
      providerKind: 'unknown',
      providerSafeLabel: 'not-ready',
      detail: effective.providerEnvError.reason,
    })
  } else {
    const canonical = canonicalProviderEnv(effective.env)
    liveExitCode = runAnchoredSmokeRunner({
      ...sanitizedProviderEnv(process.env),
      ...canonical.env,
      ...(canonical.fallback?.env ?? {}),
      PRIVATE_AGENTS_ANCHORED_SMOKE_CONFIG_SOURCE: effective.configSource,
      PRIVATE_AGENTS_ANCHORED_SMOKE_PROVIDER_SAFE_LABEL: canonical.providerSafeLabel,
      ...(canonical.fallback
        ? {
            PRIVATE_AGENTS_ANCHORED_SMOKE_FALLBACK_CONFIG_SOURCE: effective.configSource,
            PRIVATE_AGENTS_ANCHORED_SMOKE_FALLBACK_PROVIDER_SAFE_LABEL: canonical.fallback.providerSafeLabel,
          }
        : {}),
    })
  }
}

const testExitCode = runFocusedTests()
if (liveExitCode !== 0) process.exit(liveExitCode)
process.exit(testExitCode)

function printScriptSkip(input) {
  console.log(`[skip] ${input.name}`)
  console.log(`skip-reason=${input.skipReason}`)
  console.log(`provider-kind=${input.providerKind}`)
  console.log(`provider-safe-label=${input.providerSafeLabel}`)
  console.log('adapter-approved=false')
  console.log('provider-called=false')
  console.log('provider-error-class=none')
  console.log('output-validation=none')
  console.log('anchor-quality=none')
  console.log('no-write=true')
  console.log('redaction-status=raw-content-excluded')
  console.log('mutation-authority=not-granted')
  console.log('raw-provider-output=excluded')
  if (input.detail) console.log(redact(input.detail))
}

function runAnchoredSmokeRunner(env) {
  const runnerBundle = buildAnchoredSmokeRunnerBundle(env)
  const outputDir = path.dirname(runnerBundle)
  const stdoutPath = path.join(outputDir, 'anchoredSmokeRunner.stdout.log')
  const stderrPath = path.join(outputDir, 'anchoredSmokeRunner.stderr.log')
  const stdoutFd = fs.openSync(stdoutPath, 'w')
  const stderrFd = fs.openSync(stderrPath, 'w')
  const result = spawnSync(process.execPath, [runnerBundle], {
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

function buildAnchoredSmokeRunnerBundle(env) {
  const esbuild = require('esbuild')
  const testRoot = env.PRIVATE_AGENTS_TEST_ROOT?.trim() || '/tmp/private-agents-test'
  const bundleDir = path.join(testRoot, 'live-real-provider-anchored-smoke', 'runner')
  fs.mkdirSync(bundleDir, { recursive: true })
  const outfile = path.join(bundleDir, 'anchoredSmokeRunner.cjs')
  esbuild.buildSync({
    entryPoints: [anchoredSmokeRunnerPath],
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
  testEnv.PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE = ''

  const result = spawnSync(
    'npm',
    ['run', 'test', '-w', 'packages/ts-shell', '--', ...focusedTests],
    {
      stdio: 'inherit',
      env: testEnv,
    },
  )

  if (result.status !== 0) {
    console.log(`[product-regression] live-anchored-provider-smoke - focused tests exited ${result.status}`)
    return result.status ?? 1
  }

  console.log('[pass] live-anchored-provider-smoke - focused module tests passed')
  return 0
}

function redact(input) {
  return String(input ?? '')
    .replace(
      authorizationBearerPattern,
      (_match, prefix, quote) => `${prefix}${quote}Bearer [REDACTED]`,
    )
    .replace(bearerTokenPattern, 'Bearer [REDACTED]')
    .replace(
      keyValueSecretPattern,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    )
    .replace(openAiStyleKeyPattern, '[REDACTED_API_KEY]')
    .replace(secretQueryParamPattern, '$1[REDACTED]')
    .replace(realHomePathPattern, '[REAL_PROVIDER_HOME]')
}
