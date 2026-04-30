#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = path.join(tsShellRoot, 'node_modules', 'vitest', 'vitest.mjs')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const syntheticHome = 'D:/Test/pca-home-synth'
const projectRoot = 'D:/Test/result-contract-gate'
const fixturePath = `${projectRoot}/fixture.txt`
const replayPath = `${projectRoot}/replay.txt`

const successResultMarkers = [
  'Result',
  'Outcome: success',
  'Action result',
  'Task: read-file',
  'Verification: not-requested',
  'Read result for D:/Test/result-contract-gate/fixture.txt:',
  'result contract fixture line 1',
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

async function runFocusedTest(name, file, pattern, timeoutMs = 180000) {
  const result = await run(process.execPath, [vitestPath, 'run', file, '-t', pattern], {
    cwd: tsShellRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    },
    timeoutMs,
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

function writeFixtures() {
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.writeFileSync(
    fixturePath,
    ['result contract fixture line 1', 'result contract fixture line 2'].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    replayPath,
    `read the first line from ${fixturePath}\n`,
    'utf8',
  )
}

async function runSyntheticPrintReplayContract() {
  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    return { ok: false, code: 3 }
  }
  writeFixtures()

  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
  }
  const printResult = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    projectRoot,
    '--print',
    `read the first line from ${fixturePath}`,
  ], { cwd: tsShellRoot, env, timeoutMs: 240000 })
  if (printResult.code !== 0 || printResult.timedOut) {
    printStep('result-contract-synthetic-print', 'product-regression', printResult.timedOut ? 'timed out' : `exit=${printResult.code}`)
    console.log(summarizeOutput(printResult.output))
    return { ok: false, code: 1 }
  }
  const printOk = assertMarkers(printResult.output, successResultMarkers, 'result-contract-synthetic-print')

  const replayResult = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    projectRoot,
    '--replay-file',
    replayPath,
  ], { cwd: tsShellRoot, env, timeoutMs: 240000 })
  if (replayResult.code !== 0 || replayResult.timedOut) {
    printStep('result-contract-synthetic-replay', 'product-regression', replayResult.timedOut ? 'timed out' : `exit=${replayResult.code}`)
    console.log(summarizeOutput(replayResult.output))
    return { ok: false, code: 1 }
  }
  const replayOk = assertMarkers(replayResult.output, [...successResultMarkers, 'Replay mode: running 1 prompt(s)'], 'result-contract-synthetic-replay')
  return { ok: printOk && replayOk, code: printOk && replayOk ? 0 : 1 }
}

async function main() {
  console.log('gate name=result-contract')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log('homeCreated=false')

  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }

  const checks = []
  checks.push(await runFocusedTest(
    'result-mapper-terminal-contract-tests',
    'src/core/query/resultMapper.test.ts',
    'preserves explicit terminalClassification when provided|falls back to reason-based classification when terminalClassification is missing|keeps successful edits successful when verification is blocked|still stops when verification is blocked without an applied edit|maps verification failure to a stopped terminal result|maps hard tool failures to an error terminal result|maps insufficient evidence without mutation to a stopped terminal result',
  ))
  checks.push(await runFocusedTest(
    'query-terminal-classification-tests',
    'src/core/query/QueryEngine.test.ts',
    'executes planner -> coder -> reviewer through the core query loop|exposes explicit terminal stop reasons for invalid handoff|terminates with stopped_error after retry budget is exhausted',
  ))
  checks.push(await runFocusedTest(
    'provider-readiness-terminal-result-test',
    'src/core/shell/providerReadiness.test.ts',
    'maps readiness failure into a unified stopped_error terminal event',
  ))

  const cliGate = await runSyntheticPrintReplayContract()
  if (cliGate.code === 3) process.exit(3)
  checks.push(cliGate.ok)

  const ok = checks.every(Boolean)
  printStep('result-contract-hard-gate', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
