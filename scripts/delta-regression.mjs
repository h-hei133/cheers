#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validatePayload } from '../contracts/tests/validator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const mainRepoRoot = 'D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents'
const testRoot = 'D:/Test'
const projectRoot = 'D:/Test'
const resultsDir = path.join(testRoot, 'test-results')
const tsShellCwd = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellCwd, 'src', 'entrypoints', 'cli.tsx')
const now = new Date()
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const runId = `${dateStamp}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-${process.pid}`
const VALID_SUITES = new Set(['contracts', 'xlayer', 'faults', 'concurrency', 'full'])
const HARD_SUITE_IDS = new Set(['n1.contracts-robustness', 'n2.cross-layer-consistency', 'n3.fault-injection'])

fs.mkdirSync(resultsDir, { recursive: true })
fs.writeFileSync(
  path.join(testRoot, 'tmp-evidence-read.txt'),
  [
    'Line 1: This file is for continuity contract checks.',
    'Line 2: It contains both summary-worthy and explain-worthy clues.',
    'Line 3: The purpose is to test whether follow-up intent switching is stable.',
    'Line 4: Final evidence line A.',
    'Line 5: Final evidence line B.',
  ].join('\n') + '\n',
  'utf8',
)

function normalizePath(value) {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase()
}

function parseSuiteArg(argv) {
  const suiteIndex = argv.indexOf('--suite')
  const requested = suiteIndex >= 0 ? argv[suiteIndex + 1] : 'full'
  if (!VALID_SUITES.has(requested)) {
    throw new Error(`Unsupported --suite value "${requested}". Expected one of: ${Array.from(VALID_SUITES).join(', ')}`)
  }
  return requested
}

function resolveHomeDir() {
  const forced = process.env.CHEERS_TEST_HOME
  if (forced && fs.existsSync(path.join(forced, '.cheers', 'config.json'))) return forced
  const candidates = ['D:/Test/home-daily', 'D:/Test/home-fulltest2', 'D:/Test/home-fulltest', 'D:/Test/home-sf']
  for (const home of candidates) {
    if (fs.existsSync(path.join(home, '.cheers', 'config.json'))) return home
  }
  const fallback = 'D:/Test/home-delta'
  fs.mkdirSync(path.join(fallback, '.cheers'), { recursive: true })
  return fallback
}

const homeDir = resolveHomeDir()

function ensureEnvironmentBoundary() {
  const normalized = {
    cwd: normalizePath(process.cwd()),
    repoRoot: normalizePath(repoRoot),
    mainRepoRoot: normalizePath(mainRepoRoot),
    projectRoot: normalizePath(projectRoot),
    testRoot: normalizePath(testRoot),
  }
  const violations = []
  if (normalized.cwd !== normalized.mainRepoRoot) violations.push('cwd-not-main-repo')
  if (normalized.repoRoot !== normalized.mainRepoRoot) violations.push('script-reporoot-not-main-repo')
  if (normalized.projectRoot !== normalized.testRoot) violations.push('project-root-not-d-test')
  if (normalized.cwd.startsWith(`${normalized.testRoot}/`) && normalized.cwd.includes('cheers')) {
    violations.push('executing-from-d-test-repo-copy')
  }
  return { ...normalized, violations, passed: violations.length === 0 }
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
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeoutMs = options.timeoutMs ?? 120000
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

    if (typeof options.input === 'string') {
      child.stdin.write(options.input)
      child.stdin.end()
    } else {
      child.stdin.end()
    }
  })
}

async function runCli(args, options = {}) {
  return runProcess(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
    cwd: tsShellCwd,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      CHEERS_PROVIDER_MODE: 'real',
    },
    ...options,
  })
}

