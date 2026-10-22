#!/usr/bin/env node

import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  CONTRACT_EXIT_CODES,
  contractClassificationForExitCode,
} from './support/contract.mjs'

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

export function releaseGateFailure(label, exitCode) {
  const normalized = contractClassificationForExitCode(exitCode)
  return {
    ...normalized,
    message: `[${normalized.classification}] release-core - ${label} exited ${exitCode}`,
  }
}

function failGate(label, exitCode) {
  const failure = releaseGateFailure(label, exitCode)
  console.log(failure.message)
  process.exit(failure.exitCode)
}

export async function runReleaseCore() {
  console.log('gate name=release-core')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 execution-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)

  const doctorCode = await runNodeScript('verify-doctor-environment.mjs')
  if (doctorCode !== 0) failGate('doctor environment', doctorCode)

  const permissionCode = await runNodeScript('verify-permission-memory.mjs', ['hard'])
  if (permissionCode !== 0) failGate('permission-memory', permissionCode)

  const sessionLifecycleCode = await runNodeScript('verify-session-lifecycle.mjs')
  if (sessionLifecycleCode !== 0) failGate('session lifecycle', sessionLifecycleCode)

  const queryOrchestrationCode = await runNodeScript('verify-query-orchestration.mjs')
  if (queryOrchestrationCode !== 0) failGate('query orchestration', queryOrchestrationCode)

  const cliEntryCode = await runNodeScript('verify-cli-entry.mjs')
  if (cliEntryCode !== 0) failGate('cli entry', cliEntryCode)

  const mcpRoutingCode = await runNodeScript('verify-mcp-routing.mjs')
  if (mcpRoutingCode !== 0) failGate('mcp routing', mcpRoutingCode)

  const mcpLocalExecutionCode = await runNodeScript(
    'verify-mcp-local-execution.mjs',
    [],
    { CHEERS_RELEASE_CORE_WIRED: '1' },
  )
  if (mcpLocalExecutionCode !== 0) failGate('mcp-local-execution', mcpLocalExecutionCode)

  const resultContractCode = await runNodeScript('verify-result-contract.mjs')
  if (resultContractCode !== 0) failGate('result contract', resultContractCode)

  const workspaceSafetyCode = await runNodeScript('verify-workspace-safety.mjs')
  if (workspaceSafetyCode !== 0) failGate('workspace safety', workspaceSafetyCode)

  const evidenceArtifactsCode = await runNodeScript('verify-evidence-artifacts.mjs')
  if (evidenceArtifactsCode !== 0) failGate('evidence artifacts', evidenceArtifactsCode)

  const sessionDurabilityLongCode = await runNodeScript('verify-session-durability-long.mjs')
  if (sessionDurabilityLongCode !== 0) failGate('session-durability-long', sessionDurabilityLongCode)

  // Every gate above checks code. This one checks whether the prose that
  // describes the code still describes it. It is strict here: the current-state
  // documents it reads are clean, and --strict keeps them that way, so a refactor
  // that moves a file must also update what points at it.
  const docsDriftCode = await runNodeScript('verify-docs-and-rules-drift.mjs', ['--strict'])
  if (docsDriftCode !== 0) failGate('docs and rules drift', docsDriftCode)

  console.log('[pass] release-core')
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReleaseCore().catch(error => {
    console.error(`[execution-inconclusive] release-core failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = CONTRACT_EXIT_CODES.inconclusive
  })
}
