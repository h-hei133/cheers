export function createVerifierReportModule({
  reportPath,
  writeReport,
  failureCategories,
  futureGateCandidates,
  candidateMutationSuiteRealCaseIds,
  buildCandidateMetadata,
  summarizeFailureStatus,
  classifyProviderReadinessFailure,
  categorizeFailure,
  redactProviderOutput,
} = {}) {
  return {
    writeConfigFailureReport({
      executionTier,
      failureReason,
      selectedMetadata,
      skippedCases,
    }) {
      const report = {
        generatedAt: new Date().toISOString(),
        status: 'CONFIG',
        statusDetail: 'config-failure',
        tier: executionTier,
        reportPath,
        failureCategory: 'provider-readiness',
        failureReason,
        failureCategories,
        futureGateCandidates,
        selectedCases: selectedMetadata,
        skippedCases,
        candidates: [],
        capabilities: [],
      }
      writeReport(report)
      return report
    },

    writeProviderPreflightFailureReport({
      executionTier,
      providerPreflight,
      selectedMetadata,
      skippedCases,
    }) {
      const report = {
        generatedAt: new Date().toISOString(),
        status: 'FAIL',
        statusDetail: providerPreflight.status,
        tier: executionTier,
        reportPath,
        failureCategory: 'provider-readiness',
        failureReason:
          providerPreflight.status === 'provider-network-inconclusive'
            ? 'provider-network-inconclusive: provider endpoint remained unreachable after readiness retry'
            : providerPreflight.status,
        providerReadiness: providerPreflight,
        capabilitySkipped: true,
        codingCapabilityNotEvaluated: true,
        failureCategories,
        futureGateCandidates,
        selectedCases: selectedMetadata,
        skippedCases,
        capabilities: [],
        candidates: [],
      }
      writeReport(report)
      return report
    },

    writeFinalReport({
      ok,
      executionTier,
      selectedSuiteId,
      includeRealProviderSuiteCases,
      providerPreflight,
      selectedScenarios,
      selectedMetadata,
      skippedCases,
      results,
    }) {
      const summarizedFailure = summarizeFailureStatus(results, {
        classifyProviderReadinessFailure,
      })
      const capabilities = results.filter((result) => result.tier === 'mvp')
      const candidates = results.filter((result) => result.tier === 'candidate')
      const report = {
        generatedAt: new Date().toISOString(),
        status: ok ? 'PASS' : 'FAIL',
        statusDetail: summarizedFailure.statusDetail,
        tier: executionTier,
        ...(selectedSuiteId ? {
          suite: selectedSuiteId,
          suiteIncludeReal: includeRealProviderSuiteCases,
          suiteSkippedRealProviderCases: includeRealProviderSuiteCases ? [] : candidateMutationSuiteRealCaseIds,
          realProviderTouched: results.some((result) => result.realProviderExecution),
          defaultMvpAffected: false,
        } : {}),
        reportPath,
        providerReadiness: providerPreflight ?? { status: 'skipped', reason: 'selected tier has no real-provider cases' },
        capabilitySkipped: selectedScenarios.length === 0,
        codingCapabilityNotEvaluated: selectedScenarios.length === 0,
        failureCategories,
        futureGateCandidates: buildCandidateMetadata(candidates),
        selectedCases: selectedMetadata,
        skippedCases,
        capabilities,
        candidates,
        results,
      }
      writeReport(report)
      return { report, summarizedFailure }
    },

    writeUnhandledFailureReport(error) {
      const rawFailure = error instanceof Error ? error.stack ?? error.message : String(error)
      const redactedFailure = redactProviderOutput(rawFailure)
      const report = {
        generatedAt: new Date().toISOString(),
        status: 'FAIL',
        reportPath,
        failureCategory: categorizeFailure(redactedFailure),
        failureReason: redactedFailure,
        failureCategories,
        futureGateCandidates,
        candidates: [],
        capabilities: [],
      }
      writeReport(report)
      return { report, redactedFailure }
    },
  }
}