async function runCliWithRetry(args, options = {}, maxAttempts = 2) {
  let last = null
  for (let i = 1; i <= maxAttempts; i += 1) {
    const result = await runCli(args, options)
    last = result
    const transient = result.timedOut || result.output.trim().length === 0 || /provider-readiness:network/i.test(result.output)
    if (!transient || i === maxAttempts) return result
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  return last
}

function writeText(name, content) {
  const file = path.join(resultsDir, `${name}.log`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function writeJson(name, value) {
  const file = path.join(resultsDir, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
  return file
}

function toRel(p) {
  return p.replaceAll('\\', '/')
}

function extractSessionId(output) {
  const m = output.match(/Session:\s*(sess_[^\s\r\n]+)/)
  return m?.[1] ?? null
}

function extractSessionIds(output) {
  return Array.from(output.matchAll(/Session:\s*(sess_[^\s\r\n]+)/g)).map((m) => m[1])
}

function readLastQueryCompleted(sessionId) {
  const txPath = path.join(homeDir, '.cheers', 'sessions', sessionId, 'transcript.jsonl')
  if (!fs.existsSync(txPath)) return null
  let last = null
  for (const rawLine of fs.readFileSync(txPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    try {
      const event = JSON.parse(line)
      if (event?.type === 'query-event' && event?.event?.type === 'query.completed') {
        last = event.event.result ?? null
      }
    } catch {
      // ignore malformed line
    }
  }
  return last
}

function readSessionState(sessionId) {
  const statePath = path.join(homeDir, '.cheers', 'sessions', sessionId, 'state.json')
  if (!fs.existsSync(statePath)) return null
  return JSON.parse(fs.readFileSync(statePath, 'utf8'))
}

function listProjectSessions() {
  const sessionsRoot = path.join(homeDir, '.cheers', 'sessions')
  if (!fs.existsSync(sessionsRoot)) return new Map()
  const map = new Map()
  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('sess_')) continue
    const statePath = path.join(sessionsRoot, entry.name, 'state.json')
    if (!fs.existsSync(statePath)) continue
    try {
      const stat = fs.statSync(statePath)
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      const stateProjectRoot = typeof state?.projectRoot === 'string'
        ? normalizePath(state.projectRoot)
        : null
      if (stateProjectRoot && stateProjectRoot !== normalizePath(projectRoot)) continue
      map.set(entry.name, {
        mtimeMs: stat.mtimeMs,
      })
    } catch {
      // ignore unreadable session states
    }
  }
  return map
}

function resolveSessionIdFromSnapshotDelta(before, output, expected = 'any') {
  const explicit = extractSessionId(output)
  if (explicit) return explicit
  const allFromOutput = extractSessionIds(output)
  if (allFromOutput.length > 0) return allFromOutput[allFromOutput.length - 1]

  const after = listProjectSessions()
  const changed = []
  for (const [sessionId, info] of after.entries()) {
    const prev = before.get(sessionId)
    if (!prev || info.mtimeMs > prev.mtimeMs + 1) {
      changed.push({ sessionId, mtimeMs: info.mtimeMs })
    }
  }
  changed.sort((a, b) => b.mtimeMs - a.mtimeMs)

  const classify = (sessionId) => {
    const state = readSessionState(sessionId)
    const classification = state?.terminalClassification
    if (classification === 'success') return 'success'
    if (classification === 'error' || classification === 'stopped') return 'non-success'
    return 'unknown'
  }

  if (expected !== 'any') {
    for (const candidate of changed) {
      if (classify(candidate.sessionId) === expected) {
        return candidate.sessionId
      }
    }
  }
  return changed[0]?.sessionId ?? null
}

function buildSuiteRecord(input) {
  return {
    suiteId: input.suiteId,
    layer: input.layer,
    gateClass: input.gateClass,
    passed: input.passed,
    failureReasons: input.failureReasons ?? [],
    artifacts: (input.artifacts ?? []).map(toRel),
    durationMs: input.durationMs,
    details: input.details ?? {},
  }
}

function extractStopSignalMarkers(transcriptText) {
  const markers = []
  if (/insufficient-evidence/i.test(transcriptText)) markers.push('insufficient-evidence')
  if (/Workflow stopped on blocker\/failure/i.test(transcriptText)) markers.push('workflow-stopped')
  if (/Escalation denied by user/i.test(transcriptText)) markers.push('escalation-denied')
  if (/"terminalClassification":"(stopped|error)"/i.test(transcriptText)) {
    markers.push('embedded-terminal-classification')
  }
  if (/Task not completed/i.test(transcriptText)) markers.push('assistant-not-completed')
  return markers
}

function classifyHistoricalMismatch(record) {
  const markerSet = new Set(record.stopSignalMarkers ?? [])
  const hasLegacyStopSignal = markerSet.has('insufficient-evidence')
    || markerSet.has('workflow-stopped')
    || markerSet.has('escalation-denied')
    || markerSet.has('embedded-terminal-classification')

  if (record.assistantNotCompleted && hasLegacyStopSignal) {
    return {
      key: 'legacy-stop-plus-not-completed',
      attribution: 'legacy-only',
      reason: 'Historical success session retains both stop markers and assistant-not-completed signal.',
      quarantineRecommendation: 'baseline-quarantine',
    }
  }
  if (record.transcriptStopSignal && hasLegacyStopSignal) {
    return {
      key: 'legacy-stop-signal-only',
      attribution: 'legacy-only',
      reason: 'Historical success session retains stop markers but no assistant-not-completed signal.',
      quarantineRecommendation: 'baseline-quarantine',
    }
  }
  if (record.assistantNotCompleted) {
    return {
      key: 'assistant-not-completed-only',
      attribution: 'active-risk',
      reason: 'Success session keeps assistant-not-completed without recognized legacy stop markers.',
      quarantineRecommendation: 'observe-risk',
    }
  }
  return {
    key: 'unclassified-success-mismatch',
    attribution: 'active-risk',
    reason: 'Success mismatch without stable legacy marker profile.',
    quarantineRecommendation: 'observe-risk',
  }
}

function buildMismatchDebtSummary(mismatches) {
  const bucketMap = new Map()
  for (const mismatch of mismatches) {
    const classification = classifyHistoricalMismatch(mismatch)
    const existing = bucketMap.get(classification.key) ?? {
      bucket: classification.key,
      attribution: classification.attribution,
      reason: classification.reason,
      quarantineRecommendation: classification.quarantineRecommendation,
      count: 0,
      samples: [],
    }
    existing.count += 1
    if (existing.samples.length < 3) {
      existing.samples.push({
        session: mismatch.session,
        markers: mismatch.stopSignalMarkers ?? [],
      })
    }
    bucketMap.set(classification.key, existing)
  }

  const buckets = Array.from(bucketMap.values()).sort((a, b) => b.count - a.count)
  const legacyOnlyCount = buckets
    .filter((bucket) => bucket.attribution === 'legacy-only')
    .reduce((sum, bucket) => sum + bucket.count, 0)
  const activeRiskCount = buckets
    .filter((bucket) => bucket.attribution === 'active-risk')
    .reduce((sum, bucket) => sum + bucket.count, 0)

  return {
    total: mismatches.length,
    legacyOnlyCount,
    activeRiskCount,
    buckets,
    quarantineEligibleBuckets: buckets
      .filter((bucket) => bucket.quarantineRecommendation === 'baseline-quarantine')
      .map((bucket) => bucket.bucket),
    observeRiskBuckets: buckets
      .filter((bucket) => bucket.quarantineRecommendation === 'observe-risk')
      .map((bucket) => bucket.bucket),
  }
}

function scanSessions(currentRunSessionSet) {
  const sessionsRoot = path.join(homeDir, '.cheers', 'sessions')
  if (!fs.existsSync(sessionsRoot)) {
    return {
      runId,
      currentRun: { sessions: [], mismatches: [] },
      historical: { sessions: [], mismatches: [], debtSummary: buildMismatchDebtSummary([]) },
    }
  }

  const currentRun = { sessions: [], mismatches: [] }
  const historical = { sessions: [], mismatches: [] }
  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('sess_')) continue
    const statePath = path.join(sessionsRoot, entry.name, 'state.json')
    if (!fs.existsSync(statePath)) continue
    let state
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch {
      continue
    }
    const txPath = path.join(sessionsRoot, entry.name, 'transcript.jsonl')
    const tx = fs.existsSync(txPath) ? fs.readFileSync(txPath, 'utf8') : ''
    const assistantNotCompleted = /Task not completed/i.test(tx)
    const stopSignalMarkers = extractStopSignalMarkers(tx)
    const transcriptStopSignal = stopSignalMarkers.some((marker) => marker !== 'assistant-not-completed')
    const record = {
      session: entry.name,
      status: state.status ?? null,
      terminalClassification: state.terminalClassification ?? null,
      terminalReason: state.terminalReason ?? null,
      assistantNotCompleted,
      transcriptStopSignal,
      stopSignalMarkers,
    }
    const bucket = currentRunSessionSet.has(entry.name) ? currentRun : historical
    bucket.sessions.push(record)
    if ((assistantNotCompleted || transcriptStopSignal) && state.terminalClassification === 'success') {
      bucket.mismatches.push(record)
    }
  }
  currentRun.sessions.sort((a, b) => a.session.localeCompare(b.session))
  historical.sessions.sort((a, b) => a.session.localeCompare(b.session))
  historical.debtSummary = buildMismatchDebtSummary(historical.mismatches)
  return { runId, currentRun, historical }
}

async function runN1ContractsSuite() {
  const started = Date.now()
  const artifacts = []
  const failureReasons = []

  const runContractTests = await runProcess(process.execPath, [path.join(repoRoot, 'contracts', 'tests', 'run-contract-tests.mjs')], {
    cwd: repoRoot,
    timeoutMs: 180000,
  })
  const contractLog = writeText(`delta-${dateStamp}-${runId}-n1-contract-fixtures`, runContractTests.output)
  artifacts.push(contractLog)
  if (runContractTests.code !== 0) failureReasons.push('fixtures-runner-failed')

  const validDir = path.join(repoRoot, 'contracts', 'tests', 'fixtures', 'valid')
  const commandFixture = JSON.parse(fs.readFileSync(path.join(validDir, 'command.request.json'), 'utf8'))
  const lifecycleFixture = JSON.parse(fs.readFileSync(path.join(validDir, 'task.lifecycle.json'), 'utf8'))
  const streamFixture = JSON.parse(fs.readFileSync(path.join(validDir, 'stream.chunk.json'), 'utf8'))

  const shuffledCommand = {}
  for (const key of Object.keys(commandFixture).sort().reverse()) {
    shuffledCommand[key] = commandFixture[key]
  }
  if (validatePayload(shuffledCommand).length > 0) failureReasons.push('field-order-perturbation-regressed')

  const unknownFieldPayload = { ...commandFixture, unexpectedField: 'delta' }
  const unknownFieldErrors = validatePayload(unknownFieldPayload)
  if (unknownFieldErrors.length === 0) {
    failureReasons.push('validator-allows-unknown-field-drift')
  }

  const incompatibleVersionPayload = { ...lifecycleFixture, schemaVersion: '2.0.0' }
  const versionErrors = validatePayload(incompatibleVersionPayload)
  if (!versionErrors.some((entry) => entry.code === 'E_COMPATIBILITY_UNSUPPORTED')) {
    failureReasons.push('schema-version-compatibility-regressed')
  }

  const typeDriftPayload = { ...streamFixture, chunkIndex: '1' }
  const typeDriftErrors = validatePayload(typeDriftPayload)
  if (!typeDriftErrors.some((entry) => entry.code === 'E_FIELD_INVALID_TYPE')) {
    failureReasons.push('field-type-drift-not-detected')
  }

  const details = {
    unknownFieldErrors,
    versionErrors,
    typeDriftErrors,
  }
  const detailsArtifact = writeJson(`delta-${dateStamp}-${runId}-n1-contract-detail`, details)
  artifacts.push(detailsArtifact)

  return buildSuiteRecord({
    suiteId: 'n1.contracts-robustness',
    layer: 'N1',
    gateClass: 'hard',
    passed: failureReasons.length === 0,
    failureReasons,
    artifacts,
    durationMs: Date.now() - started,
    details,
  })
}

async function runN2CrossLayerSuite(currentRunSessionIds, traceMatrix) {
  const started = Date.now()
  const artifacts = []
  const failureReasons = []

  const successBefore = listProjectSessions()
  const successRun = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'read ./tmp-evidence-read.txt'], { timeoutMs: 120000 }, 3)
  const successLog = writeText(`delta-${dateStamp}-${runId}-n2-success`, successRun.output)
  artifacts.push(successLog)
  for (const sessionId of extractSessionIds(successRun.output)) currentRunSessionIds.add(sessionId)
  const successSessionId = resolveSessionIdFromSnapshotDelta(successBefore, successRun.output, 'success')
  if (successSessionId) currentRunSessionIds.add(successSessionId)
  if (!successSessionId) failureReasons.push('missing-success-session-id')

  const denyBefore = listProjectSessions()
  const denyRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'Use shell command node --version and report the exact output.'], { timeoutMs: 150000 })
  const denyLog = writeText(`delta-${dateStamp}-${runId}-n2-deny`, denyRun.output)
  artifacts.push(denyLog)
  for (const sessionId of extractSessionIds(denyRun.output)) currentRunSessionIds.add(sessionId)
  const denySessionId = resolveSessionIdFromSnapshotDelta(denyBefore, denyRun.output, 'non-success')
  if (denySessionId) currentRunSessionIds.add(denySessionId)
  if (!denySessionId) failureReasons.push('missing-deny-session-id')

  const successState = successSessionId ? readSessionState(successSessionId) : null
  const successCompleted = successSessionId ? readLastQueryCompleted(successSessionId) : null
  const denyState = denySessionId ? readSessionState(denySessionId) : null
  const denyCompleted = denySessionId ? readLastQueryCompleted(denySessionId) : null

  if (!successCompleted || !successState) failureReasons.push('missing-success-transcript-state')
  if (!denyCompleted || !denyState) failureReasons.push('missing-deny-transcript-state')

  if (successCompleted && successState) {
    if (successCompleted.terminalReason !== successState.terminalReason) failureReasons.push('success-terminal-reason-drift')
    if (successCompleted.terminalClassification !== successState.terminalClassification) failureReasons.push('success-terminal-classification-drift')
  }
  if (denyCompleted && denyState) {
    if (denyCompleted.terminalReason !== denyState.terminalReason) failureReasons.push('deny-terminal-reason-drift')
    if (denyCompleted.terminalClassification !== denyState.terminalClassification) failureReasons.push('deny-terminal-classification-drift')
    if (denyState.terminalClassification === 'success') failureReasons.push('deny-state-incorrectly-success')
  }

  traceMatrix.push({
    suiteId: 'n2.cross-layer-consistency',
    rows: [
      {
        case: 'success-read',
        sessionId: successSessionId,
        cliResult: /Result:\s+success\s+\(completed\)/i.test(successRun.output) ? 'success' : 'unknown',
        stateTerminal: successState ? `${successState.terminalClassification}:${successState.terminalReason}` : 'missing',
        transcriptTerminal: successCompleted ? `${successCompleted.terminalClassification}:${successCompleted.terminalReason}` : 'missing',
      },
      {
        case: 'denied-shell',
        sessionId: denySessionId,
        cliResult: /Result:\s+success\s+\(completed\)/i.test(denyRun.output) ? 'success' : 'non-success',
        stateTerminal: denyState ? `${denyState.terminalClassification}:${denyState.terminalReason}` : 'missing',
        transcriptTerminal: denyCompleted ? `${denyCompleted.terminalClassification}:${denyCompleted.terminalReason}` : 'missing',
      },
    ],
  })

  return buildSuiteRecord({
    suiteId: 'n2.cross-layer-consistency',
    layer: 'N2',
    gateClass: 'hard',
    passed: failureReasons.length === 0,
    failureReasons,
    artifacts,
    durationMs: Date.now() - started,
    details: {
      successSessionId,
      denySessionId,
    },
  })
}

