import fs from 'node:fs'
import path from 'node:path'

export function createReportWriter(reportPath) {
  return function writeReport(report) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
}

export function buildCapabilityLifecycleReport({
  generatedAt = new Date().toISOString(),
  status,
  statusDetail,
  tier,
  reportPath,
  providerReadiness,
  failureCategory,
  failureReason,
  failureCategories,
  futureGateCandidates,
  selectedCases,
  skippedCases,
  capabilities = [],
  candidates = [],
  results,
  suite,
} = {}) {
  return {
    generatedAt,
    status,
    ...(statusDetail ? { statusDetail } : {}),
    ...(tier ? { tier } : {}),
    ...(suite ? { suite } : {}),
    reportPath,
    ...(providerReadiness ? { providerReadiness } : {}),
    ...(failureCategory ? { failureCategory } : {}),
    ...(failureReason ? { failureReason } : {}),
    ...(failureCategories ? { failureCategories } : {}),
    ...(futureGateCandidates ? { futureGateCandidates } : {}),
    ...(selectedCases ? { selectedCases } : {}),
    ...(skippedCases ? { skippedCases } : {}),
    capabilities,
    candidates,
    ...(results ? { results } : {}),
  }
}
