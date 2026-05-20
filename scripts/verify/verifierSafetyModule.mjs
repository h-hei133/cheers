export function validateVerifierSelectionSafety({
  selectedCaseId,
  selectedSuiteId,
  includeRealProviderSuiteCases,
  candidateMutationSuiteId,
  onInvalid = (message) => {
    console.error(message)
    process.exit(3)
  },
} = {}) {
  if (selectedCaseId && selectedSuiteId) {
    onInvalid('Invalid selection: use either --case=<id> or --suite=<name>, not both.')
  }
  if (includeRealProviderSuiteCases && selectedSuiteId !== candidateMutationSuiteId) {
    onInvalid('Invalid selection: --include-real is only supported with --suite=candidate-mutation.')
  }
  return {
    realProviderSuiteOptIn:
      Boolean(includeRealProviderSuiteCases) && selectedSuiteId === candidateMutationSuiteId,
    externalMcpExecution: false,
  }
}

export function projectDryRunSafetyFacts({
  selectedSuiteId,
  includeRealProviderSuiteCases,
  candidateMutationSuiteRealCaseIds = [],
} = {}) {
  return {
    realProviderExecutionSkipped: true,
    realProviderTouched: false,
    suiteExecutedCases: selectedSuiteId ? 0 : undefined,
    suiteSkippedRealProviderCases: selectedSuiteId
      ? includeRealProviderSuiteCases
        ? 0
        : candidateMutationSuiteRealCaseIds.length
      : undefined,
  }
}
