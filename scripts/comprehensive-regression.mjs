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

function normalizePath(value) {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase()
}

function parseMode(argv) {
  const modeIndex = argv.indexOf('--mode')
  if (modeIndex < 0) return 'daily'
  const mode = argv[modeIndex + 1]
  if (!['daily', 'release'].includes(mode)) {
    throw new Error('Unsupported --mode. Use daily or release.')
  }
  return mode
}

function boundaryCheck() {
  const normalized = {
    cwd: normalizePath(process.cwd()),
    mainRepoRoot: normalizePath(mainRepoRoot),
    testRoot: normalizePath(testRoot),
  }
  const cwdIsMainRepo = normalized.cwd === normalized.mainRepoRoot
  const executionFromTestRepoCopy =
    normalized.cwd.startsWith(`${normalized.testRoot}/`) &&
    normalized.cwd.includes('private-coding-agents')
  const violations = []
  if (!cwdIsMainRepo) violations.push('cwd-not-main-repo')
  if (executionFromTestRepoCopy) violations.push('executing-from-d-test-repo-copy')
  return {
    ...normalized,
    cwdIsMainRepo,
    executionFromTestRepoCopy,
    violations,
    passed: violations.length === 0,
  }
}

function runProcess(command, args, options = {}) {
  const envSource = options.env ?? process.env
  const sanitizedEnv = {}
  for (const [key, value] of Object.entries(envSource)) {
    if (typeof value === 'string') sanitizedEnv[key] = value
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

function extractBroaderRunId(output) {
  const match = output.match(/Run ID:\s*([^\s]+)/)
  return match?.[1] ?? null
}

async function runNpmScript(scriptName, timeoutMs = 900000) {
  if (process.platform === 'win32') {
    return runProcess('cmd.exe', ['/d', '/s', '/c', `npm run ${scriptName}`], {
      cwd: mainRepoRoot,
      timeoutMs,
    })
  }
  return runProcess('npm', ['run', scriptName], {
    cwd: mainRepoRoot,
    timeoutMs,
  })
}

async function runArtifactValidation(targetRunId) {
  return runProcess(
    process.execPath,
    [path.join(mainRepoRoot, 'scripts', 'validate-broader-artifacts.mjs'), '--run-id', targetRunId],
    { cwd: mainRepoRoot, timeoutMs: 300000 },
  )
}

function readEvidenceByRunId(targetRunId) {
  const date = targetRunId.slice(0, 10)
  const file = path.join(resultsDir, `${date}-${targetRunId}-evidence-index.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function saveLog(name, content) {
  fs.mkdirSync(resultsDir, { recursive: true })
  const file = path.join(resultsDir, `${dateStamp}-${runId}-${name}.log`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function toRel(p) {
  return p.replaceAll('\\', '/')
}

async function runDailyMode(execution) {
  const batches = []

  const p0 = await runNpmScript('test:broader:p0')
  const p0Log = saveLog('batch1-p0', p0.output)
  const p0RunId = extractBroaderRunId(p0.output)
  batches.push({ batch: 'Batch1', name: 'test:broader:p0', code: p0.code, runId: p0RunId, log: toRel(p0Log) })

  const p1 = await runNpmScript('test:broader:p1')
  const p1Log = saveLog('batch2-p1', p1.output)
  const p1RunId = extractBroaderRunId(p1.output)
  batches.push({ batch: 'Batch2', name: 'test:broader:p1', code: p1.code, runId: p1RunId, log: toRel(p1Log) })

  const full = await runNpmScript('test:broader')
  const fullLog = saveLog('batch3-full', full.output)
  const fullRunId = extractBroaderRunId(full.output)
  batches.push({ batch: 'Batch3', name: 'test:broader', code: full.code, runId: fullRunId, log: toRel(fullLog) })

  const validationTargets = [p0RunId, p1RunId, fullRunId].filter(Boolean)
  for (const target of validationTargets) {
    const result = await runArtifactValidation(target)
    const log = saveLog(`batch4-validate-${target}`, result.output)
    batches.push({ batch: 'Batch4', name: `validate:${target}`, code: result.code, runId: target, log: toRel(log) })
  }

  execution.batches = batches
}

async function runReleaseMode(execution) {
  const batches = []
  const runIds = []
  for (let i = 1; i <= 2; i += 1) {
    const full = await runNpmScript('test:broader')
    const log = saveLog(`release-full-${i}`, full.output)
    const targetRunId = extractBroaderRunId(full.output)
    batches.push({ batch: `ReleaseFull${i}`, name: 'test:broader', code: full.code, runId: targetRunId, log: toRel(log) })
    if (targetRunId) runIds.push(targetRunId)

    if (targetRunId) {
      const validation = await runArtifactValidation(targetRunId)
      const validationLog = saveLog(`release-validate-${i}`, validation.output)
      batches.push({ batch: `ReleaseValidate${i}`, name: `validate:${targetRunId}`, code: validation.code, runId: targetRunId, log: toRel(validationLog) })
    }
  }

  const releaseChecks = []
  for (const targetRunId of runIds) {
    const evidence = readEvidenceByRunId(targetRunId)
    if (!evidence) {
      releaseChecks.push({ runId: targetRunId, passed: false, reason: 'missing-evidence-index' })
      continue
    }
    const hardFailure = (evidence.findings?.P0?.length ?? 0) > 0 || (evidence.findings?.P1?.length ?? 0) > 0
    const currentRunMismatch = evidence.findings?.P1?.some((item) => String(item).includes('session-scan current-run mismatch')) ?? false
    releaseChecks.push({
      runId: targetRunId,
      passed: !hardFailure && !currentRunMismatch,
      hardFailure,
      currentRunMismatch,
      p0Count: evidence.findings?.P0?.length ?? 0,
      p1Count: evidence.findings?.P1?.length ?? 0,
    })
  }

  execution.batches = batches
  execution.releaseChecks = releaseChecks
}

function summarize(execution) {
  const failures = []
  if (!execution.boundary.passed) failures.push('environment-boundary-violation')
  for (const batch of execution.batches ?? []) {
    if (batch.code !== 0) failures.push(`${batch.batch}:${batch.name}:exit=${batch.code}`)
  }
  if (execution.mode === 'release') {
    for (const check of execution.releaseChecks ?? []) {
      if (!check.passed) failures.push(`release-gate:${check.runId}:${check.reason ?? 'hard-failure-or-mismatch'}`)
    }
  }
  execution.failures = failures
  execution.passed = failures.length === 0
}

function writeArtifacts(execution) {
  fs.mkdirSync(resultsDir, { recursive: true })
  const base = `${dateStamp}-${runId}-comprehensive`
  const jsonPath = path.join(resultsDir, `${base}-report.json`)
  fs.writeFileSync(jsonPath, JSON.stringify(execution, null, 2), 'utf8')

  const summaryLines = [
    `# Comprehensive Regression (${dateStamp})`,
    '',
    `- Run ID: ${runId}`,
    `- Mode: ${execution.mode}`,
    `- Main repo root: ${mainRepoRoot}`,
    `- Test root: ${testRoot}`,
    `- Passed: ${execution.passed ? 'yes' : 'no'}`,
    '',
    '## Boundary Check',
    `- cwdIsMainRepo: ${execution.boundary.cwdIsMainRepo}`,
    `- executionFromTestRepoCopy: ${execution.boundary.executionFromTestRepoCopy}`,
    `- violations: ${(execution.boundary.violations ?? []).length ? execution.boundary.violations.join(', ') : 'none'}`,
    '',
    '## Batches',
    ...((execution.batches ?? []).map((batch) => `- ${batch.batch} | ${batch.name} | exit=${batch.code} | runId=${batch.runId ?? 'n/a'} | log=${batch.log}`)),
  ]

  if (execution.mode === 'release') {
    summaryLines.push('', '## Release Checks')
    for (const check of execution.releaseChecks ?? []) {
      summaryLines.push(`- ${check.runId} | passed=${check.passed} | p0=${check.p0Count ?? 'n/a'} | p1=${check.p1Count ?? 'n/a'} | mismatch=${check.currentRunMismatch ?? 'n/a'}`)
    }
  }

  summaryLines.push('', '## Failures', ...(execution.failures.length ? execution.failures.map((x) => `- ${x}`) : ['- none']), '', '## Artifacts', `- report: ${toRel(jsonPath)}`)

  const summaryPath = path.join(resultsDir, `${base}-summary.md`)
  fs.writeFileSync(summaryPath, summaryLines.join('\n') + '\n', 'utf8')
  console.log(summaryLines.join('\n'))

  return { summaryPath, jsonPath }
}

async function main() {
  const mode = parseMode(process.argv.slice(2))
  const execution = {
    runId,
    date: dateStamp,
    mode,
    boundary: boundaryCheck(),
    batches: [],
    failures: [],
  }

  if (execution.boundary.passed) {
    if (mode === 'daily') await runDailyMode(execution)
    else await runReleaseMode(execution)
  }

  summarize(execution)
  writeArtifacts(execution)
  process.exit(execution.passed ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
