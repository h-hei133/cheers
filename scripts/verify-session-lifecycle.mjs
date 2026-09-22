#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getSyntheticHome, getTestRoot } from './support/testPaths.mjs'
import { resolveVitestPath } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = resolveVitestPath(repoRoot, tsShellRoot)
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const syntheticHome = getSyntheticHome()
const projectRoot = path.join(getTestRoot(), 'real-fresh-editwrite-compact-rebased')
const syntheticSessionId = 'sess_8c44c8891210d92e_1776956957666'
const replayFile = path.join(getTestRoot(), 'session-lifecycle-replay.txt')
const authorityRoot = process.platform === 'win32' ? projectRoot.replaceAll('/', '\\') : projectRoot

const lifecycleMarkers = [
  `Authority root: ${authorityRoot}.`,
  'Subject permission request: bash/spawn/process(node).',
  'Subject permission scope: bash/spawn/process(node).',
  `Subject permission root: ${authorityRoot}.`,
  'Current request context scope: bash/spawn/process(node).',
  'Result',
  'Outcome: success',
]

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
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, timedOut: false, stdout, stderr: `${stderr}${error.message}`, output: `${stdout}${stderr}${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
    })
  })
}

function printStep(name, status, detail = '') {
  const suffix = detail ? ` - ${detail}` : ''
  console.log(`[${status}] ${name}${suffix}`)
}

function summarizeOutput(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-14)
    .join('\n')
}

async function runFocusedTest(name, file, pattern) {
  const result = await run(process.execPath, [vitestPath, 'run', file, '-t', pattern], {
    cwd: tsShellRoot,
    timeoutMs: 180000,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep(name, 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  printStep(name, 'pass')
  return true
}

function assertMarkers(output, markers, label) {
  const missing = markers.filter((marker) => !output.includes(marker))
  if (missing.length > 0) {
    printStep(label, 'product-regression', `missing=${missing.join(' | ')}`)
    return false
  }
  printStep(label, 'pass')
  return true
}

async function runSyntheticPrintReplayGate() {
  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    return { ok: false, code: 3 }
  }
  fs.mkdirSync(path.dirname(replayFile), { recursive: true })
  fs.writeFileSync(replayFile, 'what did I just approve and why is it asking again\n', 'utf8')
  if (!fs.existsSync(replayFile)) {
    printStep('session-lifecycle-replay-fixture', 'product-regression', `${replayFile} missing`)
    return { ok: false, code: 1 }
  }

  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    CHEERS_PROVIDER_MODE: 'synthetic',
  }
  const commonArgs = [
    '--project',
    projectRoot,
    '--session-id',
    syntheticSessionId,
    '--migrate-session-root',
  ]
  const printResult = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    ...commonArgs,
    '--print',
    'what did I just approve and why is it asking again',
  ], { cwd: tsShellRoot, env, timeoutMs: 240000 })
  if (printResult.code !== 0 || printResult.timedOut) {
    printStep('session-lifecycle-synthetic-print', 'product-regression', printResult.timedOut ? 'timed out' : `exit=${printResult.code}`)
    console.log(summarizeOutput(printResult.output))
    return { ok: false, code: 1 }
  }
  const printOk = assertMarkers(printResult.output, lifecycleMarkers, 'session-lifecycle-synthetic-print')

  const replayResult = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    ...commonArgs,
    '--replay-file',
    replayFile,
  ], { cwd: tsShellRoot, env, timeoutMs: 240000 })
  if (replayResult.code !== 0 || replayResult.timedOut) {
    printStep('session-lifecycle-synthetic-replay', 'product-regression', replayResult.timedOut ? 'timed out' : `exit=${replayResult.code}`)
    console.log(summarizeOutput(replayResult.output))
    return { ok: false, code: 1 }
  }
  const replayOk = assertMarkers(replayResult.output, lifecycleMarkers, 'session-lifecycle-synthetic-replay')
  return { ok: printOk && replayOk, code: printOk && replayOk ? 0 : 1 }
}

async function main() {
  console.log('gate name=session-lifecycle')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log('homeCreated=false')

  const checks = []
  checks.push(await runFocusedTest(
    'session-state-recovery-compact-tests',
    'src/session/SessionManager.test.ts',
    'restores an interrupted session and preserves pending prompt metadata|returns recovery guidance when a session file is corrupt|creates directory substrate with metadata, transcript, and state files|rebinds project root while preserving session identity and rebasing continuity anchors|retains permission memory after real auto-compact threshold crossing|retains approval audit history after real auto-compact threshold crossing|builds a replay plan for interrupted turns with continuation prompt|builds a runtime state seed from durable replay state|normalizes legacy permission project-root fields and rooted targets for old sessions|normalizes lowercase legacy-root target residues during project-root migration',
  ))
  checks.push(await runFocusedTest(
    'query-replay-compact-seed-tests',
    'src/core/query/runtime/engine.test.ts',
    'imports replay-built runtime seed instead of restarting from the first turn|drops compacted transcript and derived context for fresh-only recovery seeds',
  ))
  checks.push(await runFocusedTest(
    'bootstrap-session-migration-tests',
    'src/core/shell/bootstrap.test.ts',
    'allows explicit session reuse when requested root is a child path of session root|explicitly rebinds compatible roots when migration flag is set|allows explicit session root migration only when migration flag is set|falls back to fresh session when persisted current session cannot be resumed',
  ))
  checks.push(await runFocusedTest(
    'orchestration-migration-continuity-tests',
    'src/orchestration/runMvpIntegratedFlow.test.ts',
    'routes reflective stop-reason query to rebased continuity state instead of repo-explain|answers reflective explain scope from rebased explain object after migration-like root change|answers reflective read-position query from rebased session state after migration-like root change|materializes migration-rebased next-step reflective handoff into continuation execution',
  ))
  const cliGate = await runSyntheticPrintReplayGate()
  if (cliGate.code === 3) process.exit(3)
  checks.push(cliGate.ok)

  const ok = checks.every(Boolean)
  printStep('session-lifecycle-hard-gate', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
