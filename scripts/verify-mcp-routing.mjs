#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = path.join(tsShellRoot, 'node_modules', 'vitest', 'vitest.mjs')
const syntheticHome = 'D:/Test/pca-home-synth'

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

async function main() {
  console.log('gate name=mcp-routing')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log('external MCP server used=false')
  console.log('homeCreated=false')

  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }

  const checks = []
  checks.push(await runFocusedTest(
    'mcp-gateway-config-snapshot-routing-tests',
    'src/core/mcp/gateway.test.ts',
    'loads user and project MCP configs into scoped configs|maps auth-required and invalid transport configs into explicit client states|aggregates tools/resources/prompts through the gateway snapshot|drops stale cached clients when a server disappears on the next snapshot|invalidates cached clients when reconnect reveals auth is now required|refresh supports target/all and rejects unknown server targets',
  ))
  checks.push(await runFocusedTest(
    'mcp-tool-runtime-stale-reconnect-tests',
    'src/core/tools/runtime.mcp-stale-reconnect.test.ts',
    'keeps stale descriptor visibility and execute rejection aligned after reconnect downgrades capability state',
  ))
  checks.push(await runFocusedTest(
    'mcp-tool-prefilter-visibility-tests',
    'src/core/tools/prefilter.test.ts',
    'hides MCP tools when MCP visibility is disabled|hides tools by prefix before model exposure|applies combined MCP \\+ disabled \\+ prefix rules deterministically',
  ))
  checks.push(await runFocusedTest(
    'mcp-slash-route-visibility-tests',
    'src/core/commands/slashRouter.test.ts',
    'routes /cancel, /sessions, /workspace, /mcp, /help, /view, and /permissions as shell actions|hides /mcp when MCP command exposure is disabled',
  ))

  const ok = checks.every(Boolean)
  printStep('mcp-routing-hard-gate', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