async function runN3FaultSuite(currentRunSessionIds, faultReport) {
  const started = Date.now()
  const artifacts = []
  const failureReasons = []

  const missingHome = path.join(testRoot, `home-delta-missing-${runId}`)
  fs.mkdirSync(path.join(missingHome, '.cheers'), { recursive: true })
  const missingCredRun = await runProcess(process.execPath, [tsxCliPath, cliEntryPath, '--project', projectRoot, '--provider', 'openai-compatible', '--print', 'reply exactly: probe'], {
    cwd: tsShellCwd,
    env: {
      ...process.env,
      HOME: missingHome,
      USERPROFILE: missingHome,
      CHEERS_PROVIDER_MODE: 'real',
    },
    timeoutMs: 120000,
  })
  const missingCredLog = writeText(`delta-${dateStamp}-${runId}-n3-missing-credential`, missingCredRun.output)
  artifacts.push(missingCredLog)
  if (!/provider-readiness|missing-key|authentication was rejected/i.test(missingCredRun.output)) {
    failureReasons.push('missing-credential-fault-not-surfaced')
  }

  const blockedSessionId = `sess_missing_delta_${runId}`
  const blockedRecoveryRun = await runCli(['--project', projectRoot, '--session-id', blockedSessionId, '--print', 'continue previous task'], { timeoutMs: 120000 })
  const blockedRecoveryLog = writeText(`delta-${dateStamp}-${runId}-n3-blocked-recovery`, blockedRecoveryRun.output)
  artifacts.push(blockedRecoveryLog)
  for (const sessionId of extractSessionIds(blockedRecoveryRun.output)) currentRunSessionIds.add(sessionId)
  currentRunSessionIds.add(blockedSessionId)
  const blockedState = readSessionState(blockedSessionId)
  const blockedRecoverySurfaced = /not recoverable|No recoverable session found|Recovery blocked|no active file could be inherited|Result:\s*stopped|Task not completed|session\s+sess_[^\s]+\s+not found/i.test(blockedRecoveryRun.output)
    || blockedState?.terminalClassification === 'stopped'
    || blockedState?.terminalClassification === 'error'
  if (!blockedRecoverySurfaced) {
    failureReasons.push('blocked-recovery-signal-missing')
  }

  const denyBefore = listProjectSessions()
  const denyRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'Use shell command node --version and report the exact output.'], { timeoutMs: 150000 })
  const denyLog = writeText(`delta-${dateStamp}-${runId}-n3-deny-fault`, denyRun.output)
  artifacts.push(denyLog)
  for (const sessionId of extractSessionIds(denyRun.output)) currentRunSessionIds.add(sessionId)
  const denySessionId = resolveSessionIdFromSnapshotDelta(denyBefore, denyRun.output, 'non-success')
  if (denySessionId) currentRunSessionIds.add(denySessionId)
  const denyState = denySessionId ? readSessionState(denySessionId) : null
  const denyTerminal = denyState?.terminalClassification
    ?? (/Result:\s*error|Escalation denied by user/i.test(denyRun.output) ? 'error' : null)
  if (!denyTerminal || denyTerminal === 'success') {
    failureReasons.push('permission-deny-not-classified-as-stop-or-error')
  }

  faultReport.push({
    suiteId: 'n3.fault-injection',
    probes: [
      {
        name: 'missing-credential-home',
        surfaced: /provider-readiness|missing-key|authentication was rejected/i.test(missingCredRun.output),
      },
      {
        name: 'blocked-recovery',
        surfaced: blockedRecoverySurfaced,
      },
      {
        name: 'permission-deny',
        terminalClassification: denyTerminal ?? 'missing',
      },
    ],
  })

  return buildSuiteRecord({
    suiteId: 'n3.fault-injection',
    layer: 'N3',
    gateClass: 'hard',
    passed: failureReasons.length === 0,
    failureReasons,
    artifacts,
    durationMs: Date.now() - started,
    details: { denySessionId },
  })
}

