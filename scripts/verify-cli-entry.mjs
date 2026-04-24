#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const syntheticHome = 'D:/Test/pca-home-synth'
const realProviderHome = 'D:/Test/home-sf'
const projectRoot = 'D:/Test/cli-entry-gate'
const migratedProjectRoot = 'D:/Test/cli-entry-gate-rebased'
const oldProjectRoot = 'D:/Test/cli-entry-gate-old-root'
const fixturePath = `${projectRoot}/fixture.txt`
const stdinFixturePath = `${projectRoot}/stdin-fixture.txt`
const replayPath = `${projectRoot}/replay.txt`
const migratedFixturePath = `${migratedProjectRoot}/rebased-fixture.txt`
const seededSessionId = 'cli_entry_gate_seeded_session'

const commonResultMarkers = [
  'Result',
  'Outcome: success',
  'Action result',
  'Task: read-file',
  'Verification: not-requested',
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
      stdio: ['pipe', 'pipe', 'pipe'],
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

    if (typeof options.stdin === 'string') {
      child.stdin.end(options.stdin)
    } else {
      child.stdin.end()
    }
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

function assertMarkers(output, markers, label) {
  const missing = markers.filter((marker) => !output.includes(marker))
  if (missing.length > 0) {
    printStep(label, 'product-regression', `missing=${missing.join(' | ')}`)
    return false
  }
  printStep(label, 'pass')
  return true
}

function ensureFixtureData() {
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.mkdirSync(migratedProjectRoot, { recursive: true })
  fs.mkdirSync(oldProjectRoot, { recursive: true })
  fs.writeFileSync(
    fixturePath,
    ['cli entry fixture line 1', 'cli entry fixture line 2'].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    stdinFixturePath,
    ['cli entry stdin fixture line 1', 'cli entry stdin fixture line 2'].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    migratedFixturePath,
    ['cli entry migrated fixture line 1', 'cli entry migrated fixture line 2'].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    replayPath,
    `read the first line from ${fixturePath}\n`,
    'utf8',
  )
}

function removeSeededSessionDir() {
  const sessionsRoot = path.join(syntheticHome, '.private-agents', 'sessions')
  const sessionDir = path.join(sessionsRoot, seededSessionId)
  const resolvedSessionDir = path.resolve(sessionDir)
  const resolvedSyntheticHome = path.resolve(syntheticHome)
  if (!resolvedSessionDir.startsWith(resolvedSyntheticHome)) {
    throw new Error(`Refusing to remove session outside synthetic home: ${resolvedSessionDir}`)
  }
  fs.rmSync(sessionDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function seedSessionForMigration() {
  removeSeededSessionDir()
  const sessionDir = path.join(syntheticHome, '.private-agents', 'sessions', seededSessionId)
  fs.mkdirSync(sessionDir, { recursive: true })
  const now = new Date().toISOString()
  fs.writeFileSync(
    path.join(sessionDir, 'metadata.json'),
    JSON.stringify(
      {
        id: seededSessionId,
        projectRoot: path.resolve(oldProjectRoot),
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    ),
    'utf8',
  )
  fs.writeFileSync(
    path.join(sessionDir, 'state.json'),
    JSON.stringify(
      {
        status: 'completed',
        projectRoot: path.resolve(oldProjectRoot),
        runPhase: 'idle',
        terminalReason: 'completed',
        terminalClassification: 'success',
        workingMemory: {
          continuity: {
            sessionId: seededSessionId,
            projectRoot: path.resolve(oldProjectRoot),
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  )
  fs.writeFileSync(path.join(sessionDir, 'transcript.jsonl'), '', 'utf8')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

async function runCli(args, options = {}) {
  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    ...(options.env ?? {}),
  }
  return run(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
    cwd: tsShellRoot,
    env,
    stdin: options.stdin,
    timeoutMs: options.timeoutMs ?? 240000,
  })
}

async function assertSuccessfulCliRun(name, args, markers, options = {}) {
  const result = await runCli(args, options)
  if (result.code !== 0 || result.timedOut) {
    printStep(name, 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  return assertMarkers(result.output, [...commonResultMarkers, ...markers], name)
}

async function runPrintReplayBoundary() {
  const printOk = await assertSuccessfulCliRun(
    'cli-entry-print-mode',
    ['--project', projectRoot, '--print', `read the first line from ${fixturePath}`],
    ['Read result for D:/Test/cli-entry-gate/fixture.txt:', 'cli entry fixture line 1'],
  )
  const replayOk = await assertSuccessfulCliRun(
    'cli-entry-replay-file-mode',
    ['--project', projectRoot, '--replay-file', replayPath],
    ['Replay mode: running 1 prompt(s)', 'Read result for D:/Test/cli-entry-gate/fixture.txt:', 'cli entry fixture line 1'],
  )
  return printOk && replayOk
}

async function runStdinPromptBoundary() {
  return assertSuccessfulCliRun(
    'cli-entry-print-stdin-plus-prompt-boundary',
    ['--project', projectRoot, '--print', `read the first line from ${fixturePath}`],
    [
      'Read result for D:/Test/cli-entry-gate/fixture.txt:',
      'cli entry fixture line 1',
      'Read result for D:/Test/cli-entry-gate/stdin-fixture.txt:',
      'cli entry stdin fixture line 1',
    ],
    { stdin: `read the first line from ${stdinFixturePath}\n` },
  )
}

async function runSessionMigrationBoundary() {
  seedSessionForMigration()
  const ok = await assertSuccessfulCliRun(
    'cli-entry-session-id-migration-boundary',
    [
      '--project',
      migratedProjectRoot,
      '--session-id',
      seededSessionId,
      '--migrate-session-root',
      '--print',
      `read the first line from ${migratedFixturePath}`,
    ],
    ['Read result for D:/Test/cli-entry-gate-rebased/rebased-fixture.txt:', 'cli entry migrated fixture line 1'],
  )
  if (!ok) return false

  const sessionDir = path.join(syntheticHome, '.private-agents', 'sessions', seededSessionId)
  const metadata = readJson(path.join(sessionDir, 'metadata.json'))
  const state = readJson(path.join(sessionDir, 'state.json'))
  const expectedRoot = path.resolve(migratedProjectRoot)
  const metadataOk = path.resolve(metadata.projectRoot) === expectedRoot
  const stateOk = path.resolve(state.projectRoot) === expectedRoot
  if (!metadataOk || !stateOk) {
    printStep(
      'cli-entry-session-id-migration-state',
      'product-regression',
      `metadata=${metadata.projectRoot} state=${state.projectRoot} expected=${expectedRoot}`,
    )
    return false
  }
  printStep('cli-entry-session-id-migration-state', 'pass')
  return true
}

async function runInvalidArgumentBoundary() {
  const result = await runCli(['--project', projectRoot, '--replay-file'])
  if (result.code === 0 || result.timedOut) {
    printStep('cli-entry-invalid-replay-file-argument', 'product-regression', result.timedOut ? 'timed out' : 'unexpected pass')
    console.log(summarizeOutput(result.output))
    return false
  }
  if (!result.output.includes('Missing value for --replay-file')) {
    printStep('cli-entry-invalid-replay-file-argument', 'product-regression', 'missing error marker')
    console.log(summarizeOutput(result.output))
    return false
  }
  printStep('cli-entry-invalid-replay-file-argument', 'pass')
  return true
}

async function main() {
  console.log('gate name=cli-entry')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real-provider HOME not used=${realProviderHome}`)
  console.log('homeCreated=false')

  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }
  if (path.resolve(syntheticHome) === path.resolve(realProviderHome)) {
    printStep('home-boundary', 'config-failure', 'synthetic and real-provider homes are identical')
    process.exit(3)
  }

  ensureFixtureData()

  const checks = []
  checks.push(await runPrintReplayBoundary())
  checks.push(await runStdinPromptBoundary())
  checks.push(await runSessionMigrationBoundary())
  checks.push(await runInvalidArgumentBoundary())

  const ok = checks.every(Boolean)
  printStep('cli-entry-hard-gate', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
