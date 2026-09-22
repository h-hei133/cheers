#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedRepoRoot = path.resolve('D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const inspectorPath = path.join(repoRoot, 'scripts', 'inspect-evidence-artifact.mjs')
const syntheticHome = 'D:/Test/pca-home-synth'
const realProviderHome = 'D:/Test/home-sf'
const successProject = 'D:/Test/evidence-inspector-success'
const deniedProject = 'D:/Test/evidence-inspector-denied'
const partialFixtureRoot = `D:/Test/evidence-inspector-partial-fixtures/${Date.now()}`
const sessionsRoot = path.join(syntheticHome, '.cheers', 'sessions')
const runId = `${Date.now()}`
const successRelativePath = `scripts/inspector_success_${runId}.py`

function normalizeForCompare(input) {
  const normalized = path.resolve(input).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
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
    .slice(-18)
    .join('\n')
}

function assertContains(output, markers, label) {
  const missing = markers.filter((marker) => !output.includes(marker))
  if (missing.length > 0) {
    printStep(label, 'product-regression', `missing=${missing.join(' | ')}`)
    console.log(summarizeOutput(output))
    return false
  }
  printStep(label, 'pass')
  return true
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function getLatestSessionForProject(projectRoot) {
  const normalizedProject = normalizeForCompare(projectRoot)
  if (!fs.existsSync(sessionsRoot)) return null
  return fs
    .readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sessionDir = path.join(sessionsRoot, entry.name)
      const metadataPath = path.join(sessionDir, 'metadata.json')
      if (!fs.existsSync(metadataPath)) return null
      try {
        const metadata = readJson(metadataPath)
        if (normalizeForCompare(metadata.projectRoot ?? '') !== normalizedProject) return null
        return { sessionDir, mtimeMs: fs.statSync(sessionDir).mtimeMs }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.sessionDir ?? null
}

function ensureFixture(projectRoot) {
  fs.mkdirSync(path.join(projectRoot, 'scripts'), { recursive: true })
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: path.basename(projectRoot), private: true }, null, 2),
    'utf8',
  )
}

async function runCli(projectRoot, prompt, approval) {
  ensureFixture(projectRoot)
  return run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    projectRoot,
    '--print',
    '--non-interactive-approval',
    approval,
    prompt,
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 240000,
  })
}

async function inspectProject(projectRoot) {
  return run(process.execPath, [
    inspectorPath,
    '--home',
    syntheticHome,
    '--project',
    projectRoot,
  ], {
    cwd: repoRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 120000,
  })
}

async function runInspectorHelp() {
  return run(process.execPath, [
    inspectorPath,
    '--help',
  ], {
    cwd: repoRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 120000,
  })
}

async function runDoctor() {
  return run(process.execPath, [
    path.join(repoRoot, 'scripts', 'verify-doctor-environment.mjs'),
  ], {
    cwd: repoRoot,
    env: process.env,
    timeoutMs: 120000,
  })
}

async function inspectSessionDir(sessionDir) {
  return run(process.execPath, [
    inspectorPath,
    '--session-dir',
    sessionDir,
  ], {
    cwd: repoRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs: 120000,
  })
}

async function verifyHelpUsage() {
  const helpResult = await runInspectorHelp()
  if (helpResult.code !== 0 || helpResult.timedOut) {
    printStep('inspector-help', 'product-regression', helpResult.timedOut ? 'timed out' : `exit=${helpResult.code}`)
    console.log(summarizeOutput(helpResult.output))
    return false
  }
  return assertContains(helpResult.output, [
    'Usage:',
    '--session-dir',
    '--session-id',
    '--project',
    '--latest',
    'artifact-status=complete',
    'artifact-status=degraded',
    'exit 0',
    'Typical triage:',
  ], 'inspector-help-usage')
}

async function verifyDoctorHint() {
  const doctorResult = await runDoctor()
  if (doctorResult.code !== 0 || doctorResult.timedOut) {
    printStep('doctor-inspector-hint', 'product-regression', doctorResult.timedOut ? 'timed out' : `exit=${doctorResult.code}`)
    console.log(summarizeOutput(doctorResult.output))
    return false
  }
  return assertContains(doctorResult.output, [
    'triage-command= npm run evidence:inspect -- --home D:/Test/pca-home-synth --latest',
    'triage-command-project= npm run evidence:inspect -- --home <home> --project <project-root>',
    'triage-note=Use evidence:inspect after release gate failures',
  ], 'doctor-inspector-hint')
}

