#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSyntheticHome } from './support/testPaths.mjs'
import { resolveVitestPath } from './support/scriptRuntime.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = resolveVitestPath(repoRoot, tsShellRoot)
const syntheticHome = getSyntheticHome()

const scenarios = [
  ['local-deterministic-success', 'true', 'true', 'true', 'true', 'not-requested', 'success', 'success', 'none'],
  ['invalid-config', 'false', 'false', 'false', 'false', 'not-requested', 'config', 'stopped', 'user-config'],
  ['missing-command-spawn-failure', 'true', 'true', 'false', 'false', 'not-requested', 'stdio-process', 'stopped', 'server-availability'],
  ['auth-required-permission-denied', 'true', 'false', 'stale-descriptor', 'false', 'denied', 'permission-denied', 'stopped', 'permission'],
  ['unknown-tool-unavailable', 'false', 'false', 'false', 'false', 'not-requested', 'tool-unavailable', 'stopped', 'tool-level'],
  ['tool-is-error', 'true', 'true', 'true', 'true', 'not-requested', 'tool-is-error', 'stopped', 'tool-level'],
  ['stdio-process-throw', 'true', 'true', 'true', 'true', 'not-requested', 'stdio-process', 'stopped', 'server-availability'],
  ['malformed-tool-result', 'true', 'true', 'true', 'true', 'not-requested', 'malformed-result', 'stopped', 'protocol-level'],
  ['malformed-list-tools-protocol', 'true', 'true', 'false', 'false', 'not-requested', 'protocol', 'stopped', 'protocol-level'],
]

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      output += chunk.toString()
    })
    child.on('close', code => resolve({ code: code ?? 1, output }))
    child.on('error', error => resolve({ code: 1, output: `${output}${error.message}` }))
  })
}

console.log('gate name=mcp-error-taxonomy')
console.log('mode=synthetic')
console.log('status taxonomy: pass=0 product-regression=1 config-failure=3')
console.log(`repo=${repoRoot}`)
console.log(`synthetic HOME=${syntheticHome}`)
console.log('realProviderTouched=false')
console.log('externalMcpServerUsed=false')
console.log('userMcpConfigUsed=false')
console.log('externalMcpReadinessClaimed=false')
console.log('defaultGateChanged=false')
console.log('scenario|executionAttempted|serverProcessStarted|toolVisible|toolInvoked|permission|classification|terminalOutcome|failurePlane')
for (const scenario of scenarios) {
  console.log(scenario.join('|'))
}

const env = {}
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string') env[key] = value
}
env.HOME = syntheticHome
env.USERPROFILE = syntheticHome
env.PRIVATE_AGENTS_PROVIDER_MODE = 'synthetic'
env.PRIVATE_AGENTS_REAL_HOME = ''

const result = await run(
  process.execPath,
  [vitestPath, 'run', 'src/core/mcp/errorTaxonomy.test.ts'],
  { cwd: tsShellRoot, env },
)

if (result.code !== 0) {
  console.log(`[product-regression] mcp-error-taxonomy-focused-tests - exit=${result.code}`)
  console.log(result.output.split(/\r?\n/).filter(Boolean).slice(-24).join('\n'))
  process.exit(1)
}

console.log('[pass] mcp-error-taxonomy-focused-tests')
console.log('[pass] mcp-error-taxonomy')
process.exit(0)
