#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const focusedTests = [
  'src/orchestration/contextBudget.test.ts',
  'src/orchestration/contextDiscovery.test.ts',
  'src/orchestration/contextGraphDiscovery.test.ts',
  'src/orchestration/contextGraphScore.test.ts',
  'src/orchestration/contextGraphReadiness.test.ts',
  'src/orchestration/contextGraphPlanning.test.ts',
  'src/orchestration/taskContextNeed.test.ts',
  'src/orchestration/taskContextAcquisition.test.ts',
  'src/orchestration/taskContextSufficiency.test.ts',
  'src/orchestration/analysisBriefCalibration.test.ts',
  'src/orchestration/analysisQualityGate.test.ts',
  'src/orchestration/taskContextResult.test.ts',
  'src/orchestration/taskLifecycle.test.ts',
  'src/orchestration/taskLifecycleRouter.test.ts',
  'src/orchestration/taskLifecycleActivation.test.ts',
  'src/orchestration/taskLifecycleHandoff.test.ts',
  'src/orchestration/codeGraphFacts.test.ts',
  'src/orchestration/codeGraphTrace.test.ts',
  'src/orchestration/codeGraphQuery.test.ts',
  'src/orchestration/codeGraphStaleness.test.ts',
  'src/orchestration/codeGraphImpact.test.ts',
  'src/orchestration/codeGraphResult.test.ts',
  'src/orchestration/testImpactPlan.test.ts',
  'src/orchestration/contextGraphResult.test.ts',
  'src/orchestration/planQuality.test.ts',
  'src/orchestration/planQualityGate.test.ts',
  'src/orchestration/planQualityResult.test.ts',
  'src/orchestration/harnessTrace.test.ts',
  'src/orchestration/harnessScorecard.test.ts',
  'src/orchestration/harnessFailureTaxonomy.test.ts',
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
  'src/orchestration/realProviderProposalGate.test.ts',
  'src/orchestration/providerPromptAudit.test.ts',
  'src/orchestration/providerOutputValidator.test.ts',
  'src/orchestration/providerAnchorQuality.test.ts',
  'src/orchestration/providerAnchorCandidate.test.ts',
  'src/orchestration/providerProposalAnchors.test.ts',
  'src/orchestration/providerAnchorMatcher.test.ts',
  'src/orchestration/providerAnchorConflict.test.ts',
  'src/orchestration/providerAnchoredProposal.test.ts',
  'src/orchestration/providerAnchoringResult.test.ts',
  'src/orchestration/realProviderProposalDryRun.test.ts',
  'src/orchestration/providerDryRunResult.test.ts',
  'src/orchestration/anchoredProposalActivation.test.ts',
  'src/orchestration/anchoredProposalRuntime.test.ts',
  'src/orchestration/anchoredProposalEval.test.ts',
  'src/orchestration/anchoredProposalScorecard.test.ts',
  'src/orchestration/anchoredProviderSmokeGate.test.ts',
  'src/orchestration/proposalQualityCorpus.test.ts',
  'src/orchestration/proposalQualityReport.test.ts',
  'src/orchestration/providerSmokeResult.test.ts',
  'src/orchestration/anchoredProviderSmoke.test.ts',
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
console.log('marker code-graph-facts-normalized')
console.log('marker code-graph-trace-created')
console.log('marker code-graph-impact-query')
console.log('marker code-graph-staleness-downgrades-readiness')
console.log('marker code-graph-provider-impact-context')
console.log('marker code-graph-verification-candidates')
console.log('marker code-graph-session-continue-evidence')
console.log('marker task-lifecycle-read-analyze-plan-created')
console.log('marker task-lifecycle-runtime-router')
console.log('marker task-lifecycle-activation-real-prompt-path')
console.log('marker task-lifecycle-handoff-facade')
console.log('marker task-read-plan-uses-context-code-graph')
console.log('marker analysis-brief-evidence-grounded')
console.log('marker analysis-brief-blocks-provider-proposal')
console.log('marker task-execution-plan-review-gated')
console.log('marker task-lifecycle-agent-plan-plan-quality')
console.log('marker task-lifecycle-provider-verification-repair-handoff')
console.log('marker task-lifecycle-result-session-continue')
console.log('marker task-lifecycle-harness-trace-scorecard')
console.log('marker task-lifecycle-hidden-cot-excluded')
console.log('marker task-context-need-model')
console.log('marker task-context-acquisition-staged')
console.log('marker task-context-sufficiency-provider-block')
console.log('marker analysis-brief-calibration-confidence-risk')
console.log('marker analysis-quality-gate-blocks-provider')
console.log('marker task-context-result-no-write-surface')
console.log('marker bug-investigation-source-tests-callsite-context')
console.log('marker test-failure-verification-output-required')
console.log('marker refactor-planning-callsite-test-impact-context')
console.log('marker missing-required-context-stops-provider-proposal')
console.log('marker under-evidenced-analysis-stops-provider-proposal')
console.log('marker sufficient-analysis-allows-provider-readiness')
console.log('marker missing-test-impact-blocks-verification-readiness')
console.log('marker analysis-quality-id-agent-plan-plan-quality-session')
console.log('marker continue-preserves-missing-facts-suggested-reads')
console.log('marker harness-scorecard-analysis-confidence')
console.log('marker raw-content-hidden-reasoning-excluded')
console.log('marker test-impact-suggested-tests')
console.log('marker test-impact-verification-candidates')
console.log('marker plan-quality-ready-score')
console.log('marker plan-quality-needs-more-context')
console.log('marker plan-quality-budget-limited-provider-block')
console.log('marker plan-quality-test-impact-verification-block')
console.log('marker plan-quality-repair-runtime-receipt-block')
console.log('marker harness-trace-lifecycle-ids')
console.log('marker harness-scorecard-pass-warn-fail-skip')
console.log('marker harness-failure-taxonomy')
console.log('marker budget-redaction-no-write')
console.log('marker continuation-safe-summary')
console.log('marker context-packet-feeds-agent-plan')
console.log('marker context-packet-feeds-provider-proposal')
console.log('marker agent-plan-feeds-provider-proposal')
console.log('marker context-aware-provider-missing-context-stops-before-call')
console.log('marker context-aware-provider-prompt-redacted-budgeted')
console.log('marker context-aware-provider-session-continue-evidence')
console.log('marker real-provider-proposal-dry-run-gate')
console.log('marker provider-prompt-audit-redacted-budgeted')
console.log('marker provider-output-validator-anchor-classes')
console.log('marker provider-anchor-quality-no-write')
console.log('marker provider-anchor-candidates-extracted')
console.log('marker provider-anchor-matches-current-safe-read')
console.log('marker provider-anchor-conflict-detection')
console.log('marker provider-anchored-proposal-manifest')
console.log('marker provider-anchoring-result-session-continue')
console.log('marker provider-dry-run-result-session-continue')
console.log('marker provider-dry-run-harness-scorecard')
console.log('marker anchored-proposal-runtime-activation')
console.log('marker anchored-proposal-fake-provider-runtime')
console.log('marker anchored-proposal-eval-scorecard')
console.log('marker anchored-proposal-session-continue')
console.log('marker anchored-provider-smoke-gate')
console.log('marker anchored-provider-smoke-fake-corpus')
console.log('marker anchored-provider-smoke-default-no-provider-call')
console.log('marker proposal-quality-report-shared-fake-real-shape')
console.log('marker anchored-provider-smoke-session-continue')
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

