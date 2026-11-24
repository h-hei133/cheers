#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  getRealProviderHome,
  getTestRoot,
} from './support/testPaths.mjs'
import { resolveVitestPath } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = resolveVitestPath(repoRoot, tsShellRoot)
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const realHome = getRealProviderHome({ allowDefault: true })
const projectRoot = path.join(getTestRoot(), 'real-fresh-editwrite-compact-rebased')
const realSessionId = 'sess_12903adabf7ae26e_1776956738259'
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

async function runCli(args, env, timeoutMs = 240000) {
  return run(process.execPath, [tsxCliPath, "--conditions=cheers-source", cliEntryPath, ...args], {
    cwd: tsShellRoot,
    env,
    timeoutMs,
  })
}

async function runFocusedTest(name, file, pattern, extraEnv = {}) {
  const result = await run(process.execPath, [vitestPath, 'run', file, '-t', pattern], {
    cwd: tsShellRoot,
    env: extraEnv,
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

function testEnvironment() {
  return { GIT_CEILING_DIRECTORIES: path.resolve(getTestRoot()) }
}

async function runHardGate() {
  console.log('permission-memory hard gate')
  console.log(`repo=${repoRoot}`)
  console.log('homeCreated=false')

  const checks = []
  const env = testEnvironment()
  checks.push(await runFocusedTest(
    'session-permission-normalization-tests',
    'src/session/SessionManager.test.ts',
    'normalizes legacy permission project-root fields and rooted targets for old sessions|normalizes lowercase legacy-root target residues during project-root migration',
    env,
  ))
  checks.push(await runFocusedTest(
    'permission-request-memory-coherence-tests',
    'src/session/permissionRequestMemoryCodec.test.ts',
    'extracts the most recent evidence tokens with existing case normalization|prefers memory over evidence only when memory matches the session root and evidence does not',
    env,
  ))
  checks.push(await runFocusedTest(
    'permission-memory-continuity-projection-tests',
    'src/session/continuation/snapshot.test.ts',
    'projects retained approval and permission-request memory for the current session',
    env,
  ))

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