async function runN4ConcurrencySuite(currentRunSessionIds) {
  const started = Date.now()
  const artifacts = []
  const failureReasons = []

  const promptLines = [
    'summarize ./tmp-evidence-read.txt',
    'explain ./tmp-evidence-read.txt',
    'read ./tmp-evidence-read.txt',
    'continue',
  ].join('\n') + '\n'

  const streamRun = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: promptLines, timeoutMs: 240000 }, 2)
  const streamLog = writeText(`delta-${dateStamp}-${runId}-n4-stdin-sequence`, streamRun.output)
  artifacts.push(streamLog)
  const streamSessions = extractSessionIds(streamRun.output)
  for (const sessionId of streamSessions) currentRunSessionIds.add(sessionId)
  if (new Set(streamSessions).size > 1) failureReasons.push('stdin-sequence-session-multiplexed')
  if (!/Summary of|Summary\s*:/i.test(streamRun.output)) failureReasons.push('stdin-sequence-summary-missing')
  if (!/Explanation for/i.test(streamRun.output)) failureReasons.push('stdin-sequence-explain-missing')

  const parallelBefore = listProjectSessions()
  const seedRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'summarize ./tmp-evidence-read.txt'], { timeoutMs: 180000 })
  const sharedSessionId = resolveSessionIdFromSnapshotDelta(parallelBefore, seedRun.output, 'success')
  if (sharedSessionId) currentRunSessionIds.add(sharedSessionId)
  const parallelSeedLog = writeText(`delta-${dateStamp}-${runId}-n4-parallel-seed`, seedRun.output)
  artifacts.push(parallelSeedLog)

  if (!sharedSessionId) {
    failureReasons.push('parallel-reentry-missing-session-id')
    return buildSuiteRecord({
      suiteId: 'n4.concurrency-reentry',
      layer: 'N4',
      gateClass: 'observe',
      passed: false,
      failureReasons,
      artifacts,
      durationMs: Date.now() - started,
      details: {
        sharedSessionId: null,
      },
    })
  }

  const [parallelA, parallelB] = await Promise.all([
    runCli(['--project', projectRoot, '--session-id', sharedSessionId, '--print', 'summarize ./tmp-evidence-read.txt'], { timeoutMs: 180000 }),
    runCli(['--project', projectRoot, '--session-id', sharedSessionId, '--print', 'explain ./tmp-evidence-read.txt'], { timeoutMs: 180000 }),
  ])
  const parallelLog = writeText(`delta-${dateStamp}-${runId}-n4-parallel-reentry`, `${parallelA.output}\n\n---\n\n${parallelB.output}`)
  artifacts.push(parallelLog)
  for (const sessionId of extractSessionIds(parallelA.output + parallelB.output)) currentRunSessionIds.add(sessionId)
  const state = readSessionState(sharedSessionId)
  if (!state) failureReasons.push('parallel-reentry-missing-session-state')
  if (state && typeof state.status !== 'string') failureReasons.push('parallel-reentry-invalid-session-state')

  return buildSuiteRecord({
    suiteId: 'n4.concurrency-reentry',
    layer: 'N4',
    gateClass: 'observe',
    passed: failureReasons.length === 0,
    failureReasons,
    artifacts,
    durationMs: Date.now() - started,
    details: { sharedSessionId },
  })
}

