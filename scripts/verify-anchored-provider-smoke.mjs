#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const focusedTests = [
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

console.log('gate name=anchored-provider-smoke')
console.log('mode=deterministic-default')
console.log('status taxonomy: pass=0 product-regression=1 provider-network=2 config-or-skip=3')
console.log('marker anchored-provider-smoke-gate')
console.log('marker anchored-provider-smoke-default-no-provider-call')
console.log('marker anchored-provider-smoke-no-opt-in-safe-skip')
console.log('marker anchored-provider-smoke-provider-not-configured-safe-skip')
console.log('marker anchored-provider-smoke-fake-corpus')
console.log('marker proposal-quality-report-shared-fake-real-shape')
console.log('marker provider-smoke-result-no-write')
console.log('marker provider-smoke-harness-scorecard')
console.log('marker provider-smoke-session-continue')
console.log('marker provider-smoke-no-apply')
console.log('marker provider-smoke-raw-output-excluded')

if (process.env.PRIVATE_AGENTS_ANCHORED_PROVIDER_SMOKE !== '1') {
  console.log('[skip] anchored-real-provider-smoke-opt-in - set PRIVATE_AGENTS_ANCHORED_PROVIDER_SMOKE=1 to request the optional real-provider smoke')
} else {
  console.log('[skip] anchored-real-provider-smoke-provider - no approved real-provider adapter is supplied by this verifier; module gate coverage proves safe provider-unavailable skip')
}

const result = spawnSync(
  'npm',
  ['run', 'test', '-w', 'packages/ts-shell', '--', ...focusedTests],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
      PRIVATE_AGENTS_REAL_HOME: '',
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: '',
    },
  },
)

if (result.status !== 0) {
  console.log(`[product-regression] anchored-provider-smoke - focused tests exited ${result.status}`)
  process.exit(result.status ?? 1)
}

console.log('[pass] anchored-provider-smoke - deterministic fake corpus and safe-skip coverage passed')
