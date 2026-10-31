#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  getRealProviderHome,
  getSyntheticHome,
} from './support/testPaths.mjs'
import { pathsEqual } from './support/scriptRuntime.mjs'
import { inspectRuntimeConfig } from './support/config.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedRepoRoot = 'D:\\LenovoSoftstore\\pyproject\\source-claudecode\\private-coding-agents'
const syntheticHome = getSyntheticHome()
const realHome = getRealProviderHome({ allowDefault: true })
const requiredCommands = [
  'verify:permission-memory',
  'verify:session-lifecycle',
  'verify:query-orchestration',
  'verify:cli-entry',
  'verify:mcp-routing',
  'verify:result-contract',
  'evidence:inspect',
  'verify:evidence-inspector',
  'verify:provider-readiness',
  'verify:release:core',
  'verify:release:smoke',
]

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
    }, options.timeoutMs ?? 30000)

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

async function checkTool(name, command, args, required = true) {
  const result = await run(command, args)
  if (result.code !== 0 || result.timedOut) {
    const status = required ? 'config-failure' : 'pass'
    const detail = required
      ? (result.timedOut ? 'timed out' : `missing or failed: ${String(result.output).trim().split(/\r?\n/)[0] ?? ''}`)
      : 'not required for current npm-based gates'
    printStep(name, status, detail)
    return !required
  }
  printStep(name, 'pass', result.stdout.trim().split(/\r?\n/)[0] ?? '')
  return true
}

function normalizePath(value) {
  return path.resolve(value).toLowerCase()
}

function loadPackageJson() {
  const packagePath = path.join(repoRoot, 'package.json')
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch (error) {
    printStep('package-json', 'config-failure', error instanceof Error ? error.message : String(error))
    return null
  }
}

function checkRepoRoot() {
  const cwdOk = pathsEqual(process.cwd(), repoRoot)
  const expectedOk = process.platform === 'win32'
    ? normalizePath(repoRoot) === normalizePath(expectedRepoRoot)
    : repoRoot === path.resolve(repoRoot)
  if (!cwdOk || !expectedOk) {
    printStep(
      'repo-root',
      'config-failure',
      `cwd=${process.cwd()} repo=${repoRoot} expected=${expectedRepoRoot}`,
    )
    return false
  }
  printStep('repo-root', 'pass', repoRoot)
  return true
}

function checkHome(name, homePath) {
  if (!homePath) {
    printStep(name, 'pass', 'not-configured')
    return true
  }
  if (!fs.existsSync(homePath)) {
    printStep(name, 'config-failure', `${homePath} missing`)
    return false
  }
  printStep(name, 'pass', homePath)
  return true
}

async function checkRealProviderConfig() {
  if (!realHome) {
    printStep('real-provider-config', 'pass', 'not-configured')
    printStep('real-provider-credential', 'pass', 'not-checked')
    return true
  }
  const result = await inspectRuntimeConfig(realHome, repoRoot)
  if (!result.ok || !result.present) {
    printStep('real-provider-config', 'config-failure', result.reason ?? 'No user configuration document is present.')
    return false
  }
  printStep('real-provider-config', 'pass', 'selected configuration documents parsed; values not reported')
  printStep('real-provider-credential', 'pass', 'authentication not checked')
  return true
}

async function checkSyntheticModeEnv() {
  const result = await run(process.execPath, ['-e', 'console.log(`${process.env.CHEERS_PROVIDER_MODE}|${process.env.HOME}|${process.env.USERPROFILE}`)'], {
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
    },
  })
  const expected = `synthetic|${syntheticHome}|${syntheticHome}`
  if (result.code !== 0 || result.timedOut || result.stdout.trim() !== expected) {
    printStep('synthetic-mode-env', 'config-failure', `observed=${result.stdout.trim()}`)
    return false
  }
  printStep('synthetic-mode-env', 'pass', expected)
  return true
}

function checkReleaseCommands(packageJson) {
  const scripts = packageJson?.scripts ?? {}
  const missing = requiredCommands.filter((command) => !scripts[command])
  if (missing.length > 0) {
    printStep('release-commands', 'product-regression', `missing=${missing.join(', ')}`)
    return false
  }
  printStep('release-commands', 'pass', requiredCommands.join(', '))
  console.log(`triage-command= npm run evidence:inspect -- --home ${syntheticHome} --latest`)
  console.log('triage-command-project= npm run evidence:inspect -- --home <home> --project <project-root>')
  console.log('triage-note=Use evidence:inspect after release gate failures to correlate transcript-path, state-path, tool-result, approval-event, and changed-file evidence.')
  return true
}

async function main() {
  console.log('gate name=doctor-environment')
  console.log('mode=env')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`workingDirectory=${process.cwd()}`)
  console.log(`repo=${repoRoot}`)
  console.log(`syntheticHome=${syntheticHome}`)
  console.log(`realProviderHome=${realHome ?? 'not-configured'}`)
  console.log('homeCreated=false')

  const checks = []
  checks.push(checkRepoRoot())
  const packageJson = loadPackageJson()
  checks.push(Boolean(packageJson))
  checks.push(await checkTool('node-toolchain', process.execPath, ['--version']))
  checks.push(await checkTool('npm-toolchain', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version']))
  checks.push(await checkTool('pnpm-toolchain', process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], false))
  checks.push(checkHome('synthetic-home', syntheticHome))
  checks.push(checkHome('real-provider-home', realHome))
  checks.push(await checkSyntheticModeEnv())
  checks.push(await checkRealProviderConfig())
  checks.push(checkReleaseCommands(packageJson))

  const ok = checks.every(Boolean)
  printStep('doctor-environment-gate', ok ? 'pass' : 'config-failure')
  process.exit(ok ? 0 : 3)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