async function verifySuccessPath() {
  const prompt = `Create file ${successRelativePath} with content:\n\`\`\`python\nprint('inspector success')\n\`\`\``
  const runResult = await runCli(successProject, prompt, 'allow-once')
  if (runResult.code !== 0 || runResult.timedOut) {
    printStep('success-path-run', 'product-regression', runResult.timedOut ? 'timed out' : `exit=${runResult.code}`)
    console.log(summarizeOutput(runResult.output))
    return false
  }
  const inspectResult = await inspectProject(successProject)
  if (inspectResult.code !== 0 || inspectResult.timedOut) {
    printStep('success-path-inspector', 'product-regression', inspectResult.timedOut ? 'timed out' : `exit=${inspectResult.code}`)
    console.log(summarizeOutput(inspectResult.output))
    return false
  }
  return assertContains(inspectResult.output, [
    'evidence inspector',
    'session-id=',
    'transcript-path=',
    'artifact-status=complete',
    'state-path=',
    'latest-query-status=completed',
    'latest-terminal-classification=success',
    'latest-task-kind=write-file',
    'changed-files-count=1',
    `changed-file=${successRelativePath}`,
    'approval-event=write:approved',
    'tool-result=write:success',
    'evidence=current-permission-request-tool:write',
    'inspector-exit-semantics=exit 0 means a read-only diagnostic summary was printed',
    'triage-next-action=Use transcript-path/state-path plus changed-file/tool-result/approval-event lines',
  ], 'success-path-inspector-summary')
}

async function verifyDeniedPath() {
  const runResult = await runCli(
    deniedProject,
    'Run node --version for evidence inspector approval denial check',
    'deny',
  )
  if (runResult.code !== 0 || runResult.timedOut) {
    printStep('denied-path-run', 'product-regression', runResult.timedOut ? 'timed out' : `exit=${runResult.code}`)
    console.log(summarizeOutput(runResult.output))
    return false
  }
  const inspectResult = await inspectProject(deniedProject)
  if (inspectResult.code !== 0 || inspectResult.timedOut) {
    printStep('denied-path-inspector', 'product-regression', inspectResult.timedOut ? 'timed out' : `exit=${inspectResult.code}`)
    console.log(summarizeOutput(inspectResult.output))
    return false
  }
  return assertContains(inspectResult.output, [
    'evidence inspector',
    'session-id=',
    'transcript-path=',
    'artifact-status=complete',
    'state-path=',
    'latest-terminal-classification=stopped',
    'latest-task-kind=run-command',
    'changed-files-count=0',
    'verification-status=blocked',
    'blocker-kind=approval-denied',
    'approval-decision=deny',
    'approval-persistent=false',
    'approval-event=bash:denied',
    'tool-result=bash:failed',
    'evidence=verify-blocker-kind:approval-denied',
    'triage-next-action=Use transcript-path/state-path plus changed-file/tool-result/approval-event lines',
  ], 'denied-path-inspector-summary')
}

function copySessionFixture(sourceSessionDir, fixtureName) {
  const destination = path.join(partialFixtureRoot, fixtureName)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.cpSync(sourceSessionDir, destination, { recursive: true, force: false, errorOnExist: false })
  return destination
}

async function verifyMissingStateDegraded() {
  const sourceSessionDir = getLatestSessionForProject(successProject)
  if (!sourceSessionDir) {
    printStep('missing-state-fixture-source', 'product-regression', 'no success session available')
    return false
  }
  const fixtureDir = copySessionFixture(sourceSessionDir, 'missing-state')
  fs.rmSync(path.join(fixtureDir, 'state.json'), { force: true })
  const inspectResult = await inspectSessionDir(fixtureDir)
  if (inspectResult.code !== 0 || inspectResult.timedOut) {
    printStep('missing-state-inspector', 'product-regression', inspectResult.timedOut ? 'timed out' : `exit=${inspectResult.code}`)
    console.log(summarizeOutput(inspectResult.output))
    return false
  }
  return assertContains(inspectResult.output, [
    'artifact-status=degraded',
    'state-status=missing',
    'degraded-reason=missing-state',
    'transcript-status=present',
    'latest-terminal-classification=success',
    'changed-files-count=1',
    'triage-next-action=Inspect degraded-reason lines first',
  ], 'missing-state-degraded-summary')
}

