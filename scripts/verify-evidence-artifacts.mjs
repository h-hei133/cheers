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
import { pathsEqual } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedRepoRoot = path.resolve('D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const syntheticHome = getSyntheticHome()
const realProviderHome = getRealProviderHome({ allowDefault: true })
const targetProject = path.join(getTestRoot(), 'evidence-artifacts-gate')
const sessionsRoot = path.join(syntheticHome, '.cheers', 'sessions')
const runId = `${Date.now()}`
const successRelativePath = `scripts/evidence_success_${runId}.py`
const successTargetPath = path.join(targetProject, successRelativePath)

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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function flattenQueryEvents(events) {
  return events
    .filter((entry) => entry.type === 'query-event')
    .map((entry) => entry.event)
}

function findLast(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return items[index]
  }
  return undefined
}

function getLatestSessionForProject(projectRoot, startedAtMs) {
  if (!fs.existsSync(sessionsRoot)) return null
  const normalizedProject = normalizeForCompare(projectRoot)
  const candidates = fs
    .readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sessionDir = path.join(sessionsRoot, entry.name)
      const metadataPath = path.join(sessionDir, 'metadata.json')
      if (!fs.existsSync(metadataPath)) return null
      try {
        const metadata = readJson(metadataPath)
        if (normalizeForCompare(metadata.projectRoot ?? '') !== normalizedProject) return null
        const stat = fs.statSync(sessionDir)
        if (stat.mtimeMs + 5000 < startedAtMs) return null
        return { sessionDir, metadata, mtimeMs: stat.mtimeMs }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0] ?? null
}

