#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  ensureDirIfNeeded,
  getCliEntryGateRoot,
  getRealProviderHome,
  getSyntheticHome,
  getTestRoot,
} from './support/testPaths.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const packagedCliEntryPath = path.join(repoRoot, 'dist', 'cli.js')
const builtTsShellCliPath = path.join(tsShellRoot, 'dist', 'packages', 'ts-shell', 'src', 'entrypoints', 'cli.js')
const buildCliBinScriptPath = path.join(repoRoot, 'scripts', 'build-cli-bin.mjs')
const syntheticHome = getSyntheticHome()
const realProviderHome = getRealProviderHome({ allowDefault: true })
const testRoot = getTestRoot()
const projectRoot = getCliEntryGateRoot()
const followupProjectRoot = path.join(testRoot, 'cli-entry-followup-gate')
const migratedProjectRoot = path.join(testRoot, 'cli-entry-gate-rebased')
const oldProjectRoot = path.join(testRoot, 'cli-entry-gate-old-root')
const fixturePath = `${projectRoot}/fixture.txt`
const stdinFixturePath = `${projectRoot}/stdin-fixture.txt`
const replayPath = `${projectRoot}/replay.txt`
const migratedFixturePath = `${migratedProjectRoot}/rebased-fixture.txt`
const seededSessionId = 'cli_entry_gate_seeded_session'
const fixtureReadMarker = `Read result for ${fixturePath}:`
const stdinFixtureReadMarker = `Read result for ${stdinFixturePath}:`
const migratedFixtureReadMarker = `Read result for ${migratedFixturePath}:`

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
  fs.mkdirSync(followupProjectRoot, { recursive: true })
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
  const sessionsRoot = path.join(syntheticHome, '.cheers', 'sessions')
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
  const sessionDir = path.join(syntheticHome, '.cheers', 'sessions', seededSessionId)
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
    CHEERS_PROVIDER_MODE: 'synthetic',
    ...(options.env ?? {}),
  }
  return run(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
    cwd: tsShellRoot,
    env,
    stdin: options.stdin,
    timeoutMs: options.timeoutMs ?? 240000,
  })
}

