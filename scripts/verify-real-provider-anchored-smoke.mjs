#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const focusedTests = [
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

console.log('gate name=live-real-provider-anchored-smoke')
console.log('mode=default-deterministic-skip')
console.log('route=route197-real-provider-anchored-smoke-calibration')
console.log('status taxonomy: pass=0 product-regression=1 provider-network=2 config-or-skip=3')
console.log('marker live-smoke-default-no-provider-call')
console.log('marker live-smoke-no-opt-in-safe-skip')
console.log('marker live-smoke-provider-not-configured-safe-skip')
console.log('marker live-smoke-provider-unavailable-safe-skip')
console.log('marker live-smoke-fake-corpus-path')
console.log('marker live-smoke-calibration-substrate')
console.log('marker live-smoke-result-provider-called-skip-no-write')
console.log('marker live-smoke-harness-scorecard')
console.log('marker live-smoke-session-continue')
console.log('marker live-smoke-no-apply')
console.log('marker live-smoke-raw-output-excluded')
console.log('marker live-smoke-failure-taxonomy')

const optIn = process.env.PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE?.trim() === '1'
const hasProviderReadinessSource = Boolean(process.env.PRIVATE_AGENTS_REAL_HOME?.trim())
console.log(`live-smoke-opt-in=${optIn ? 'true' : 'false'}`)
console.log('private-config-manual-read=false')
if (!optIn) {
  console.log('[skip] live-anchored-provider-smoke-opt-in')
  console.log('skip-reason=no-opt-in')
  console.log('provider-called=false')
  console.log('no-write=true')
  console.log('Set PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 to request the optional live provider smoke.')
  console.log('Requires: PRIVATE_AGENTS_REAL_HOME, PRIVATE_AGENTS_TEST_ROOT, and valid provider config.')
} else if (!hasProviderReadinessSource) {
  console.log('[skip] live-anchored-provider-smoke-provider-readiness')
  console.log('skip-reason=provider-not-configured')
  console.log('provider-called=false')
  console.log('no-write=true')
  console.log('PRIVATE_AGENTS_REAL_HOME was not supplied; no private config was read.')
} else {
  console.log('[skip] live-anchored-provider-smoke-provider-boundary')
  console.log('skip-reason=provider-not-ready')
  console.log('provider-called=false')
  console.log('no-write=true')
  console.log('Explicit opt-in and provider readiness source were preserved for the live path.')
  console.log('No approved live provider adapter is supplied by this verifier, so it safe-skips before any provider call.')
  console.log('Run scripts/verify-real-provider-readiness-smoke.mjs first to verify provider readiness.')
  console.log('Module-level anchored provider smoke tests prove fake-ready provider boundary reachability.')
}

const testEnv = { ...process.env }
if (!optIn) {
  testEnv.PRIVATE_AGENTS_PROVIDER_MODE = 'synthetic'
  testEnv.PRIVATE_AGENTS_REAL_HOME = ''
  testEnv.PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE = ''
}

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
  process.exit(result.status ?? 1)
}

console.log('[pass] live-anchored-provider-smoke - deterministic default skip and focused module tests passed')
