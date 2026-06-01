#!/usr/bin/env node

import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveVitestPath } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const rustCoreRoot = path.join(repoRoot, 'packages', 'rust-core')
const vitestPath = resolveVitestPath(repoRoot, tsShellRoot)

function parseMode(argv) {
  const mode = argv[2] ?? 'hard'
  if (!['hard', 'env'].includes(mode)) {
    console.error('Usage: node scripts/verify-rust-execution.mjs [hard|env]')
    process.exit(3)
  }
  return mode
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const env = {}
    for (const [key, value] of Object.entries({ ...process.env, ...(options.env ?? {}) })) {
      if (typeof value === 'string') env[key] = value
    }
    const isWindowsCmd = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
    const spawnCommand = isWindowsCmd ? 'cmd.exe' : command
    const spawnArgs = isWindowsCmd ? ['/d', '/s', '/c', command, ...args] : args
    const child = spawn(spawnCommand, spawnArgs, {
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

function printHeader(name, mode) {
  console.log(`gate name=${name}`)
  console.log(`mode=${mode}`)
  console.log(`repo=${repoRoot}`)
}

function printStep(name, status, detail = '') {
  const suffix = detail ? ` - ${detail}` : ''
  console.log(`[${status}] ${name}${suffix}`)
}

function summarizeOutput(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .join('\n')
}

async function checkTool(name, command, args) {
  const result = await run(command, args, { timeoutMs: 30000 })
  if (result.code !== 0 || result.timedOut) {
    printStep(name, 'config-failure', result.timedOut ? 'timed out' : summarizeOutput(result.output))
    return false
  }
  printStep(name, 'pass', result.stdout.trim().split(/\r?\n/)[0] ?? '')
  return true
}

async function runEnvGate() {
  printHeader('rust-execution', 'env')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  const checks = []
  checks.push(await checkTool('node-toolchain', process.execPath, ['--version']))
  checks.push(await checkTool('npm-toolchain', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']))
  checks.push(await checkTool('cargo-toolchain', 'cargo', ['--version']))
  checks.push(await checkTool('rustc-toolchain', 'rustc', ['--version']))
  const ok = checks.every(Boolean)
  printStep('rust-execution-env-gate', ok ? 'pass' : 'config-failure')
  return ok
}

async function runVitestFile(name, file) {
  const result = await run(process.execPath, [vitestPath, 'run', file], {
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

async function runCargoTests() {
  const result = await run('cargo', ['test'], {
    cwd: rustCoreRoot,
    timeoutMs: 240000,
  })
  if (result.code !== 0 || result.timedOut) {
    printStep('rust-core-cargo-tests', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }
  printStep('rust-core-cargo-tests', 'pass')
  return true
}

async function runHardGate() {
  printHeader('rust-execution', 'hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  const envOk = await runEnvGate()
  if (!envOk) return { ok: false, code: 3 }

  const checks = []
  checks.push(await runVitestFile('daemon-client-contract-tests', 'src/daemon/client.test.ts'))
  checks.push(await runVitestFile('registry-rust-bridge-tests', 'src/core/tools/registry-rust-bridge.test.ts'))
  checks.push(await runVitestFile('daemon-parity-tests', 'src/daemon/parity.test.ts'))
  checks.push(await runCargoTests())

  const ok = checks.every(Boolean)
  printStep('rust-execution-hard-gate', ok ? 'pass' : 'product-regression')
  return { ok, code: ok ? 0 : 1 }
}

const mode = parseMode(process.argv)
if (mode === 'env') {
  const ok = await runEnvGate()
  process.exit(ok ? 0 : 3)
}
const result = await runHardGate()
process.exit(result.code)
