#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const mainRepoRoot = 'D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents'
const testRoot = 'D:/Test'
const resultsDir = path.join(testRoot, 'test-results')
const now = new Date()
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const runId = `${dateStamp}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-${process.pid}`

function parseArgs(argv) {
  const durationIndex = argv.indexOf('--duration-minutes')
  const durationMinutes = durationIndex >= 0 ? Number.parseFloat(argv[durationIndex + 1] ?? '45') : 45
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Invalid --duration-minutes. Expected a positive number.')
  }
  return { durationMinutes }
}

function normalizePath(value) {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase()
}

function boundaryCheck() {
  const cwd = normalizePath(process.cwd())
  const repo = normalizePath(mainRepoRoot)
  const test = normalizePath(testRoot)
  const violations = []
  if (cwd !== repo) violations.push('cwd-not-main-repo')
  if (cwd.startsWith(`${test}/`) && cwd.includes('cheers')) violations.push('executing-from-d-test-repo-copy')
  return { cwd, repo, test, violations, passed: violations.length === 0 }
}

function runProcess(command, args, options = {}) {
  const envSource = options.env ?? process.env
  const sanitizedEnv = {}
  for (const [k, v] of Object.entries(envSource)) {
    if (typeof v === 'string') sanitizedEnv[k] = v
  }
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: sanitizedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeoutMs = options.timeoutMs ?? 900000
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
    })
  })
}

function extractRunId(output) {
  const m = output.match(/Run ID:\s*([^\s]+)/)
  return m?.[1] ?? null
}