function deriveFindings(suites, sessionScan) {
  const findings = { P0: [], P1: [], P2: [] }
  for (const suite of suites) {
    if (suite.passed) continue
    if (suite.gateClass === 'hard') findings.P1.push(`${suite.suiteId} failed: ${suite.failureReasons.join(', ') || 'unknown'}`)
    else findings.P2.push(`${suite.suiteId} observation failed: ${suite.failureReasons.join(', ') || 'unknown'}`)
  }
  if (sessionScan.currentRun.mismatches.length > 0) findings.P1.push(`session-scan current-run mismatch count=${sessionScan.currentRun.mismatches.length}`)
  if (sessionScan.historical.mismatches.length > 0) {
    const debtSummary = sessionScan.historical.debtSummary ?? buildMismatchDebtSummary(sessionScan.historical.mismatches)
    const topBuckets = debtSummary.buckets
      .slice(0, 2)
      .map((bucket) => `${bucket.bucket}=${bucket.count}`)
      .join(', ')
    findings.P2.push(
      `session-scan historical mismatch trend count=${sessionScan.historical.mismatches.length}` +
      ` legacyOnly=${debtSummary.legacyOnlyCount} activeRisk=${debtSummary.activeRiskCount}` +
      (topBuckets ? ` buckets:[${topBuckets}]` : ''),
    )
  }
  return findings
}

