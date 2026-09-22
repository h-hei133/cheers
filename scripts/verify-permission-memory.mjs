#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  getRealProviderHome,
  getSyntheticHome,
  getTestRoot,
} from './support/testPaths.mjs'
import { resolveVitestPath } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = resolveVitestPath(repoRoot, tsShellRoot)
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const syntheticHome = getSyntheticHome()
const realHome = getRealProviderHome({ allowDefault: true })
const projectRoot = path.join(getTestRoot(), 'real-fresh-editwrite-compact-rebased')
const realSessionId = 'sess_12903adabf7ae26e_1776956738259'
const syntheticSessionId = 'sess_8c44c8891210d92e_1776956957666'
const replayFile = path.join(getTestRoot(), 'permission-memory-replay.txt')

const authorityRoot = process.platform === 'win32' ? projectRoot.replaceAll('/', '\\') : projectRoot
const requiredExplanationMarkers = [
  'Last approval decision: allow-once.',
  'Lifecycle: one-shot (allow-once/deny).',
  'Cache effect: none.',
  `Authority root: ${authorityRoot}.`,
  'Subject permission request: bash/spawn/process(node).',
  'Subject permission scope: bash/spawn/process(node).',
  `Subject permission root: ${authorityRoot}.`,
  'Current request context scope: bash/spawn/process(node).',
  'Why asking again: allow-once grants are consumed',
]

const networkFailurePattern =
  /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout)/i
const configFailurePattern =
  /(missing.*config|no provider|api key|apikey|not connected|connect first|provider.*not.*configured|credentials)/i

function parseMode(argv) {
  const mode = argv[2] ?? 'hard'
  if (!['hard', 'real', 'all'].includes(mode)) {
    console.error('Usage: node scripts/verify-permission-memory.mjs [hard|real|all]')
    process.exit(1)
  }
  return mode
}

function normalizeForWindows(value) {
  return value.startsWith('/') && /^[A-Za-z]:/.test(value.slice(1))
    ? value.slice(1)
    : value
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const env = {}
    for (const [key, value] of Object.entries({ ...process.env, ...(options.env ?? {}) })) {
      if (typeof value === 'string') env[key] = value
    }
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, options.timeoutMs ?? 240000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({
        code: code ?? -1,
        signal: signal ?? null,
        timedOut,
        stdout,
        stderr,
        output: `${stdout}${stderr}`,
      })
    })
  })
}

function assertMarkers(output, markers, label) {
  const missing = markers.filter((marker) => !output.includes(marker))
  if (missing.length > 0) {
    return {
      ok: false,
      label,
      missing,
    }
  }
  return { ok: true, label, missing: [] }
}

function printStep(name, status, detail = '') {
  const suffix = detail ? ` - ${detail}` : ''
  console.log(`[${status}] ${name}${suffix}`)
}