if (!runMvpSource.includes('activateTaskLifecycle')) {
  console.log('[product-regression] context-planning - runMvp does not call task lifecycle activation facade')
  process.exit(1)
}

if (
  runMvpSource.includes('function buildAgentPlan') ||
  runMvpSource.includes('function discoverContextGraph') ||
  runMvpSource.includes('function buildPlanQuality') ||
  runMvpSource.includes('function queryCodeGraphTrace') ||
  runMvpSource.includes('function buildCodeGraphImpact') ||
  runMvpSource.includes('function buildHarnessTrace') ||
  runMvpSource.includes('function buildTaskLifecycle') ||
  runMvpSource.includes('function buildAnalysisBrief') ||
  runMvpSource.includes('function buildTaskContextNeeds') ||
  runMvpSource.includes('function evaluateTaskContextSufficiency') ||
  runMvpSource.includes('function calibrateAnalysisBrief') ||
  runMvpSource.includes('function evaluateAnalysisQualityGate') ||
  runMvpSource.includes('function buildTaskExecutionPlan') ||
  runMvpSource.includes('projectContextPacketRuntimeOutcome')
) {
  console.log('[product-regression] context-planning - planning helpers are implemented inline or bypass facade')
  process.exit(1)
}

console.log('marker no-provider-call')
console.log('marker no-mutation-authority')
console.log('marker runmvp-planning-facade-coupling-guard')
console.log('[pass] context-planning')