function ensureFixture() {
  fs.mkdirSync(path.join(targetProject, 'scripts'), { recursive: true })
  fs.writeFileSync(
    path.join(targetProject, 'package.json'),
    JSON.stringify({ name: 'evidence-artifacts-gate', private: true }, null, 2),
    'utf8',
  )
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

function assertSessionArtifacts(projectRoot, startedAtMs, label) {
  const session = getLatestSessionForProject(projectRoot, startedAtMs)
  if (!session) {
    printStep(label, 'product-regression', 'no matching session artifacts found')
    return null
  }
  const transcriptPath = path.join(session.sessionDir, 'transcript.jsonl')
  const statePath = path.join(session.sessionDir, 'state.json')
  if (!fs.existsSync(transcriptPath) || !fs.existsSync(statePath)) {
    printStep(label, 'product-regression', 'missing transcript.jsonl or state.json')
    return null
  }
  printStep(label, 'pass', path.basename(session.sessionDir))
  return {
    sessionDir: session.sessionDir,
    transcript: readJsonl(transcriptPath),
    state: readJson(statePath),
  }
}

async function runSuccessEvidenceCheck() {
  ensureFixture()
  const startedAtMs = Date.now()
  const prompt = `Create file ${successRelativePath} with content:\n\`\`\`python\nprint('evidence artifact success')\n\`\`\``
  const result = await run(process.execPath, [
    tsxCliPath, "--conditions=cheers-source",
    cliEntryPath,
    '--project',
    targetProject,
    '--print',
    '--non-interactive-approval',
    'allow-once',
    prompt,
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
      CHEERS_SYNTHETIC_TOOLS: '1',
    },
    timeoutMs: 240000,
  })

  if (result.code !== 0 || result.timedOut) {
    printStep('success-path-entry', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }

  const stdoutOk = assertContains(result.output, [
    'Result',
    'Outcome: success',
    'Execution summary',
    'Actions: write (1 run)',
    'Approvals: 1/1 approved',
  ], 'success-path-result-markers')

  if (!fs.existsSync(successTargetPath)) {
    printStep('success-path-changed-file', 'product-regression', `${successTargetPath} missing`)
    return false
  }
  const content = fs.readFileSync(successTargetPath, 'utf8')
  if (content !== "```python\nprint('evidence artifact success')\n```") {
    printStep('success-path-changed-file', 'product-regression', 'file content did not match the requested fixture')
    return false
  }
  printStep('success-path-changed-file', 'pass', successTargetPath)

  const artifacts = assertSessionArtifacts(targetProject, startedAtMs, 'success-path-session-artifacts')
  if (!artifacts) return false
  const queryEvents = flattenQueryEvents(artifacts.transcript)
  const queryCompleted = findLast(queryEvents, (event) => event.type === 'query.completed')
  const toolResult = findLast(queryEvents, (event) => event.type === 'tool.result' && event.toolName === 'write')
  const approvalResolved = findLast(queryEvents, (event) => event.type === 'approval.resolved' && event.toolName === 'write')

  const transcriptOk =
    queryCompleted?.result?.status === 'completed' &&
    queryCompleted?.result?.terminalClassification === 'success' &&
    toolResult?.success === true &&
    approvalResolved?.outcome === 'approved' &&
    toolResult.output?.includes(`Wrote ${successRelativePath}`)

  if (!transcriptOk) {
    printStep('success-path-transcript-evidence', 'product-regression', 'terminal, approval, or write-result facts did not match')
    return false
  }
  printStep('success-path-transcript-evidence', 'pass', 'terminal, approval, write-result, and disk content matched')
  return stdoutOk
}

async function runDeniedEvidenceCheck() {
  ensureFixture()
  const startedAtMs = Date.now()
  const result = await run(process.execPath, [
    tsxCliPath, "--conditions=cheers-source",
    cliEntryPath,
    '--project',
    targetProject,
    '--print',
    '--non-interactive-approval',
    'deny',
    'Run node --version so evidence artifact gate can inspect approval denial',
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
      CHEERS_SYNTHETIC_TOOLS: '1',
    },
    timeoutMs: 240000,
  })

  if (result.code !== 0 || result.timedOut) {
    printStep('denied-path-entry', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }

  const stdoutOk = assertContains(result.output, [
    'approval-audit:persistent=false',
    'approval-audit:cache-effect=none',
    'Approval decision: deny',
    'Result',
    'Outcome: stopped',
    'BlockerKind: approval-denied',
    'Approvals: 0/1 approved',
  ], 'denied-path-result-markers')

  const artifacts = assertSessionArtifacts(targetProject, startedAtMs, 'denied-path-session-artifacts')
  if (!artifacts) return false
  const queryEvents = flattenQueryEvents(artifacts.transcript)
  const queryCompleted = findLast(queryEvents, (event) => event.type === 'query.completed')
  const approvalResolved = findLast(queryEvents, (event) => event.type === 'approval.resolved' && event.toolName === 'bash')
  const toolResult = findLast(queryEvents, (event) => event.type === 'tool.result' && event.toolName === 'bash')
  const stateAudit = artifacts.state?.workingMemory?.approvalAudit
  const continuity = artifacts.state?.workingMemory?.continuity

  const deniedOk =
    queryCompleted?.result?.status === 'stopped_error' &&
    queryCompleted?.result?.terminalClassification === 'stopped' &&
    queryCompleted?.result?.stopReason?.includes('User denied permission') &&
    approvalResolved?.outcome === 'denied' &&
    toolResult?.success === false &&
    stateAudit?.decision === 'deny' &&
    stateAudit?.persistent === false &&
    continuity?.lastApprovalDecision === 'deny' &&
    continuity?.lastApprovalCacheEffect === 'none'

  if (!deniedOk) {
    printStep('denied-path-audit-evidence', 'product-regression', 'terminal, tool, or approval-audit facts did not match')
    return false
  }
  printStep('denied-path-audit-evidence', 'pass', 'terminal, tool, transcript, and approval-audit facts matched')
  return stdoutOk
}

async function main() {
  console.log('gate name=evidence-artifacts')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`target project=${targetProject}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real-provider HOME=${realProviderHome ?? 'not-configured'}`)
  console.log('homeCreated=false')

  if (process.platform === 'win32' && !pathsEqual(repoRoot, expectedRepoRoot)) {
    printStep('repo-root', 'config-failure', `expected=${expectedRepoRoot}`)
    process.exit(3)
  }
  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }
  if (!fs.existsSync(tsxCliPath) || !fs.existsSync(cliEntryPath)) {
    printStep('cli-entry', 'config-failure', 'tsx CLI or ts-shell entrypoint missing')
    process.exit(3)
  }

  const successOk = await runSuccessEvidenceCheck()
  const deniedOk = await runDeniedEvidenceCheck()
  if (!successOk || !deniedOk) {
    console.log('[product-regression] evidence-artifacts')
    process.exit(1)
  }

  console.log('[pass] evidence-artifacts')
  process.exit(0)
}

main().catch((error) => {
  printStep('unexpected-error', 'product-regression', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
