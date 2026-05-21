#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const focusedTests = [
  'src/orchestration/contextBudget.test.ts',
  'src/orchestration/contextDiscovery.test.ts',
  'src/orchestration/contextPacket.test.ts',
  'src/orchestration/contextPlan.test.ts',
  'src/orchestration/contextPacketResult.test.ts',
  'src/orchestration/readInspectIntent.test.ts',
  'src/orchestration/targetResolution.test.ts',
  'src/session/stoppedSessionContinuity.test.ts',
  'src/session/sessionResumeContextBuilder.test.ts',
  'src/core/query/resultMapperBoundary.test.ts',
]

console.log('gate name=context-planning')
console.log('marker explicit-target-context-packet')
console.log('marker deterministic-import-sibling-test-docs-callsite')
console.log('marker budget-redaction-no-write')
console.log('marker continuation-safe-summary')

const result = spawnSync(
  'npm',
  ['run', 'test', '-w', 'packages/ts-shell', '--', ...focusedTests],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
  },
)

if (result.status !== 0) {
  console.log(
    `[product-regression] context-planning - focused tests exited ${result.status}`,
  )
  process.exit(result.status ?? 1)
}

const runMvpResult = spawnSync(
  'npm',
  [
    'run',
    'test',
    '-w',
    'packages/ts-shell',
    '--',
    'src/orchestration/runMvpIntegratedFlow.test.ts',
    '-t',
    'targeted context packet|broad edit prompts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
  },
)

if (runMvpResult.status !== 0) {
  console.log(
    `[product-regression] context-planning - runMvp context tests exited ${runMvpResult.status}`,
  )
  process.exit(runMvpResult.status ?? 1)
}

console.log('marker no-provider-call')
console.log('marker no-mutation-authority')
console.log('[pass] context-planning')
