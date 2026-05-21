#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const focusedTests = [
  'src/orchestration/contextBudget.test.ts',
  'src/orchestration/contextDiscovery.test.ts',
  'src/orchestration/contextGraphDiscovery.test.ts',
  'src/orchestration/contextGraphScore.test.ts',
  'src/orchestration/contextGraphPlanning.test.ts',
  'src/orchestration/testImpactPlan.test.ts',
  'src/orchestration/contextGraphResult.test.ts',
  'src/orchestration/contextPacket.test.ts',
  'src/orchestration/contextPlan.test.ts',
  'src/orchestration/contextPacketResult.test.ts',
  'src/orchestration/agentPlan.test.ts',
  'src/orchestration/agentPlanContext.test.ts',
  'src/orchestration/agentPlanProjection.test.ts',
  'src/orchestration/agentPlanResult.test.ts',
  'src/orchestration/contextAwareProviderEdit.test.ts',
  'src/orchestration/contextAwareProviderPrompt.test.ts',
  'src/orchestration/contextAwareProviderProposal.test.ts',
  'src/orchestration/contextAwareProviderResult.test.ts',
  'src/orchestration/verificationCommandPlan.test.ts',
  'src/orchestration/verificationCommandRunner.test.ts',
  'src/orchestration/verificationCommandResult.test.ts',
  'src/orchestration/verificationFailureClassifier.test.ts',
  'src/orchestration/verificationRepairBridge.test.ts',
  'src/orchestration/verificationRepairContext.test.ts',
  'src/orchestration/verificationRepairPlanner.test.ts',
  'src/orchestration/verificationRepairResult.test.ts',
  'src/orchestration/verificationRepairLoop.test.ts',
  'src/orchestration/readInspectIntent.test.ts',
  'src/orchestration/targetResolution.test.ts',
  'src/session/continuationEvidenceParity.test.ts',
  'src/session/sessionResultParity.test.ts',
  'src/session/sessionCompactModule.test.ts',
  'src/session/stoppedSessionContinuity.test.ts',
  'src/session/sessionResumeContextBuilder.test.ts',
  'src/core/shell/sessionRuntimeBoundary.test.ts',
  'src/core/query/resultMapperBoundary.test.ts',
]

console.log('gate name=context-planning')
console.log('marker explicit-target-context-packet')
console.log('marker deterministic-import-sibling-test-docs-callsite')
console.log('marker context-graph-explicit-target')
console.log('marker context-graph-second-hop-candidates')
console.log('marker context-graph-budget-omission-reasons')
console.log('marker context-graph-score-readiness')
console.log('marker test-impact-suggested-tests')
console.log('marker test-impact-verification-candidates')
console.log('marker budget-redaction-no-write')
console.log('marker continuation-safe-summary')
console.log('marker context-packet-feeds-agent-plan')
console.log('marker context-packet-feeds-provider-proposal')
console.log('marker agent-plan-feeds-provider-proposal')
console.log('marker context-aware-provider-missing-context-stops-before-call')
console.log('marker context-aware-provider-prompt-redacted-budgeted')
console.log('marker context-aware-provider-session-continue-evidence')
console.log('marker verification-repair-context-packet-agent-plan-ids')
console.log('marker verification-command-plan-agent-plan-candidate')
console.log('marker verification-command-runtime-receipt-captured')
console.log('marker verification-command-failure-bridges-to-repair-loop')
console.log('marker verification-repair-context-aware-fake-provider-no-write')
console.log('marker verification-repair-session-continue-evidence')
console.log('marker broad-edit-needs-more-context')
console.log('marker agent-plan-result-surface')
console.log('marker session-result-parity')
console.log('marker approval-denied-compact-reason')
console.log('marker continuation-evidence-parity')

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

const runMvpSource = readFileSync(
  'packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts',
  'utf8',
)

if (!runMvpSource.includes('buildContextGraphPlanningBundle')) {
  console.log('[product-regression] context-planning - runMvp does not call context graph planning facade')
  process.exit(1)
}

if (
  runMvpSource.includes('function buildAgentPlan') ||
  runMvpSource.includes('function discoverContextGraph') ||
  runMvpSource.includes('projectContextPacketRuntimeOutcome')
) {
  console.log('[product-regression] context-planning - planning helpers are implemented inline or bypass facade')
  process.exit(1)
}

console.log('marker no-provider-call')
console.log('marker no-mutation-authority')
console.log('marker runmvp-planning-facade-coupling-guard')
console.log('[pass] context-planning')
