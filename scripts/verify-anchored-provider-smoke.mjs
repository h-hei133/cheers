#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// Paths retargeted after the orchestration domain was dissolved: the provider
// anchoring tests moved to provider/proposal/, the harness tests to
// evidence/harness/. Ten further entries were dropped because the tests
// themselves were deleted with the dormant patch-transaction cluster
// (7a59ab23) and no longer exist anywhere in the tree.
const focusedTests = [
  'src/provider/proposal/providerOutputValidator.test.ts',
  'src/provider/proposal/providerAnchorQuality.test.ts',
  'src/provider/proposal/providerAnchorCandidate.test.ts',
  'src/provider/proposal/providerProposalAnchors.test.ts',
  'src/provider/proposal/providerAnchorMatcher.test.ts',
  'src/provider/proposal/providerAnchorConflict.test.ts',
  'src/provider/proposal/providerAnchoredProposal.test.ts',
  'src/provider/proposal/providerAnchoringResult.test.ts',
  'src/evidence/harness/harnessTrace.test.ts',
  'src/evidence/harness/harnessScorecard.test.ts',
  'src/evidence/harness/harnessFailureTaxonomy.test.ts',
  'src/session/sessionResultParity.test.ts',
  'src/session/continuationEvidenceParity.test.ts',
]

// A missing path must fail here rather than be absorbed by the run below. The
// focused tests go to vitest in a single invocation, and vitest exits 0 when
// any one of several filters matches, so a path that no longer exists would
// otherwise be silently dropped from coverage while the gate still reports
// pass. Checked against the package root the test run uses.
const packageRoot = new URL('../packages/ts-shell/', import.meta.url)
const absent = focusedTests.filter(
  (relative) => !existsSync(new URL(relative, packageRoot)),
)
if (absent.length > 0) {
  for (const relative of absent) {
    console.log(`[config-failure] anchored-provider-smoke-missing-test - ${relative}`)
  }
  process.exit(3)
}


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
