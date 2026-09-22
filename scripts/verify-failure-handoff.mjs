#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedRepoRoot = path.resolve('D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents')
const handoffPath = path.join(repoRoot, 'scripts', 'triage-release-failure.mjs')
const fixtureRoot = `D:/Test/release-failure-handoff-fixtures/${Date.now()}`
const syntheticHome = 'D:/Test/pca-home-synth'
const realProviderHome = 'D:/Test/home-sf'

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
    }, options.timeoutMs ?? 120000)
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

function writeFixture(name, content) {
  fs.mkdirSync(fixtureRoot, { recursive: true })
  const file = path.join(fixtureRoot, `${name}.log`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

async function runHandoff({ logFile, gate, command, exitCode, home = syntheticHome }) {
  return run(process.execPath, [
    handoffPath,
    '--log-file',
    logFile,
    '--gate',
    gate,
    '--command',
    command,
    '--exit-code',
    String(exitCode),
    '--home',
    home,
  ])
}

async function verifyProductRegressionHandoff() {
  const log = writeFixture('product-regression', [
    'gate name=evidence-artifacts',
    'mode=hard',
    'target project=D:/Test/evidence-artifacts-gate',
    'session-id=sess_failure_handoff_123',
    'transcript-path=D:\\Test\\pca-home-synth\\.cheers\\sessions\\sess_failure_handoff_123\\transcript.jsonl',
    'state-path=D:\\Test\\pca-home-synth\\.cheers\\sessions\\sess_failure_handoff_123\\state.json',
    '[product-regression] denied-path-audit-evidence - stdout approval marker did not map to transcript/state evidence',
    'missing=approval-event=bash:denied',
  ].join('\n'))
  const result = await runHandoff({
    logFile: log,
    gate: 'evidence-artifacts',
    command: 'npm run verify:evidence-artifacts',
    exitCode: 1,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep('product-regression-handoff', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  return assertContains(result.output, [
    'release failure handoff',
    'gate-name=evidence-artifacts',
    'command=npm run verify:evidence-artifacts',
    'exit-code=1',
    'failure-class=product-regression',
    'key-marker=[product-regression] denied-path-audit-evidence',
    'session-id=sess_failure_handoff_123',
    'transcript-path=D:\\Test\\pca-home-synth\\.cheers\\sessions\\sess_failure_handoff_123\\transcript.jsonl',
    'evidence-inspector-command=npm run evidence:inspect -- --home D:/Test/pca-home-synth --session-id sess_failure_handoff_123',
    'evidence-inspector-command=npm run evidence:inspect -- --home D:/Test/pca-home-synth --project "D:/Test/evidence-artifacts-gate"',
    'next-action=Run the evidence inspector command above',
  ], 'product-regression-handoff')
}

async function verifyProviderNetworkHandoff() {
  const log = writeFixture('provider-network', [
    'gate name=provider-readiness',
    'mode=smoke',
    'HOME used=D:/Test/home-sf',
    '[provider-network-inconclusive] real-provider-cli-smoke - timed out',
    'fetch failed: provider endpoint unreachable',
  ].join('\n'))
  const result = await runHandoff({
    logFile: log,
    gate: 'provider-readiness',
    command: 'npm run verify:provider-readiness',
    exitCode: 2,
    home: realProviderHome,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep('provider-network-handoff', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  return assertContains(result.output, [
    'gate-name=provider-readiness',
    'exit-code=2',
    'failure-class=provider-network-inconclusive',
    'evidence-inspector-command=none',
    'next-action=Check provider/network reachability',
  ], 'provider-network-handoff')
}

async function verifyConfigFailureHandoff() {
  const log = writeFixture('config-failure', [
    'gate name=doctor-environment',
    'mode=env',
    '[config-failure] real-provider-config - D:\\Test\\home-sf\\.cheers\\config.json missing',
    'credential missing',
  ].join('\n'))
  const result = await runHandoff({
    logFile: log,
    gate: 'doctor-environment',
    command: 'npm run verify:doctor',
    exitCode: 3,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep('config-failure-handoff', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  return assertContains(result.output, [
    'gate-name=doctor-environment',
    'exit-code=3',
    'failure-class=config-failure',
    'next-action=Fix local environment/config/home/toolchain first',
    'handoff-exit-semantics=exit 0 means handoff summary was printed',
  ], 'config-failure-handoff')
}

async function main() {
  console.log('gate name=failure-handoff')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`fixtureRoot=${fixtureRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real-provider HOME=${realProviderHome}`)
  console.log('homeCreated=false')

  if (normalizeForCompare(repoRoot) !== normalizeForCompare(expectedRepoRoot)) {
    printStep('repo-root', 'config-failure', `expected=${expectedRepoRoot}`)
    process.exit(3)
  }
  if (!fs.existsSync(handoffPath)) {
    printStep('handoff-entry', 'config-failure', `${handoffPath} missing`)
    process.exit(3)
  }

  const productOk = await verifyProductRegressionHandoff()
  const providerOk = await verifyProviderNetworkHandoff()
  const configOk = await verifyConfigFailureHandoff()
  if (!productOk || !providerOk || !configOk) {
    console.log('[product-regression] failure-handoff')
    process.exit(1)
  }

  console.log('[pass] failure-handoff')
  process.exit(0)
}

main().catch((error) => {
  printStep('unexpected-error', 'product-regression', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
