import assert from 'node:assert/strict'
import { parseVerifierOptions } from './verifierCliModule.mjs'
import { createVerifierCasePlan, buildTierPlanReport } from './verifierCaseModule.mjs'
import { validateVerifierSelectionSafety, projectDryRunSafetyFacts } from './verifierSafetyModule.mjs'
import { createVerifierReportModule } from './verifierReportModule.mjs'

const cliOptions = parseVerifierOptions([
  'node',
  'scripts/verify-real-user-capabilities.mjs',
  '--suite=candidate-mutation',
  '--include-real',
  '--dry-run',
  '--two-file-cli-path-evidence',
])
assert.equal(cliOptions.selectedTier, 'mvp')
assert.equal(cliOptions.selectedSuiteId, 'candidate-mutation')
assert.equal(cliOptions.includeRealProviderSuiteCases, true)
assert.equal(cliOptions.dryRun, true)
assert.equal(cliOptions.route03TwoFileCliPathEvidence, true)

assert.throws(
  () =>
    parseVerifierOptions(['node', 'verify', '--tier=unknown'], {
      onInvalid(message) {
        throw new Error(message)
      },
    }),
  /Invalid --tier value: unknown/,
)

const cases = [
  { id: 'mvp-update', tier: 'mvp', provider: 'synthetic', executable: true },
  { id: 'candidate-real', tier: 'candidate', provider: 'real', executable: false, requiresRealProvider: true },
]
const fakeRegistry = {
  findCapabilityCaseById: (id) => cases.find((entry) => entry.id === id),
  selectedCasesForSuite: () => cases,
  selectedCasesForTier: (tier) => cases.filter((entry) => tier === 'all' || entry.tier === tier),
  selectedExecutableScenariosForTier: (tier) =>
    cases.filter((entry) => (tier === 'all' || entry.tier === tier) && entry.executable !== false),
  skippedCasesForSuite: () => [],
  skippedCasesForTier: (tier) => cases.filter((entry) => entry.tier !== tier),
  caseMetadata: (entry) => ({
    id: entry.id,
    tier: entry.tier,
    provider: entry.provider,
    executable: entry.executable !== false,
    requiresRealProvider: Boolean(entry.requiresRealProvider),
  }),
}

const plan = createVerifierCasePlan({
  caseRegistry: fakeRegistry,
  selectedTier: 'mvp',
  selectedSuiteId: 'candidate-mutation',
  includeRealProviderSuiteCases: true,
  candidateMutationSuiteRealCaseIds: ['candidate-real'],
})
assert.equal(plan.executionTier, 'candidate')
assert.deepEqual(plan.selectedSuiteRealCases, ['candidate-real'])
assert.deepEqual(plan.selectedMetadata.map((entry) => entry.id), ['mvp-update', 'candidate-real'])

const tierPlanReport = buildTierPlanReport('candidate', plan.selectedPlanCases, [], {
  suite: 'candidate-mutation',
  includeReal: true,
  caseMetadata: fakeRegistry.caseMetadata,
  allCapabilityCases: () => cases,
})
assert.equal(tierPlanReport.mode, 'execute')
assert.equal(tierPlanReport.suiteIncludeReal, true)
assert.deepEqual(tierPlanReport.allCases.map((entry) => entry.id), ['mvp-update', 'candidate-real'])

assert.throws(
  () =>
    validateVerifierSelectionSafety({
      selectedCaseId: 'a',
      selectedSuiteId: 'candidate-mutation',
      candidateMutationSuiteId: 'candidate-mutation',
      onInvalid(message) {
        throw new Error(message)
      },
    }),
  /use either --case=<id> or --suite=<name>/,
)
assert.deepEqual(
  projectDryRunSafetyFacts({
    selectedSuiteId: 'candidate-mutation',
    includeRealProviderSuiteCases: false,
    candidateMutationSuiteRealCaseIds: ['real-a', 'real-b'],
  }),
  {
    realProviderExecutionSkipped: true,
    realProviderTouched: false,
    suiteExecutedCases: 0,
    suiteSkippedRealProviderCases: 2,
  },
)

let writtenReport
const reportModule = createVerifierReportModule({
  reportPath: '/tmp/report.json',
  writeReport(report) {
    writtenReport = report
  },
  failureCategories: ['none'],
  futureGateCandidates: [{ id: 'future' }],
  candidateMutationSuiteRealCaseIds: ['candidate-real'],
  buildCandidateMetadata: (entries) => entries.map((entry) => ({ id: entry.capability })),
  summarizeFailureStatus: () => ({ statusDetail: 'passed', exitCode: 0 }),
  classifyProviderReadinessFailure: () => undefined,
  categorizeFailure: () => 'task-execution-failure',
  redactProviderOutput: (value) => value.replace(/sk-secret/g, '[REDACTED]'),
})
const { summarizedFailure } = reportModule.writeFinalReport({
  ok: true,
  executionTier: 'candidate',
  selectedSuiteId: 'candidate-mutation',
  includeRealProviderSuiteCases: false,
  providerPreflight: undefined,
  selectedScenarios: [],
  selectedMetadata: [],
  skippedCases: [],
  results: [],
})
assert.equal(summarizedFailure.exitCode, 0)
assert.equal(writtenReport.status, 'PASS')
assert.equal(writtenReport.suiteSkippedRealProviderCases[0], 'candidate-real')

const unhandled = reportModule.writeUnhandledFailureReport(new Error('bad sk-secret'))
assert.equal(unhandled.redactedFailure.includes('sk-secret'), false)
assert.equal(writtenReport.failureReason.includes('[REDACTED]'), true)

console.log('verifierModuleBoundary=pass')
