#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedRepoRoot = path.resolve('D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const vitestPath = path.join(tsShellRoot, 'node_modules', 'vitest', 'vitest.mjs')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const syntheticHome = 'D:/Test/pca-home-synth'
const realProviderHome = 'D:/Test/home-sf'
const targetProject = 'D:/Test/workspace-safety-gate'
const targetFile = `${targetProject}/scripts/workspace_safety.py`
const editTargetFile = `${targetProject}/src/edit-target.ts`
const repoLeakFile = path.join(repoRoot, 'scripts', 'workspace_safety.py')

function normalizeForCompare(input) {
  const resolved = path.resolve(input).replace(/\\/g, '/')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
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
    .slice(-16)
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

function writeFixture() {
  fs.mkdirSync(path.join(targetProject, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(targetProject, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(targetProject, 'package.json'),
    JSON.stringify({ name: 'workspace-safety-gate', private: true }, null, 2),
    'utf8',
  )
  fs.writeFileSync(editTargetFile, "export const marker = 'v1';\n", 'utf8')
}

function assertMarkers(output, markers, label) {
  const missing = markers.filter((marker) => !output.includes(marker))
  if (missing.length > 0) {
    printStep(label, 'product-regression', `missing=${missing.join(' | ')}`)
    console.log(summarizeOutput(output))
    return false
  }
  printStep(label, 'pass')
  return true
}

async function runSyntheticMutationSmoke() {
  writeFixture()

  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
  }
  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    targetProject,
    '--print',
    'Create a python script at scripts/workspace_safety.py with content: print("workspace safety")',
  ], { cwd: tsShellRoot, env, timeoutMs: 240000 })

  if (result.code !== 0 || result.timedOut) {
    printStep('workspace-safety-synthetic-write', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }

  const markersOk = assertMarkers(result.output, [
    'Result',
    'Outcome: success',
    'Action result',
    'Task: write-file',
    'Changed: 1 file(s)',
  ], 'workspace-safety-synthetic-write-markers')

  if (!fs.existsSync(targetFile)) {
    printStep('changed-files-evidence', 'product-regression', `${targetFile} missing`)
    return false
  }
  printStep('changed-files-evidence', 'pass', targetFile)

  if (fs.existsSync(repoLeakFile)) {
    printStep('repo-boundary-leak-check', 'product-regression', `${repoLeakFile} should not exist`)
    return false
  }
  printStep('repo-boundary-leak-check', 'pass', 'no repo-root workspace_safety.py created')

  return markersOk
}

async function runSyntheticEditSmoke() {
  writeFixture()

  const env = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
  }
  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    targetProject,
    '--print',
    'Edit src/edit-target.ts and replace v1 with v2',
  ], { cwd: tsShellRoot, env, timeoutMs: 240000 })

  if (result.code !== 0 || result.timedOut) {
    printStep('workspace-safety-synthetic-edit', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return false
  }

  const markersOk = assertMarkers(result.output, [
    'Result',
    'Outcome: success',
    'Action result',
    'Task: edit-file',
    'Changed: 1 file(s)',
  ], 'workspace-safety-synthetic-edit-markers')

  const edited = fs.existsSync(editTargetFile) ? fs.readFileSync(editTargetFile, 'utf8') : ''
  if (!edited.includes('v2')) {
    printStep('edit-changed-files-evidence', 'product-regression', `${editTargetFile} did not contain v2`)
    return false
  }
  printStep('edit-changed-files-evidence', 'pass', editTargetFile)

  return markersOk
}

async function main() {
  console.log('gate name=workspace-safety')
  console.log('mode=hard')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`target project=${targetProject}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real-provider HOME=${realProviderHome}`)
  console.log('homeCreated=false')

  if (normalizeForCompare(repoRoot) !== normalizeForCompare(expectedRepoRoot)) {
    printStep('repo-root', 'config-failure', `expected=${expectedRepoRoot}`)
    process.exit(3)
  }
  if (!fs.existsSync(syntheticHome)) {
    printStep('synthetic-home', 'config-failure', `${syntheticHome} missing`)
    process.exit(3)
  }
  if (!fs.existsSync(realProviderHome)) {
    printStep('real-provider-home', 'config-failure', `${realProviderHome} missing`)
    process.exit(3)
  }
  printStep('home-boundary', 'pass', 'existing synthetic/real homes only')

  const checks = []
  checks.push(await runFocusedTest(
    'sandbox-workspace-boundary-tests',
    'src/sandbox/sandbox.test.ts',
    'denies out-of-workspace writes and network access by default|normalizes traversal and sibling-prefix paths before workspace boundary checks|keeps Windows drive, case, and slash variants inside the same normalized boundary',
  ))
  checks.push(await runFocusedTest(
    'tool-runtime-denial-tests',
    'src/core/tools/runtime.test.ts',
    'returns explicit denial result for non-allowlisted tools|keeps registry and runtime execution working through the new core layer',
  ))
  checks.push(await runSyntheticMutationSmoke())
  checks.push(await runSyntheticEditSmoke())

  printStep('rejected-mutation-evidence', checks[0] ? 'pass' : 'product-regression', 'traversal and sibling-prefix writes denied by sandbox policy')
  printStep('workspace-safety-hard-gate', checks.every(Boolean) ? 'pass' : 'product-regression')
  process.exit(checks.every(Boolean) ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