function assertPathInside(parent, child) {
  const normalizedParent = path.resolve(parent)
  const normalizedChild = path.resolve(child)
  if (
    normalizedChild !== normalizedParent &&
    !normalizedChild.startsWith(`${normalizedParent}${path.sep}`)
  ) {
    throw new Error(`Refusing to touch path outside ${normalizedParent}: ${normalizedChild}`)
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

function ensureSyntheticPermissionMemoryFixture() {
  const sessionsRoot = path.join(syntheticHome, '.cheers', 'sessions')
  const sessionDir = path.join(sessionsRoot, syntheticSessionId)
  assertPathInside(sessionsRoot, sessionDir)

  fs.mkdirSync(sessionsRoot, { recursive: true })
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true })
  }
  fs.mkdirSync(sessionDir, { recursive: true })
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true })
  writeText(path.join(projectRoot, 'src', 'permission-memory-fixture.txt'), 'permission memory fixture\n')

  const now = new Date().toISOString()
  const rebasedRoot = projectRoot.replaceAll('\\', '/')
  const cacheKey = `${rebasedRoot.toLowerCase()}|bash:spawn:process:node`
  const continuity = {
    lastTaskKind: 'chat',
    lastApprovalDecision: 'allow-once',
    lastApprovalDecisionSource: 'cli-policy',
    lastApprovalPersistent: false,
    lastApprovalCacheEffect: 'none',
    lastApprovalProjectRoot: authorityRoot,
    lastApprovalCacheKey: cacheKey,
    lastApprovalScope: 'bash/spawn/process(node)',
    lastApprovalLineage: 'verify:node --version',
    lastApprovalChannel: 'interactive',
    lastApprovalInputKey: 'y',
    lastApprovalRecordedAt: now,
    lastPermissionRequestToolName: 'bash',
    lastPermissionRequestOperation: 'spawn',
    lastPermissionRequestProcess: 'node',
    lastPermissionRequestScopeLabel: 'bash/spawn/process(node)',
    lastPermissionRequestCacheKey: cacheKey,
    lastPermissionRequestProjectRoot: authorityRoot,
    lastPermissionRequestSource: 'verification-command',
    lastPermissionRequestLineage: 'verify:node --version',
    lastRequestScopeLabel: 'bash/spawn/process(node)',
    lastRequestScopeCacheKey: cacheKey,
    lastRequestScopeProjectRoot: authorityRoot,
    lastRequestScopeSource: 'verification-command',
  }

  writeJson(path.join(sessionDir, 'metadata.json'), {
    id: syntheticSessionId,
    projectRoot,
    rootMode: 'direct',
    requestedWorkspaceRoot: projectRoot,
    targetPathBase: projectRoot,
    gitRoot: null,
    title: 'Permission Memory Synthetic Fixture',
    createdAt: now,
    updatedAt: now,
  })
  writeJson(path.join(sessionDir, 'state.json'), {
    status: 'completed',
    projectRoot,
    runPhase: 'idle',
    terminalReason: 'completed',
    terminalClassification: 'success',
    durableStatus: 'success',
    workingMemory: {
      compacted: true,
      compactReason: 'auto-threshold',
      sourceTurnCount: 33,
      continuity,
      approvalAudit: {
        decision: 'allow-once',
        decisionSource: 'cli-policy',
        persistent: false,
        cacheEffect: 'none',
        projectRoot: authorityRoot,
        cacheKey,
        scopeLabel: 'bash/spawn/process(node)',
        lineage: 'verify:node --version',
        channel: 'interactive',
        inputKey: 'y',
        recordedAt: now,
      },
      approvalAuditHistory: [
        {
          decision: 'allow-once',
          decisionSource: 'cli-policy',
          persistent: false,
          cacheEffect: 'none',
          projectRoot: authorityRoot,
          cacheKey,
          scopeLabel: 'bash/spawn/process(node)',
          lineage: 'verify:node --version',
          channel: 'interactive',
          inputKey: 'y',
          recordedAt: now,
        },
      ],
      summary: [
        'last-approval-decision: allow-once',
        'last-approval-persistent: false',
        'last-approval-cache-effect: none',
        `last-approval-project-root: ${authorityRoot}`,
        `last-approval-cache-key: ${cacheKey}`,
        'last-approval-scope: bash/spawn/process(node)',
        'last-permission-request-tool-name: bash',
        'last-permission-request-operation: spawn',
        'last-permission-request-process: node',
        'last-permission-request-scope-label: bash/spawn/process(node)',
        `last-permission-request-cache-key: ${cacheKey}`,
        `last-permission-request-project-root: ${authorityRoot}`,
        'last-request-scope-label: bash/spawn/process(node)',
        `last-request-scope-cache-key: ${cacheKey}`,
        `last-request-scope-project-root: ${authorityRoot}`,
      ],
    },
  })
  writeText(
    path.join(sessionDir, 'transcript.jsonl'),
    [
      {
        type: 'message',
        role: 'user',
        content: 'run node --version with approval',
        timestamp: now,
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'Approval was granted once for bash/spawn/process(node).',
        timestamp: now,
      },
    ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
  )

  const currentSessionPath = path.join(syntheticHome, '.cheers', 'current-session.json')
  let currentSessionStore = { schemaVersion: 1, byProjectRoot: {} }
  if (fs.existsSync(currentSessionPath)) {
    try {
      currentSessionStore = JSON.parse(fs.readFileSync(currentSessionPath, 'utf8'))
    } catch {
      currentSessionStore = { schemaVersion: 1, byProjectRoot: {} }
    }
  }
  const byProjectRoot =
    currentSessionStore && typeof currentSessionStore.byProjectRoot === 'object'
      ? currentSessionStore.byProjectRoot
      : {}
  byProjectRoot[path.resolve(projectRoot).toLowerCase()] = {
    sessionId: syntheticSessionId,
    updatedAt: now,
  }
  writeJson(currentSessionPath, {
    schemaVersion: 1,
    byProjectRoot,
  })

  const state = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state.json'), 'utf8'))
  if (state.projectRoot !== projectRoot || state.status !== 'completed') {
    throw new Error(`Synthetic permission-memory fixture failed validation for ${syntheticSessionId}`)
  }
  printStep('synthetic-permission-memory-fixture', 'pass', syntheticSessionId)
}

