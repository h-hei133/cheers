export function createVerifierCasePlan({
  caseRegistry,
  selectedTier,
  selectedCaseId,
  selectedSuiteId,
  includeCandidates,
  includeContinueSmoke,
  includeRealProviderSuiteCases,
  candidateMutationSuiteRealCaseIds,
} = {}) {
  const selectedCase = selectedCaseId ? caseRegistry.findCapabilityCaseById(selectedCaseId) : undefined
  const executionTier = selectedCase
    ? selectedCase.tier
    : selectedSuiteId
      ? 'candidate'
      : includeCandidates
        ? 'candidate'
        : includeContinueSmoke
          ? 'candidate'
          : selectedTier
  const selectedPlanCases = selectedSuiteId
    ? caseRegistry.selectedCasesForSuite(selectedSuiteId, { includeReal: includeRealProviderSuiteCases })
    : caseRegistry.selectedCasesForTier(executionTier)
  const selectedScenarios = selectedSuiteId
    ? selectedPlanCases.filter((scenario) => scenario.executable !== false)
    : caseRegistry.selectedExecutableScenariosForTier(executionTier)
  const skippedCases = selectedSuiteId
    ? caseRegistry.skippedCasesForSuite(selectedSuiteId, { includeReal: includeRealProviderSuiteCases })
    : caseRegistry.skippedCasesForTier(executionTier)
  const selectedMetadata = selectedPlanCases.map(caseRegistry.caseMetadata)
  const selectedRequiresRealProvider = selectedScenarios.some((scenario) => scenario.requiresRealProvider)
  const selectedSuiteRealCases = selectedSuiteId && includeRealProviderSuiteCases
    ? candidateMutationSuiteRealCaseIds.filter((caseId) =>
        selectedPlanCases.some((capabilityCase) => capabilityCase.id === caseId),
      )
    : []
  return {
    selectedCase,
    executionTier,
    selectedPlanCases,
    selectedScenarios,
    skippedCases,
    selectedMetadata,
    selectedRequiresRealProvider,
    selectedSuiteRealCases,
  }
}

export function printCasePlan(tier, selected, skipped, options = {}) {
  const caseMetadata = options.caseMetadata ?? ((capabilityCase) => capabilityCase)
  const candidateMutationSuiteId = options.candidateMutationSuiteId ?? 'candidate-mutation'
  const candidateMutationSuiteRealCaseIds = options.candidateMutationSuiteRealCaseIds ?? []
  if (options.suite) {
    console.log(`suite=${options.suite}`)
    console.log(`suiteIncludeReal=${options.includeReal ? 'true' : 'false'}`)
  }
  console.log(`tier=${tier}`)
  console.log(`mode=${options.dryRun ? 'dry-run' : options.list ? 'list' : 'execute'}`)
  console.log(`selectedCases=${selected.length}`)
  for (const capabilityCase of selected) {
    const metadata = caseMetadata(capabilityCase)
    const label = metadata.executable
      ? 'RUN'
      : options.suite === candidateMutationSuiteId &&
          options.includeReal &&
          candidateMutationSuiteRealCaseIds.includes(metadata.id)
        ? 'RUN-REAL'
        : 'META'
    console.log(
      `[${label}] ${metadata.id} tier=${metadata.tier} provider=${metadata.provider} expectedToPassCurrentMvp=${metadata.expectedToPassCurrentMvp} realProvider=${metadata.requiresRealProvider}`,
    )
    console.log(`      expectedCapability=${metadata.expectedCapability}`)
    console.log(`      currentSupportedCapability=${metadata.currentSupportedCapability}`)
    if (metadata.manualFlag) {
      console.log(`      manualFlag=${metadata.manualFlag}`)
    }
  }
  for (const skippedCase of skipped) {
    console.log(`[SKIP] ${skippedCase.id} reason=${skippedCase.skipReason}`)
  }
}

export function buildTierPlanReport(tier, selected, skipped, options = {}) {
  const caseMetadata = options.caseMetadata ?? ((capabilityCase) => capabilityCase)
  const allCapabilityCases = options.allCapabilityCases ?? (() => [...selected, ...skipped])
  return {
    tier,
    ...(options.suite ? {
      suite: options.suite,
      suiteIncludeReal: Boolean(options.includeReal),
    } : {}),
    mode: options.dryRun ? 'dry-run' : options.list ? 'list' : 'execute',
    selectedCases: selected.map(caseMetadata),
    skippedCases: skipped,
    allCases: allCapabilityCases().map(caseMetadata),
  }
}

