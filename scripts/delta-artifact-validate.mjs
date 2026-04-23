#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const testRoot = 'D:/Test'
const resultsDir = path.join(testRoot, 'test-results')

function parseArgs(argv) {
  const runIdIndex = argv.indexOf('--run-id')
  if (runIdIndex < 0 || !argv[runIdIndex + 1]) {
    throw new Error('Missing required argument: --run-id <value>')
  }
  return { runId: argv[runIdIndex + 1] }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function main() {
  const { runId } = parseArgs(process.argv.slice(2))
  const dateStamp = runId.slice(0, 10)
  const files = {
    summary: path.join(resultsDir, `${dateStamp}-${runId}-delta-summary.md`),
    evidence: path.join(resultsDir, `${dateStamp}-${runId}-delta-evidence.json`),
    trace: path.join(resultsDir, `${dateStamp}-${runId}-delta-trace-matrix.json`),
    fault: path.join(resultsDir, `${dateStamp}-${runId}-delta-fault-report.json`),
    session: path.join(resultsDir, `${dateStamp}-${runId}-session-scan.json`),
  }

  const failures = []
  for (const [name, file] of Object.entries(files)) {
    if (!fs.existsSync(file)) failures.push(`missing-file:${name}`)
  }
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
  }

  const evidence = readJson(files.evidence)
  const trace = readJson(files.trace)
  const fault = readJson(files.fault)
  const session = readJson(files.session)
  const summary = fs.readFileSync(files.summary, 'utf8')

  if (evidence?.meta?.runId !== runId) failures.push('evidence-runid-mismatch')
  if (trace?.runId !== runId) failures.push('trace-runid-mismatch')
  if (fault?.runId !== runId) failures.push('fault-runid-mismatch')
  if (session?.runId !== runId) failures.push('session-runid-mismatch')
  if (!summary.includes(`Run ID: ${runId}`)) failures.push('summary-runid-missing')

  const suites = Array.isArray(evidence?.suites) ? evidence.suites : []
  for (const suite of suites) {
    if (typeof suite.suiteId !== 'string' || !suite.suiteId) failures.push('suite-missing-suiteId')
    if (!['N1', 'N2', 'N3', 'N4', 'N5'].includes(suite.layer)) failures.push(`suite-invalid-layer:${suite.suiteId ?? 'unknown'}`)
    if (!['hard', 'observe'].includes(suite.gateClass)) failures.push(`suite-invalid-gateClass:${suite.suiteId ?? 'unknown'}`)
    if (typeof suite.passed !== 'boolean') failures.push(`suite-invalid-passed:${suite.suiteId ?? 'unknown'}`)
    if (!Array.isArray(suite.failureReasons)) failures.push(`suite-invalid-failureReasons:${suite.suiteId ?? 'unknown'}`)
    if (!Array.isArray(suite.artifacts)) failures.push(`suite-invalid-artifacts:${suite.suiteId ?? 'unknown'}`)
    if (typeof suite.durationMs !== 'number' || suite.durationMs < 0) failures.push(`suite-invalid-duration:${suite.suiteId ?? 'unknown'}`)
  }

  const historical = session?.historical
  const debtSummary = historical?.debtSummary
  if (!historical || !Array.isArray(historical.mismatches)) {
    failures.push('session-historical-mismatches-missing')
  }
  if (!debtSummary || typeof debtSummary !== 'object') {
    failures.push('session-historical-debt-summary-missing')
  } else {
    if (!isNonNegativeNumber(debtSummary.total)) failures.push('session-debt-total-invalid')
    if (!isNonNegativeNumber(debtSummary.legacyOnlyCount)) failures.push('session-debt-legacyOnly-invalid')
    if (!isNonNegativeNumber(debtSummary.activeRiskCount)) failures.push('session-debt-activeRisk-invalid')
    if (!Array.isArray(debtSummary.buckets)) failures.push('session-debt-buckets-invalid')
    if (!Array.isArray(debtSummary.quarantineEligibleBuckets)) failures.push('session-debt-quarantine-list-invalid')
    if (!Array.isArray(debtSummary.observeRiskBuckets)) failures.push('session-debt-observe-risk-list-invalid')

    if (Array.isArray(debtSummary.buckets)) {
      for (const bucket of debtSummary.buckets) {
        if (typeof bucket?.bucket !== 'string' || !bucket.bucket) failures.push('session-debt-bucket-name-missing')
        if (!['legacy-only', 'active-risk'].includes(bucket?.attribution)) failures.push(`session-debt-bucket-attribution-invalid:${bucket?.bucket ?? 'unknown'}`)
        if (typeof bucket?.reason !== 'string' || !bucket.reason) failures.push(`session-debt-bucket-reason-missing:${bucket?.bucket ?? 'unknown'}`)
        if (!['baseline-quarantine', 'observe-risk'].includes(bucket?.quarantineRecommendation)) {
          failures.push(`session-debt-bucket-quarantine-recommendation-invalid:${bucket?.bucket ?? 'unknown'}`)
        }
        if (!isNonNegativeNumber(bucket?.count)) failures.push(`session-debt-bucket-count-invalid:${bucket?.bucket ?? 'unknown'}`)
        if (!Array.isArray(bucket?.samples)) failures.push(`session-debt-bucket-samples-invalid:${bucket?.bucket ?? 'unknown'}`)
      }

      const bucketTotal = debtSummary.buckets.reduce((sum, bucket) => sum + (isNonNegativeNumber(bucket?.count) ? bucket.count : 0), 0)
      const bucketLegacy = debtSummary.buckets
        .filter((bucket) => bucket?.attribution === 'legacy-only')
        .reduce((sum, bucket) => sum + (isNonNegativeNumber(bucket?.count) ? bucket.count : 0), 0)
      const bucketActive = debtSummary.buckets
        .filter((bucket) => bucket?.attribution === 'active-risk')
        .reduce((sum, bucket) => sum + (isNonNegativeNumber(bucket?.count) ? bucket.count : 0), 0)
      if (isNonNegativeNumber(debtSummary.total) && bucketTotal !== debtSummary.total) {
        failures.push('session-debt-total-mismatch-buckets')
      }
      if (isNonNegativeNumber(debtSummary.legacyOnlyCount) && bucketLegacy !== debtSummary.legacyOnlyCount) {
        failures.push('session-debt-legacyOnly-mismatch-buckets')
      }
      if (isNonNegativeNumber(debtSummary.activeRiskCount) && bucketActive !== debtSummary.activeRiskCount) {
        failures.push('session-debt-activeRisk-mismatch-buckets')
      }
    }

    if (Array.isArray(historical?.mismatches) && isNonNegativeNumber(debtSummary.total) && historical.mismatches.length !== debtSummary.total) {
      failures.push('session-debt-total-mismatch-historical-mismatches')
    }
  }

  const report = {
    runId,
    passed: failures.length === 0,
    failures,
    files,
    suiteCount: suites.length,
  }
  const reportPath = path.join(resultsDir, `${dateStamp}-${runId}-delta-artifact-validation.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

  if (failures.length > 0) {
    console.error(`delta-artifact validation failed for ${runId}`)
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log(`delta-artifact validation passed for ${runId}`)
  console.log(reportPath)
}

main()