async function runCli(args, env, timeoutMs = 240000) {
  return run(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
    cwd: tsShellRoot,
    env,
    timeoutMs,
  })
}

async function runFocusedTest(name, file, pattern) {
  const result = await run(process.execPath, [vitestPath, 'run', file, '-t', pattern], {
    cwd: tsShellRoot,
    timeoutMs: 120000,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep(name, 'fail', result.timedOut ? 'timed out' : `exit=${result.code}`)
    process.stdout.write(result.output)
    return false
  }
  printStep(name, 'pass')
  return true
}

async function runSyntheticExplanationGate() {
  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'fail', `${syntheticHome} missing`)
    return false
  }
  ensureSyntheticPermissionMemoryFixture()
  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    CHEERS_PROVIDER_MODE: 'synthetic',
  }
  const args = [
    '--project',
    projectRoot,
    '--session-id',
    syntheticSessionId,
    '--migrate-session-root',
    '--print',
    'what did I just approve and why is it asking again',
  ]
  const printResult = await runCli(args, env)
  if (printResult.code !== 0 || printResult.timedOut) {
    printStep('synthetic-print-explanation', 'fail', printResult.timedOut ? 'timed out' : `exit=${printResult.code}`)
    process.stdout.write(printResult.output)
    return false
  }
  const printMarkers = assertMarkers(printResult.output, requiredExplanationMarkers, 'synthetic-print-explanation')
  if (!printMarkers.ok) {
    printStep(printMarkers.label, 'fail', `missing=${printMarkers.missing.join(' | ')}`)
    return false
  }
  printStep('synthetic-print-explanation', 'pass')

  if (!fs.existsSync(replayFile)) {
    fs.mkdirSync(path.dirname(replayFile), { recursive: true })
    fs.writeFileSync(replayFile, 'what did I just approve and why is it asking again\n', 'utf8')
  }
  const replayResult = await runCli([
    '--project',
    projectRoot,
    '--session-id',
    syntheticSessionId,
    '--migrate-session-root',
    '--replay-file',
    replayFile,
  ], env)
  if (replayResult.code !== 0 || replayResult.timedOut) {
    printStep('synthetic-replay-explanation', 'fail', replayResult.timedOut ? 'timed out' : `exit=${replayResult.code}`)
    process.stdout.write(replayResult.output)
    return false
  }
  const replayMarkers = assertMarkers(replayResult.output, requiredExplanationMarkers, 'synthetic-replay-explanation')
  if (!replayMarkers.ok) {
    printStep(replayMarkers.label, 'fail', `missing=${replayMarkers.missing.join(' | ')}`)
    return false
  }
  printStep('synthetic-replay-explanation', 'pass')
  return true
}

async function runHardGate() {
  console.log('permission-memory hard gate')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log('homeCreated=false')

  const checks = []
  checks.push(await runFocusedTest(
    'session-permission-normalization-tests',
    'src/session/SessionManager.test.ts',
    'normalizes legacy permission project-root fields and rooted targets for old sessions|normalizes lowercase legacy-root target residues during project-root migration',
  ))
  checks.push(await runFocusedTest(
    'orchestration-authority-explanation-tests',
    'src/orchestration/runMvpIntegratedFlow.test.ts',
    'prefers subject tool/operation/target coherence over stale scope fragments after compact recovery|rebases migrated subject target text to the current root when legacy target residue is detected',
  ))
  checks.push(await runSyntheticExplanationGate())

  const ok = checks.every(Boolean)
  printStep('permission-memory-hard-gate', ok ? 'pass' : 'fail')
  return ok
}

function classifyRealFailure(result) {
  const output = result.output ?? ''
  if (configFailurePattern.test(output)) return 'config failure'
  if (networkFailurePattern.test(output) || result.timedOut) return 'provider-network inconclusive'
  return 'product regression'
}

