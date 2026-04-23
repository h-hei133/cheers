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
  const runId = argv[runIdIndex + 1]
  return { runId }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function main() {
  const { runId } = parseArgs(process.argv.slice(2))
  const dateStamp = runId.slice(0, 10)
  const prefix = `${dateStamp}-${runId}`

  const files = {
    summary: path.join(resultsDir, `${prefix}-summary.md`),
    evidence: path.join(resultsDir, `${prefix}-evidence-index.json`),
    sessionScan: path.join(resultsDir, `${prefix}-session-scan.json`),
    scenarioResults: path.join(resultsDir, `${prefix}-scenario-results.json`),
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
  const sessionScan = readJson(files.sessionScan)
  const scenarios = readJson(files.scenarioResults)
  const summaryText = fs.readFileSync(files.summary, 'utf8')

  if (evidence?.meta?.runId !== runId) failures.push('evidence-runid-mismatch')
  if (sessionScan?.runId !== runId) failures.push('session-scan-runid-mismatch')
  if (scenarios?.runId !== runId) failures.push('scenario-results-runid-mismatch')
  if (!summaryText.includes(`Run ID: ${runId}`)) failures.push('summary-runid-missing')

  const checks = ensureArray(evidence?.checks)
  const scenarioEntries = ensureArray(scenarios?.scenarios)
  if (checks.length !== scenarioEntries.length) failures.push('scenario-count-mismatch')

  for (const check of checks) {
    if (typeof check.contractId !== 'string' || check.contractId.length === 0) failures.push('check-missing-contractid')
    if (typeof check.passed !== 'boolean') failures.push(`check-invalid-passed:${check.contractId ?? 'unknown'}`)
    if (!Array.isArray(check.failureReasons)) failures.push(`check-invalid-failureReasons:${check.contractId ?? 'unknown'}`)
    if (!Array.isArray(check.logs)) failures.push(`check-invalid-logs:${check.contractId ?? 'unknown'}`)
    if (typeof check.tier !== 'string') failures.push(`check-invalid-tier:${check.contractId ?? 'unknown'}`)
    if (!['hard', 'observe'].includes(check.gateClass)) failures.push(`check-invalid-gateClass:${check.contractId ?? 'unknown'}`)
  }

  const output = {
    runId,
    passed: failures.length === 0,
    failures,
    files,
    checkCount: checks.length,
  }
  const outFile = path.join(resultsDir, `${prefix}-artifact-validation.json`)
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8')

  if (failures.length > 0) {
    console.error(`artifact-validation failed for ${runId}`)
    console.error(failures.join('\n'))
    process.exit(1)
  }

  console.log(`artifact-validation passed for ${runId}`)
  console.log(outFile)
}

main()