async function main() {
  const boundary = ensureEnvironmentBoundary()
  if (!boundary.passed) {
    console.error(`environment-boundary-violation: ${boundary.violations.join(', ')}`)
    console.error(JSON.stringify(boundary, null, 2))
    process.exit(1)
  }

  const suiteArg = parseSuiteArg(process.argv.slice(2))
  const suiteSelection =
    suiteArg === 'full'
      ? ['contracts', 'xlayer', 'faults', 'concurrency']
      : [suiteArg]

  const currentRunSessionIds = new Set()
  const suites = []
  const traceMatrix = []
  const faultReport = []

  if (suiteSelection.includes('contracts')) suites.push(await runN1ContractsSuite())
  if (suiteSelection.includes('xlayer')) suites.push(await runN2CrossLayerSuite(currentRunSessionIds, traceMatrix))
  if (suiteSelection.includes('faults')) suites.push(await runN3FaultSuite(currentRunSessionIds, faultReport))
  if (suiteSelection.includes('concurrency')) suites.push(await runN4ConcurrencySuite(currentRunSessionIds))

  const sessionScan = scanSessions(currentRunSessionIds)
  const findings = deriveFindings(suites, sessionScan)

  const evidence = {
    meta: {
      date: dateStamp,
      runId,
      suite: suiteArg,
      projectRoot,
      testRoot,
      repoRoot,
      boundary,
      homeDir,
      providerMode: 'real',
    },
    suites,
    findings,
    gateRules: {
      hard: Array.from(HARD_SUITE_IDS),
      observe: ['n4.concurrency-reentry'],
    },
  }

  const evidencePath = path.join(resultsDir, `${dateStamp}-${runId}-delta-evidence.json`)
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8')
  const tracePath = path.join(resultsDir, `${dateStamp}-${runId}-delta-trace-matrix.json`)
  fs.writeFileSync(tracePath, JSON.stringify({ runId, traceMatrix }, null, 2), 'utf8')
  const faultPath = path.join(resultsDir, `${dateStamp}-${runId}-delta-fault-report.json`)
  fs.writeFileSync(faultPath, JSON.stringify({ runId, faultReport }, null, 2), 'utf8')
  const sessionScanPath = path.join(resultsDir, `${dateStamp}-${runId}-session-scan.json`)
  fs.writeFileSync(sessionScanPath, JSON.stringify(sessionScan, null, 2), 'utf8')

  const summaryPath = path.join(resultsDir, `${dateStamp}-${runId}-delta-summary.md`)
  const summaryLines = [
    `# Delta Regression Summary (${dateStamp})`,
    '',
    `- Run ID: ${runId}`,
    `- Suite: ${suiteArg}`,
    `- Main repo root: ${mainRepoRoot}`,
    `- Project root: ${projectRoot}`,
    `- Passed: ${(findings.P1.length + findings.P0.length) === 0 ? 'yes' : 'no'}`,
    '',
    '## Suite Results',
    ...suites.map((suite) => `- ${suite.suiteId} | layer=${suite.layer} | gate=${suite.gateClass} | passed=${suite.passed} | durationMs=${suite.durationMs}`),
    '',
    '## P1 Findings',
    ...(findings.P1.length ? findings.P1.map((item) => `- ${item}`) : ['- none']),
    '',
    '## P2 Findings',
    ...(findings.P2.length ? findings.P2.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Artifacts',
    `- summary: ${toRel(summaryPath)}`,
    `- evidence: ${toRel(evidencePath)}`,
    `- trace-matrix: ${toRel(tracePath)}`,
    `- fault-report: ${toRel(faultPath)}`,
    `- session-scan: ${toRel(sessionScanPath)}`,
  ]
  fs.writeFileSync(summaryPath, summaryLines.join('\n') + '\n', 'utf8')
  console.log(summaryLines.join('\n'))

  process.exit(findings.P1.length + findings.P0.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