async function runRealGate() {
  console.log('permission-memory real-provider smoke gate')
  console.log(`repo=${repoRoot}`)
  console.log(`real HOME=${realHome ?? 'not-configured'}`)
  console.log('homeCreated=false')

  const configPath = realHome ? path.join(realHome, '.cheers', 'config.json') : 'not-configured'
  if (!realHome || !fs.existsSync(realHome) || !fs.existsSync(configPath)) {
    printStep('real-provider-config', 'config failure', `${configPath} missing`)
    return { ok: false, classification: 'config failure' }
  }
  printStep('real-provider-config', 'pass')

  const statePath = path.join(realHome, '.cheers', 'sessions', realSessionId, 'state.json')
  if (!fs.existsSync(statePath)) {
    printStep('real-provider-compact-evidence', 'product regression', `${statePath} missing`)
    return { ok: false, classification: 'product regression' }
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  if (state?.workingMemory?.compacted !== true || state?.workingMemory?.compactReason !== 'auto-threshold') {
    printStep(
      'real-provider-compact-evidence',
      'product regression',
      `compacted=${state?.workingMemory?.compacted}; compactReason=${state?.workingMemory?.compactReason}`,
    )
    return { ok: false, classification: 'product regression' }
  }
  printStep(
    'real-provider-compact-evidence',
    'pass',
    `sourceTurnCount=${state?.workingMemory?.sourceTurnCount ?? 'unknown'}`,
  )

  const env = {
    HOME: realHome,
    USERPROFILE: realHome,
  }
  const printResult = await runCli([
    '--project',
    projectRoot,
    '--session-id',
    realSessionId,
    '--migrate-session-root',
    '--provider',
    'openai-compatible',
    '--print',
    'what did I just approve and why is it asking again',
  ], env)
  if (printResult.code !== 0 || printResult.timedOut) {
    const classification = classifyRealFailure(printResult)
    printStep('real-provider-print-explanation', classification, printResult.timedOut ? 'timed out' : `exit=${printResult.code}`)
    process.stdout.write(printResult.output)
    return { ok: false, classification }
  }
  const printMarkers = assertMarkers(printResult.output, requiredExplanationMarkers, 'real-provider-print-explanation')
  if (!printMarkers.ok) {
    printStep(printMarkers.label, 'product regression', `missing=${printMarkers.missing.join(' | ')}`)
    return { ok: false, classification: 'product regression' }
  }
  printStep('real-provider-print-explanation', 'pass')

  if (!fs.existsSync(replayFile)) {
    printStep('real-provider-replay-explanation', 'product regression', `${replayFile} missing`)
    return { ok: false, classification: 'product regression' }
  }
  const replayResult = await runCli([
    '--project',
    projectRoot,
    '--session-id',
    realSessionId,
    '--migrate-session-root',
    '--provider',
    'openai-compatible',
    '--replay-file',
    replayFile,
  ], env)
  if (replayResult.code !== 0 || replayResult.timedOut) {
    const classification = classifyRealFailure(replayResult)
    printStep('real-provider-replay-explanation', classification, replayResult.timedOut ? 'timed out' : `exit=${replayResult.code}`)
    process.stdout.write(replayResult.output)
    return { ok: false, classification }
  }
  const replayMarkers = assertMarkers(replayResult.output, requiredExplanationMarkers, 'real-provider-replay-explanation')
  if (!replayMarkers.ok) {
    printStep(replayMarkers.label, 'product regression', `missing=${replayMarkers.missing.join(' | ')}`)
    return { ok: false, classification: 'product regression' }
  }
  printStep('real-provider-replay-explanation', 'pass')

  printStep('permission-memory-real-provider-smoke', 'pass')
  return { ok: true, classification: 'pass' }
}

async function main() {
  const mode = parseMode(process.argv)
  const repo = normalizeForWindows(repoRoot)
  process.chdir(repo)

  if (mode === 'hard') {
    process.exit((await runHardGate()) ? 0 : 1)
  }

  if (mode === 'real') {
    const result = await runRealGate()
    process.exit(result.ok ? 0 : result.classification === 'provider-network inconclusive' ? 2 : 1)
  }

  const hardOk = await runHardGate()
  const realResult = await runRealGate()
  if (!hardOk) process.exit(1)
  if (!realResult.ok) process.exit(realResult.classification === 'provider-network inconclusive' ? 2 : 1)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