async function verifyBadTranscriptDegraded() {
  const sourceSessionDir = getLatestSessionForProject(successProject)
  if (!sourceSessionDir) {
    printStep('bad-transcript-fixture-source', 'product-regression', 'no success session available')
    return false
  }
  const fixtureDir = copySessionFixture(sourceSessionDir, 'bad-transcript')
  fs.appendFileSync(path.join(fixtureDir, 'transcript.jsonl'), '\n{bad json line\n', 'utf8')
  const inspectResult = await inspectSessionDir(fixtureDir)
  if (inspectResult.code !== 0 || inspectResult.timedOut) {
    printStep('bad-transcript-inspector', 'product-regression', inspectResult.timedOut ? 'timed out' : `exit=${inspectResult.code}`)
    console.log(summarizeOutput(inspectResult.output))
    return false
  }
  return assertContains(inspectResult.output, [
    'artifact-status=degraded',
    'transcript-status=partial',
    'degraded-reason=transcript-parse-warning:line=',
    'latest-terminal-classification=success',
    'tool-result=write:success',
    'triage-next-action=Inspect degraded-reason lines first',
  ], 'bad-transcript-degraded-summary')
}

async function verifyIncompleteQueryDegraded() {
  const fixtureDir = path.join(partialFixtureRoot, 'incomplete-query')
  fs.mkdirSync(fixtureDir, { recursive: true })
  const sessionId = `sess_incomplete_${Date.now()}`
  fs.writeFileSync(
    path.join(fixtureDir, 'metadata.json'),
    JSON.stringify({
      id: sessionId,
      projectRoot: 'D:\\Test\\evidence-inspector-incomplete-query',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(fixtureDir, 'transcript.jsonl'),
    [
      JSON.stringify({ type: 'message', role: 'user', content: 'partial fixture', timestamp: new Date().toISOString() }),
      JSON.stringify({ type: 'query-event', event: { type: 'query.completed' }, timestamp: new Date().toISOString() }),
    ].join('\n'),
    'utf8',
  )
  fs.writeFileSync(path.join(fixtureDir, 'state.json'), JSON.stringify({ status: 'interrupted' }, null, 2), 'utf8')
  const inspectResult = await inspectSessionDir(fixtureDir)
  if (inspectResult.code !== 0 || inspectResult.timedOut) {
    printStep('incomplete-query-inspector', 'product-regression', inspectResult.timedOut ? 'timed out' : `exit=${inspectResult.code}`)
    console.log(summarizeOutput(inspectResult.output))
    return false
  }
  return assertContains(inspectResult.output, [
    'artifact-status=degraded',
    'degraded-reason=incomplete-query-completed-result',
    'degraded-reason=missing-coding-result',
    'latest-query-status=incomplete',
    'query-result-status=incomplete',
    'coding-result-status=missing',
    'final-output=none',
    'triage-next-action=Inspect degraded-reason lines first',
  ], 'incomplete-query-degraded-summary')
}

async function main() {
  console.log('gate name=evidence-inspector')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real-provider HOME=${realProviderHome}`)
  console.log('homeCreated=false')

  if (normalizeForCompare(repoRoot) !== normalizeForCompare(expectedRepoRoot)) {
    printStep('repo-root', 'config-failure', `expected=${expectedRepoRoot}`)
    process.exit(3)
  }
  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }
  if (!fs.existsSync(tsxCliPath) || !fs.existsSync(cliEntryPath) || !fs.existsSync(inspectorPath)) {
    printStep('inspector-entry', 'config-failure', 'tsx CLI, ts-shell entrypoint, or inspector script missing')
    process.exit(3)
  }

  const helpOk = await verifyHelpUsage()
  const successOk = await verifySuccessPath()
  const deniedOk = await verifyDeniedPath()
  const missingStateOk = await verifyMissingStateDegraded()
  const badTranscriptOk = await verifyBadTranscriptDegraded()
  const incompleteQueryOk = await verifyIncompleteQueryDegraded()
  const doctorHintOk = await verifyDoctorHint()
  if (!helpOk || !successOk || !deniedOk || !missingStateOk || !badTranscriptOk || !incompleteQueryOk || !doctorHintOk) {
    console.log('[product-regression] evidence-inspector')
    process.exit(1)
  }

  console.log('[pass] evidence-inspector')
  process.exit(0)
}

main().catch((error) => {
  printStep('unexpected-error', 'product-regression', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