async function ensurePackagedCliEntry() {
  if (!fs.existsSync(builtTsShellCliPath)) {
    printStep(
      'cli-entry-packaged-build-artifact',
      'product-regression',
      `missing built ts-shell CLI: ${builtTsShellCliPath}`,
    )
    return false
  }

  const result = await run(process.execPath, [buildCliBinScriptPath], {
    cwd: repoRoot,
    timeoutMs: 120000,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep(
      'cli-entry-packaged-bin-generation',
      'product-regression',
      result.timedOut ? 'timed out' : `exit=${result.code}`,
    )
    console.log(summarizeOutput(result.output))
    return false
  }
  if (!fs.existsSync(packagedCliEntryPath)) {
    printStep(
      'cli-entry-packaged-bin-generation',
      'product-regression',
      `missing root dist CLI: ${packagedCliEntryPath}`,
    )
    return false
  }
  printStep('cli-entry-packaged-bin-generation', 'pass')
  return true
}

async function runPackagedCli(args, options = {}) {
  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    CHEERS_PROVIDER_MODE: 'synthetic',
    ...(options.env ?? {}),
  }
  return run(process.execPath, [packagedCliEntryPath, ...args], {
    cwd: repoRoot,
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

async function assertSuccessfulPackagedCliRun(name, args, markers, options = {}) {
  const result = await runPackagedCli(args, options)
  if (result.code !== 0 || result.timedOut) {
    printStep(name, 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  return assertMarkers(result.output, markers, name)
}

async function runPrintReplayBoundary() {
  const printOk = await assertSuccessfulCliRun(
    'cli-entry-print-mode',
    ['--project', projectRoot, '--print', `read the first line from ${fixturePath}`],
    [fixtureReadMarker, 'cli entry fixture line 1'],
  )
  const replayOk = await assertSuccessfulCliRun(
    'cli-entry-replay-file-mode',
    ['--project', projectRoot, '--replay-file', replayPath],
    ['Replay mode: running 1 prompt(s)', fixtureReadMarker, 'cli entry fixture line 1'],
  )
  return printOk && replayOk
}

async function runStdinPromptBoundary() {
  return assertSuccessfulCliRun(
    'cli-entry-print-stdin-plus-prompt-boundary',
    ['--project', projectRoot, '--print', `read the first line from ${fixturePath}`],
    [
      fixtureReadMarker,
      'cli entry fixture line 1',
      stdinFixtureReadMarker,
      'cli entry stdin fixture line 1',
    ],
    { stdin: `read the first line from ${stdinFixturePath}\n` },
  )
}

async function runPrintToolExecutionSurface() {
  const targetFile = 'cli-entry-tool-execution.txt'
  const targetPath = path.join(projectRoot, targetFile)
  fs.rmSync(targetPath, { force: true })

  const result = await runCli([
    '--project',
    projectRoot,
    '--print',
    `Create file ${targetFile} with content: cli entry tool execution surface.`,
  ])
  if (result.code !== 0 || result.timedOut) {
    printStep(
      'cli-entry-print-tool-execution-surface',
      'product-regression',
      result.timedOut ? 'timed out' : `exit=${result.code}`,
    )
    console.log(summarizeOutput(result.output))
    return false
  }

  const requiredMarkers = [
    'Result',
    'Action result',
    'Task: write-file',
    'Changed files: cli-entry-tool-execution.txt',
    'Verification: status=skipped',
    'Verdict: Partial',
    '[not_proven] relevant verification did not pass',
    '[action] Next:',
  ]
  const missing = requiredMarkers.filter((marker) => !result.output.includes(marker))
  if (missing.length > 0) {
    printStep('cli-entry-print-tool-execution-surface', 'product-regression', `missing=${missing.join(' | ')}`)
    console.log(summarizeOutput(result.output))
    return false
  }

  if (!fs.existsSync(targetPath)) {
    printStep('cli-entry-print-tool-execution-surface', 'product-regression', `missing file=${targetPath}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  const content = fs.readFileSync(targetPath, 'utf8')
  if (!content.includes('cli entry tool execution surface')) {
    printStep('cli-entry-print-tool-execution-surface', 'product-regression', 'file content mismatch')
    console.log(summarizeOutput(result.output))
    return false
  }

  printStep('cli-entry-print-tool-execution-surface', 'pass')
  return true
}

async function runNonInteractiveApprovalBoundary() {
  const result = await runCli([
    '--project',
    projectRoot,
    '--print',
    'Run node --version',
  ])
  if (result.code !== 0 || result.timedOut) {
    printStep(
      'cli-entry-non-interactive-approval-boundary',
      'product-regression',
      result.timedOut ? 'timed out' : `exit=${result.code}`,
    )
    console.log(summarizeOutput(result.output))
    return false
  }

  const requiredMarkers = [
    'Approval',
    'Decision source: default-deny',
    'Non-interactive approval policy: deny (default deny)',
    'approval-audit:channel=non-interactive',
    'approval-audit:decision=deny',
    'Approval decision: deny',
    'Result',
    'Outcome: stopped',
    'BlockerKind: approval-denied',
    'Action result',
    'Task: run-command',
    'Approvals: 0/1 approved',
  ]
  const missing = requiredMarkers.filter((marker) => !result.output.includes(marker))
  if (missing.length > 0) {
    printStep('cli-entry-non-interactive-approval-boundary', 'product-regression', `missing=${missing.join(' | ')}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  if (result.output.includes('approval> ')) {
    printStep('cli-entry-non-interactive-approval-boundary', 'product-regression', 'interactive approval prompt leaked')
    console.log(summarizeOutput(result.output))
    return false
  }
  if (result.output.includes('Outcome: success')) {
    printStep('cli-entry-non-interactive-approval-boundary', 'product-regression', 'approval-denied command reported success')
    console.log(summarizeOutput(result.output))
    return false
  }

  printStep('cli-entry-non-interactive-approval-boundary', 'pass')
  return true
}

async function runFailedToolFollowupSurface() {
  const result = await runCli([
    '--project',
    projectRoot,
    '--non-interactive-approval',
    'allow-once',
    '--print',
    'Run node missing-script.js',
  ])
  if (result.code !== 0 || result.timedOut) {
    printStep(
      'cli-entry-failed-tool-followup-surface',
      'product-regression',
      result.timedOut ? 'timed out' : `exit=${result.code}`,
    )
    console.log(summarizeOutput(result.output))
    return false
  }

  const requiredMarkers = [
    'Approval decision: allow-once',
    'Result',
    'Outcome: stopped',
    'BlockerKind: verification-failed',
    'Action result',
    'Task: run-command',
    'Changed: none',
    'Failed files: (command)',
    'Failure reason: (command):',
    'Verification: failed',
    'Verification detail:',
    'Next action:',
    'Next steps',
    'Tool execution failed after approval; inspect the command output/error.',
    'Approvals: 1/1 approved',
  ]
  const missing = requiredMarkers.filter((marker) => !result.output.includes(marker))
  if (missing.length > 0) {
    printStep('cli-entry-failed-tool-followup-surface', 'product-regression', `missing=${missing.join(' | ')}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  if (result.output.includes('approval> ')) {
    printStep('cli-entry-failed-tool-followup-surface', 'product-regression', 'interactive approval prompt leaked')
    console.log(summarizeOutput(result.output))
    return false
  }
  if (result.output.includes('Outcome: success')) {
    printStep('cli-entry-failed-tool-followup-surface', 'product-regression', 'failed tool execution reported success')
    console.log(summarizeOutput(result.output))
    return false
  }

  printStep('cli-entry-failed-tool-followup-surface', 'pass')
  return true
}

function extractResultReason(output) {
  const reasonMatch = output.match(/^- Reason:\s*(.+)$/m)
  if (reasonMatch?.[1]?.trim()) return reasonMatch[1].trim()
  const failureReasonMatch = output.match(/^- Failure reason:\s*(.+)$/m)
  if (failureReasonMatch?.[1]?.trim()) return failureReasonMatch[1].trim()
  return undefined
}

async function runStoppedFailureFollowupRealPath() {
  const failed = await runCli([
    '--project',
    followupProjectRoot,
    '--non-interactive-approval',
    'allow-once',
    '--print',
    'Run node missing-script.js',
  ])
  if (failed.code !== 0 || failed.timedOut) {
    printStep(
      'cli-entry-stopped-failure-followup-real-path',
      'product-regression',
      failed.timedOut ? 'failed turn timed out' : `failed turn exit=${failed.code}`,
    )
    console.log(summarizeOutput(failed.output))
    return false
  }

  const failureMarkers = [
    'Approval decision: allow-once',
    'Result',
    'Outcome: stopped',
    'BlockerKind: verification-failed',
    'Action result',
    'Task: run-command',
    'Verification: failed',
    'Next action:',
    'Next steps',
  ]
  const missingFailureMarkers = failureMarkers.filter((marker) => !failed.output.includes(marker))
  if (missingFailureMarkers.length > 0) {
    printStep(
      'cli-entry-stopped-failure-followup-real-path',
      'product-regression',
      `failed turn missing=${missingFailureMarkers.join(' | ')}`,
    )
    console.log(summarizeOutput(failed.output))
    return false
  }
  const reason = extractResultReason(failed.output)
  if (!reason) {
    printStep('cli-entry-stopped-failure-followup-real-path', 'product-regression', 'failed turn missing reason')
    console.log(summarizeOutput(failed.output))
    return false
  }

  const bare = await runCli([
    '--project',
    followupProjectRoot,
    '--print',
    '/continue',
  ])
  if (bare.code !== 0 || bare.timedOut) {
    printStep(
      'cli-entry-stopped-failure-followup-real-path',
      'product-regression',
      bare.timedOut ? 'bare /continue timed out' : `bare /continue exit=${bare.code}`,
    )
    console.log(summarizeOutput(bare.output))
    return false
  }

  const followup = await runCli([
    '--project',
    followupProjectRoot,
    '--print',
    '/continue what should I do next after the failed command',
  ])
  if (followup.code !== 0 || followup.timedOut) {
    printStep(
      'cli-entry-stopped-failure-followup-real-path',
      'product-regression',
      followup.timedOut ? 'follow-up /continue timed out' : `follow-up /continue exit=${followup.code}`,
    )
    console.log(summarizeOutput(followup.output))
    return false
  }

  const guidanceMarkers = [
    'Result',
    'Outcome: stopped',
    'TerminalState: stopped',
    'Reason:',
    'DoNext:',
    'Use /continue <follow-up prompt>',
  ]
  const missingBareMarkers = guidanceMarkers.filter((marker) => !bare.output.includes(marker))
  const missingFollowupMarkers = guidanceMarkers.filter((marker) => !followup.output.includes(marker))
  if (missingBareMarkers.length > 0 || missingFollowupMarkers.length > 0) {
    printStep(
      'cli-entry-stopped-failure-followup-real-path',
      'product-regression',
      `continue guidance missing bare=${missingBareMarkers.join(' | ') || 'none'} followup=${missingFollowupMarkers.join(' | ') || 'none'}`,
    )
    console.log(summarizeOutput(`${bare.output}\n${followup.output}`))
    return false
  }
  if (!bare.output.includes(reason) || !followup.output.includes(reason)) {
    printStep('cli-entry-stopped-failure-followup-real-path', 'product-regression', 'stopped reason not preserved')
    console.log(summarizeOutput(`${bare.output}\n${followup.output}`))
    return false
  }
  if (
    bare.output.includes('No recoverable session found') ||
    followup.output.includes('No recoverable session found') ||
    bare.output.includes('starting a fresh session') ||
    followup.output.includes('starting a fresh session')
  ) {
    printStep('cli-entry-stopped-failure-followup-real-path', 'product-regression', 'lost stopped session context')
    console.log(summarizeOutput(`${bare.output}\n${followup.output}`))
    return false
  }

  printStep('cli-entry-stopped-failure-followup-real-path', 'pass')
  return true
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
    [migratedFixtureReadMarker, 'cli entry migrated fixture line 1'],
  )
  if (!ok) return false

  const sessionDir = path.join(syntheticHome, '.cheers', 'sessions', seededSessionId)
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

async function runPackagedEntryBoundary() {
  const packagedReady = await ensurePackagedCliEntry()
  if (!packagedReady) return false

  const versionResult = await runPackagedCli(['--version'])
  if (versionResult.code !== 0 || versionResult.timedOut) {
    printStep(
      'cli-entry-packaged-version',
      'product-regression',
      versionResult.timedOut ? 'timed out' : `exit=${versionResult.code}`,
    )
    console.log(summarizeOutput(versionResult.output))
    return false
  }
  if (!versionResult.output.includes('0.1.0')) {
    printStep('cli-entry-packaged-version', 'product-regression', 'missing version marker')
    console.log(summarizeOutput(versionResult.output))
    return false
  }
  printStep('cli-entry-packaged-version', 'pass')

  const slashOk = await assertSuccessfulPackagedCliRun(
    'cli-entry-packaged-slash-current-session',
    ['--project', projectRoot, '--print', '/sessions current'],
    ['Current session', '- ID:'],
  )
  const printOk = await assertSuccessfulPackagedCliRun(
    'cli-entry-packaged-print-mode',
    ['--project', projectRoot, '--print', `read the first line from ${fixturePath}`],
    [
      ...commonResultMarkers,
      fixtureReadMarker,
      'cli entry fixture line 1',
    ],
  )
  return slashOk && printOk
}

async function main() {
  console.log('gate name=cli-entry')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real-provider HOME not used=${realProviderHome ?? 'not-configured'}`)
  const homeCreated = ensureDirIfNeeded(syntheticHome)
  console.log(`homeCreated=${homeCreated}`)

  if (realProviderHome && path.resolve(syntheticHome) === path.resolve(realProviderHome)) {
    printStep('home-boundary', 'config-failure', 'synthetic and real-provider homes are identical')
    process.exit(3)
  }

  ensureFixtureData()

  const checks = []
  checks.push(await runPrintReplayBoundary())
  checks.push(await runStdinPromptBoundary())
  checks.push(await runPrintToolExecutionSurface())
  checks.push(await runNonInteractiveApprovalBoundary())
  checks.push(await runFailedToolFollowupSurface())
  checks.push(await runStoppedFailureFollowupRealPath())
  checks.push(await runSessionMigrationBoundary())
  checks.push(await runInvalidArgumentBoundary())
  checks.push(await runPackagedEntryBoundary())

  const ok = checks.every(Boolean)
  printStep('cli-entry-hard-gate', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
