export const verifierTierValues = ['mvp', 'candidate', 'release', 'backlog', 'all']
export const verifierSuiteValues = ['candidate-mutation']
export const candidateMutationSuiteId = 'candidate-mutation'

export const verifierBooleanFlagNames = [
  'include-candidates',
  'include-real',
  'include-continue-smoke',
  'list',
  'dry-run',
  'help',
  'turn-boundary-dry-run',
  'terminal-result-surface-dry-run',
  'tool-execution-planning-dry-run',
  'failure-followup-context-dry-run',
  'real-readonly-coding-dry-run',
  'real-readonly-coding-preflight',
  'real-readonly-coding-preflight-self-test',
  'real-readonly-coding-failure-attribution-self-test',
  'real-readonly-coding-smoke',
  'real-coding-flow-dry-run',
  'real-coding-flow-smoke',
  'real-coding-flow-failure-attribution-self-test',
  'real-coding-flow-followup-context-self-test',
  'real-coding-flow-followup-smoke-dry-run',
  'real-coding-flow-followup-smoke',
  'real-coding-flow-diagnostics-self-test',
  'real-coding-flow-audit-isolation-self-test',
  'real-apply-patch-dry-run-smoke-dry-run',
  'real-apply-patch-dry-run-smoke',
  'real-apply-patch-permission-ux-smoke',
  'real-apply-patch-write-fixture-smoke',
  'real-apply-patch-runtime-no-write-smoke',
  'real-apply-patch-guarded-write-smoke',
  'real-apply-patch-guarded-route-smoke',
  'real-apply-patch-workspace-write-smoke',
  'candidate-mutation-failure-taxonomy-self-test',
  'route03-two-file-cli-path-evidence',
  'two-file-cli-path-evidence',
  'route08-unsupported-patch-e2e',
]

export function parseVerifierOptions(argv = process.argv, {
  tierValues = verifierTierValues,
  suiteValues = verifierSuiteValues,
  onInvalid = (message) => {
    console.error(message)
    process.exit(3)
  },
} = {}) {
  const flags = new Set(argv)
  const selectedTier = parseTierArg(argv, { tierValues, onInvalid })
  const selectedCaseId = parseCaseArg(argv)
  const selectedSuiteId = parseSuiteArg(argv, { suiteValues, onInvalid })
  return {
    tierValues,
    suiteValues,
    candidateMutationSuiteId,
    selectedTier,
    selectedCaseId,
    selectedSuiteId,
    includeCandidates: flags.has('--include-candidates'),
    includeRealProviderSuiteCases: flags.has('--include-real'),
    includeContinueSmoke: flags.has('--include-continue-smoke'),
    listCases: flags.has('--list'),
    dryRun: flags.has('--dry-run'),
    showHelp: flags.has('--help') || flags.has('-h'),
    turnBoundaryDryRun: flags.has('--turn-boundary-dry-run'),
    terminalResultSurfaceDryRun: flags.has('--terminal-result-surface-dry-run'),
    toolExecutionPlanningDryRun: flags.has('--tool-execution-planning-dry-run'),
    failureFollowupContextDryRun: flags.has('--failure-followup-context-dry-run'),
    realReadonlyCodingDryRun: flags.has('--real-readonly-coding-dry-run'),
    realReadonlyCodingPreflight: flags.has('--real-readonly-coding-preflight'),
    realReadonlyCodingPreflightSelfTest: flags.has('--real-readonly-coding-preflight-self-test'),
    realReadonlyCodingFailureAttributionSelfTest: flags.has('--real-readonly-coding-failure-attribution-self-test'),
    realReadonlyCodingSmoke: flags.has('--real-readonly-coding-smoke'),
    realCodingFlowDryRun: flags.has('--real-coding-flow-dry-run'),
    realCodingFlowSmoke: flags.has('--real-coding-flow-smoke'),
    realCodingFlowFailureAttributionSelfTest: flags.has('--real-coding-flow-failure-attribution-self-test'),
    realCodingFlowFollowupContextSelfTest: flags.has('--real-coding-flow-followup-context-self-test'),
    realCodingFlowFollowupSmokeDryRun: flags.has('--real-coding-flow-followup-smoke-dry-run'),
    realCodingFlowFollowupSmoke: flags.has('--real-coding-flow-followup-smoke'),
    realCodingFlowDiagnosticsSelfTest: flags.has('--real-coding-flow-diagnostics-self-test'),
    realCodingFlowAuditIsolationSelfTest: flags.has('--real-coding-flow-audit-isolation-self-test'),
    realApplyPatchDryRunSmokeDryRun: flags.has('--real-apply-patch-dry-run-smoke-dry-run'),
    realApplyPatchDryRunSmoke: flags.has('--real-apply-patch-dry-run-smoke'),
    realApplyPatchPermissionUxSmoke: flags.has('--real-apply-patch-permission-ux-smoke'),
    realApplyPatchWriteFixtureSmoke: flags.has('--real-apply-patch-write-fixture-smoke'),
    realApplyPatchRuntimeNoWriteSmoke: flags.has('--real-apply-patch-runtime-no-write-smoke'),
    realApplyPatchGuardedWriteSmoke: flags.has('--real-apply-patch-guarded-write-smoke'),
    realApplyPatchGuardedRouteSmoke: flags.has('--real-apply-patch-guarded-route-smoke'),
    realApplyPatchWorkspaceWriteSmoke: flags.has('--real-apply-patch-workspace-write-smoke'),
    candidateMutationFailureTaxonomySelfTest: flags.has('--candidate-mutation-failure-taxonomy-self-test'),
    route03TwoFileCliPathEvidence:
      flags.has('--route03-two-file-cli-path-evidence') ||
      flags.has('--two-file-cli-path-evidence'),
    route08UnsupportedPatchE2e: flags.has('--route08-unsupported-patch-e2e'),
  }
}

function parseTierArg(argv, { tierValues, onInvalid }) {
  const explicitEquals = argv.find((arg) => arg.startsWith('--tier='))
  const raw = explicitEquals
    ? explicitEquals.slice('--tier='.length)
    : argv.includes('--tier')
      ? argv[argv.indexOf('--tier') + 1]
      : undefined
  const normalized = raw?.trim().toLowerCase() || 'mvp'
  if (!tierValues.includes(normalized)) {
    onInvalid(`Invalid --tier value: ${raw}. Use ${tierValues.join('|')}.`)
  }
  return normalized
}

function parseCaseArg(argv) {
  const explicitEquals = argv.find((arg) => arg.startsWith('--case='))
  const raw = explicitEquals
    ? explicitEquals.slice('--case='.length)
    : argv.includes('--case')
      ? argv[argv.indexOf('--case') + 1]
      : undefined
  const normalized = raw?.trim()
  return normalized || undefined
}

function parseSuiteArg(argv, { suiteValues, onInvalid }) {
  const explicitEquals = argv.find((arg) => arg.startsWith('--suite='))
  const raw = explicitEquals
    ? explicitEquals.slice('--suite='.length)
    : argv.includes('--suite')
      ? argv[argv.indexOf('--suite') + 1]
      : undefined
  const normalized = raw?.trim().toLowerCase()
  if (!normalized) return undefined
  if (!suiteValues.includes(normalized)) {
    onInvalid(`Invalid --suite value: ${raw}. Use ${suiteValues.join('|')}.`)
  }
  return normalized
}
