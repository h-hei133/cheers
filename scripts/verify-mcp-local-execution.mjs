#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getSyntheticHome } from './support/testPaths.mjs'
import { resolveVitestPath } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = resolveVitestPath(repoRoot, tsShellRoot)
const syntheticHome = getSyntheticHome()

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
    }, options.timeoutMs ?? 180000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        code: -1,
        timedOut: false,
        stdout,
        stderr: `${stderr}${error.message}`,
        output: `${stdout}${stderr}${error.message}`,
      })
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
    .slice(-16)
    .join('\n')
}

async function runFocusedTest(name, file, pattern, timeoutMs = 180000) {
  const args = [vitestPath, 'run', file]
  if (pattern) {
    args.push('-t', pattern)
  }
  const result = await run(process.execPath, args, {
    cwd: tsShellRoot,
    env: {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      CHEERS_PROVIDER_MODE: 'synthetic',
      CHEERS_REAL_HOME: '',
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

async function main() {
  console.log('gate name=mcp-local-execution')
  console.log('mode=synthetic')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log('realProviderTouched=false')
  console.log('externalMcpServerUsed=false')
  console.log('userMcpConfigUsed=false')
  console.log('localStdioFixture=src/core/mcp/fixtures/mockMcpServer.mjs')
  console.log(`releaseCoreWired=${process.env.CHEERS_RELEASE_CORE_WIRED === '1' ? 'true' : 'false'}`)
  console.log('userVisibleSurface=focused-shell-runtime')
  console.log('cliEntryExecutionProof=not-covered')
  console.log('homeCreated=false')

  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }

  const checks = []
  checks.push(await runFocusedTest(
    'mcp-local-execution-focused-tests',
    'src/core/mcp/localExecutionGate.test.ts',
  ))
  checks.push(await runFocusedTest(
    'mcp-runtime-stale-unavailable-regression-tests',
    'src/core/tools/runtime.mcp-stale-reconnect.test.ts',
    'keeps stale descriptor visibility and execute rejection aligned after reconnect downgrades capability state|hides stale descriptors and preserves blocker evidence when reconnect finds an unavailable server|returns a clear blocker for unknown MCP tool execution|treats MCP isError tool responses as failed execution instead of success|keeps thrown MCP execution failures on the MCP execution boundary',
  ))

  const ok = checks.every(Boolean)
  printStep('mcp-local-execution-gate', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
