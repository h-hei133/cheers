#!/usr/bin/env node

import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runNodeScript(script, args = [], extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', script), ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(3))
  })
}

console.log('gate name=release-core')
console.log('mode=hard')
console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
console.log(`repo=${repoRoot}`)

const doctorCode = await runNodeScript('verify-doctor-environment.mjs')
if (doctorCode !== 0) {
  const status = doctorCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - doctor environment exited ${doctorCode}`)
  process.exit(doctorCode === 3 ? 3 : 1)
}

const permissionCode = await runNodeScript('verify-permission-memory.mjs', ['hard'])
if (permissionCode !== 0) {
  console.log(`[product-regression] release-core - permission-memory exited ${permissionCode}`)
  process.exit(permissionCode)
}

const rustEnvCode = await runNodeScript('verify-rust-execution.mjs', ['env'])
if (rustEnvCode !== 0) {
  console.log(`[config-failure] release-core - rust env exited ${rustEnvCode}`)
  process.exit(3)
}

const rustHardCode = await runNodeScript('verify-rust-execution.mjs', ['hard'])
if (rustHardCode !== 0) {
  const status = rustHardCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - rust execution exited ${rustHardCode}`)
  process.exit(rustHardCode)
}

const sessionLifecycleCode = await runNodeScript('verify-session-lifecycle.mjs')
if (sessionLifecycleCode !== 0) {
  const status = sessionLifecycleCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - session lifecycle exited ${sessionLifecycleCode}`)
  process.exit(sessionLifecycleCode)
}

const queryOrchestrationCode = await runNodeScript('verify-query-orchestration.mjs')
if (queryOrchestrationCode !== 0) {
  const status = queryOrchestrationCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - query orchestration exited ${queryOrchestrationCode}`)
  process.exit(queryOrchestrationCode)
}

const cliEntryCode = await runNodeScript('verify-cli-entry.mjs')
if (cliEntryCode !== 0) {
  const status = cliEntryCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - cli entry exited ${cliEntryCode}`)
  process.exit(cliEntryCode)
}

const mcpRoutingCode = await runNodeScript('verify-mcp-routing.mjs')
if (mcpRoutingCode !== 0) {
  const status = mcpRoutingCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - mcp routing exited ${mcpRoutingCode}`)
  process.exit(mcpRoutingCode)
}

const mcpLocalExecutionCode = await runNodeScript(
  'verify-mcp-local-execution.mjs',
  [],
  { PRIVATE_AGENTS_RELEASE_CORE_WIRED: '1' },
)
if (mcpLocalExecutionCode !== 0) {
  const status = mcpLocalExecutionCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - mcp-local-execution exited ${mcpLocalExecutionCode}`)
  process.exit(mcpLocalExecutionCode)
}

const resultContractCode = await runNodeScript('verify-result-contract.mjs')
if (resultContractCode !== 0) {
  const status = resultContractCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - result contract exited ${resultContractCode}`)
  process.exit(resultContractCode)
}

const workspaceSafetyCode = await runNodeScript('verify-workspace-safety.mjs')
if (workspaceSafetyCode !== 0) {
  const status = workspaceSafetyCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - workspace safety exited ${workspaceSafetyCode}`)
  process.exit(workspaceSafetyCode)
}

const evidenceArtifactsCode = await runNodeScript('verify-evidence-artifacts.mjs')
if (evidenceArtifactsCode !== 0) {
  const status = evidenceArtifactsCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - evidence artifacts exited ${evidenceArtifactsCode}`)
  process.exit(evidenceArtifactsCode)
}

const sessionDurabilityLongCode = await runNodeScript('verify-session-durability-long.mjs')
if (sessionDurabilityLongCode !== 0) {
  console.log(`[product-regression] release-core - session-durability-long exited ${sessionDurabilityLongCode}`)
  process.exit(sessionDurabilityLongCode)
}

// Every gate above checks code. This one checks whether the prose that
// describes the code still describes it. It is strict here: the current-state
// documents it reads are clean, and --strict keeps them that way, so a refactor
// that moves a file must also update what points at it.
const docsDriftCode = await runNodeScript('verify-docs-and-rules-drift.mjs', ['--strict'])
if (docsDriftCode !== 0) {
  const status = docsDriftCode === 3 ? 'config-failure' : 'product-regression'
  console.log(`[${status}] release-core - docs and rules drift exited ${docsDriftCode}`)
  process.exit(docsDriftCode)
}

console.log('[pass] release-core')
process.exit(0)