function readDeltaEvidence(deltaRunId) {
  const date = deltaRunId.slice(0, 10)
  const file = path.join(resultsDir, `${date}-${deltaRunId}-delta-evidence.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function readSessionScan(deltaRunId) {
  const date = deltaRunId.slice(0, 10)
  const file = path.join(resultsDir, `${date}-${deltaRunId}-session-scan.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function getDebtSummary(session) {
  const debt = session?.historical?.debtSummary
  if (!debt || typeof debt !== 'object') return null
  return {
    total: typeof debt.total === 'number' ? debt.total : 0,
    legacyOnlyCount: typeof debt.legacyOnlyCount === 'number' ? debt.legacyOnlyCount : 0,
    activeRiskCount: typeof debt.activeRiskCount === 'number' ? debt.activeRiskCount : 0,
    buckets: Array.isArray(debt.buckets) ? debt.buckets : [],
    quarantineEligibleBuckets: Array.isArray(debt.quarantineEligibleBuckets) ? debt.quarantineEligibleBuckets : [],
    observeRiskBuckets: Array.isArray(debt.observeRiskBuckets) ? debt.observeRiskBuckets : [],
  }
}

function writeLog(name, content) {
  fs.mkdirSync(resultsDir, { recursive: true })
  const file = path.join(resultsDir, `${dateStamp}-${runId}-${name}.log`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function toRel(p) {
  return p.replaceAll('\\', '/')
}

async function runDeltaFull() {
  if (process.platform === 'win32') {
    return runProcess('cmd.exe', ['/d', '/s', '/c', 'npm run test:delta:full'], {
      cwd: mainRepoRoot,
      timeoutMs: 900000,
    })
  }
  return runProcess('npm', ['run', 'test:delta:full'], {
    cwd: mainRepoRoot,
    timeoutMs: 900000,
  })
}

async function runDeltaValidate(targetRunId) {
  return runProcess(process.execPath, [path.join(mainRepoRoot, 'scripts', 'delta-artifact-validate.mjs'), '--run-id', targetRunId], {
    cwd: mainRepoRoot,
    timeoutMs: 240000,
  })
}

async function main() {
  const { durationMinutes } = parseArgs(process.argv.slice(2))
  const boundary = boundaryCheck()
  if (!boundary.passed) {
    console.error(`environment-boundary-violation: ${boundary.violations.join(', ')}`)
    process.exit(1)
  }

  const soakStarted = Date.now()
  const soakDeadline = soakStarted + Math.round(durationMinutes * 60_000)
  const iterations = []
  const failures = []
  let iteration = 0

  while (Date.now() < soakDeadline) {
    iteration += 1
    const run = await runDeltaFull()
    const runLog = writeLog(`soak-iter-${iteration}`, run.output)
    const deltaRunId = extractRunId(run.output)

    let validate = null
    let validateLog = null
    let evidence = null
    let session = null
    if (deltaRunId) {
      validate = await runDeltaValidate(deltaRunId)
      validateLog = writeLog(`soak-iter-${iteration}-validate`, validate.output)
      evidence = readDeltaEvidence(deltaRunId)
      session = readSessionScan(deltaRunId)
    }

    const hardFailure =
      !evidence ||
      (Array.isArray(evidence.findings?.P1) && evidence.findings.P1.length > 0)
    const currentRunMismatch = (session?.currentRun?.mismatches?.length ?? 0) > 0
    const debtSummary = getDebtSummary(session)
    const activeRiskCount = debtSummary?.activeRiskCount ?? null
    const legacyOnlyCount = debtSummary?.legacyOnlyCount ?? null
    const activeRiskFailure = activeRiskCount === null || activeRiskCount > 0
    const hardGateStatus = hardFailure || currentRunMismatch ? 'fail' : 'pass'
    const activeRiskStatus = activeRiskFailure ? 'fail' : 'pass'
    const legacyDebtStatus =
      legacyOnlyCount === null
        ? 'unknown'
        : legacyOnlyCount > 0
          ? 'quarantined-legacy-debt'
          : 'none'
    const quarantineSummary = debtSummary
      ? {
          legacyOnlyCount: debtSummary.legacyOnlyCount,
          activeRiskCount: debtSummary.activeRiskCount,
          topBuckets: debtSummary.buckets
            .slice(0, 3)
            .map((bucket) => ({
              bucket: bucket.bucket,
              attribution: bucket.attribution,
              count: bucket.count,
              quarantineRecommendation: bucket.quarantineRecommendation,
            })),
        }
      : null
    const iterationPassed =
      run.code === 0 &&
      !!deltaRunId &&
      validate?.code === 0 &&
      hardGateStatus === 'pass' &&
      activeRiskStatus === 'pass'

    if (!iterationPassed) {
      failures.push(
        `iteration-${iteration}:runId=${deltaRunId ?? 'missing'} hardGate=${hardGateStatus} activeRisk=${activeRiskStatus}` +
        ` legacyDebt=${legacyDebtStatus} hardFailure=${hardFailure} mismatch=${currentRunMismatch} activeRiskCount=${activeRiskCount ?? 'unknown'}`,
      )
    }

    iterations.push({
      iteration,
      deltaRunId,
      runExit: run.code,
      validateExit: validate?.code ?? null,
      hardFailure,
      currentRunMismatch,
      hardGateStatus,
      activeRiskStatus,
      legacyDebtStatus,
      activeRiskCount,
      legacyOnlyCount,
      quarantineSummary,
      runLog: toRel(runLog),
      validateLog: validateLog ? toRel(validateLog) : null,
    })

    if (!iterationPassed) {
      break
    }
  }

  const soakDurationMs = Date.now() - soakStarted
  const report = {
    runId,
    date: dateStamp,
    targetDurationMinutes: durationMinutes,
    actualDurationMs: soakDurationMs,
    boundary,
    iterations,
    passed: failures.length === 0,
    failures,
  }
  const reportPath = path.join(resultsDir, `${dateStamp}-${runId}-delta-soak-report.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

  const summaryPath = path.join(resultsDir, `${dateStamp}-${runId}-delta-soak-summary.md`)
  const lines = [
    `# Delta Soak Summary (${dateStamp})`,
    '',
    `- Run ID: ${runId}`,
    `- Target duration minutes: ${durationMinutes}`,
    `- Actual duration ms: ${soakDurationMs}`,
    `- Iterations: ${iterations.length}`,
    `- Passed: ${report.passed ? 'yes' : 'no'}`,
    '',
    '## Iterations',
    ...iterations.map((item) => `- #${item.iteration} runId=${item.deltaRunId ?? 'missing'} runExit=${item.runExit} validateExit=${item.validateExit} hardGateStatus=${item.hardGateStatus} activeRiskStatus=${item.activeRiskStatus} legacyDebtStatus=${item.legacyDebtStatus} activeRiskCount=${item.activeRiskCount ?? 'unknown'} legacyOnlyCount=${item.legacyOnlyCount ?? 'unknown'}`),
    '',
    '## Gate Semantics',
    '- hardGateStatus: fail when delta hard suites fail or current-run session mismatch appears.',
    '- activeRiskStatus: fail when historical debt summary reports activeRiskCount > 0 (or debt summary missing).',
    '- legacyDebtStatus: observe-only when legacyOnlyCount > 0 and activeRiskCount = 0.',
    '',
    '## Failures',
    ...(failures.length ? failures.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Artifacts',
    `- soak report: ${toRel(reportPath)}`,
  ]
  fs.writeFileSync(summaryPath, lines.join('\n') + '\n', 'utf8')
  console.log(lines.join('\n'))

  process.exit(report.passed ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
