#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const realProviderEnvKeys = [
  'PRIVATE_AGENTS_REAL_HOME',
  'PRIVATE_AGENTS_REAL_PROVIDER_SMOKE',
  'PRIVATE_AGENTS_PROVIDER_ENV',
  'PRIVATE_AGENTS_REAL_PROVIDER_ENV',
  'PRIVATE_AGENTS_REAL_PROVIDER',
  'PRIVATE_AGENTS_PROVIDER',
  'PRIVATE_AGENTS_REAL_API_KEY',
  'PRIVATE_AGENTS_REAL_BASE_URL',
  'PRIVATE_AGENTS_REAL_MODEL',
]

function deterministicEnv() {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  for (const key of realProviderEnvKeys) {
    delete env[key]
  }
  env.PRIVATE_AGENTS_RELEASE_DETERMINISTIC = '1'
  return env
}

function runStep(step) {
  return new Promise((resolve) => {
    console.log(`[run] ${step.label}`)
    let stdout = ''
    let stderr = ''
    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      env: deterministicEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('close', (code) => resolve({ code: code ?? 1, output: `${stdout}${stderr}` }))
    child.on('error', () => resolve({ code: 3, output: `${stdout}${stderr}` }))
  })
}

function statusForCode(code) {
  if (code === 0) return 'pass'
  if (code === 2) return 'provider-network-inconclusive'
  if (code === 3) return 'config-failure'
  return 'product-regression'
}

const steps = [
  {
    label: 'build-ts-shell',
    command: npmBin,
    args: ['run', 'build', '-w', 'packages/ts-shell'],
  },
  {
    label: 'cli-baseline-full',
    command: npmBin,
    args: ['run', 'test', '-w', 'packages/ts-shell', '--', 'src/cli-baseline.test.ts'],
  },
  {
    label: 'release-core',
    command: npmBin,
    args: ['run', 'verify:release:core'],
  },
  {
    label: 'real-user-capabilities-mvp',
    command: npmBin,
    args: ['run', 'verify:real-user-capabilities', '--', '--tier=mvp'],
  },
  {
    label: 'candidate-mutation-synthetic',
    command: npmBin,
    args: ['run', 'verify:real-user-capabilities', '--', '--suite=candidate-mutation'],
    assertOutput(output) {
      return output.includes('realProviderTouched=false')
    },
  },
  {
    label: 'candidate-mutation-real-dry-run',
    command: npmBin,
    args: [
      'run',
      'verify:real-user-capabilities',
      '--',
      '--suite=candidate-mutation',
      '--include-real',
      '--dry-run',
    ],
    assertOutput(output) {
      return (
        output.includes('mode=dry-run') &&
        output.includes('real-provider execution skipped') &&
        output.includes('realProviderTouched=false')
      )
    },
  },
  {
    label: 'provider-readiness-real-default-skip',
    command: npmBin,
    args: ['run', 'verify:provider-readiness:real'],
    assertOutput(output) {
      return (
        output.includes('configSource=not-loaded-no-opt-in') &&
        output.includes('real-provider-home-read=false') &&
        output.includes('[skip] real-provider-readiness-opt-in')
      )
    },
  },
  {
    label: 'provider-readiness-real-classification-self-test',
    command: npmBin,
    args: ['run', 'verify:provider-readiness:real', '--', '--classification-self-test'],
  },
]

console.log('gate name=release-deterministic')
console.log('mode=deterministic-meta')
console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
console.log(`repo=${repoRoot}`)
console.log('realProviderTouched=false')
console.log('candidateMutationRealExecuted=false')
console.log('externalMcpServerUsed=false')
console.log('userMcpConfigUsed=false')
console.log('realProviderOptInEnvCleared=true')
console.log('releaseClaim=deterministic-release-candidate-ready')
console.log('broadReleaseReady=false')

for (const step of steps) {
  const { code, output } = await runStep(step)
  if (code !== 0) {
    const status = statusForCode(code)
    console.log(`[${status}] release-deterministic - ${step.label} exited ${code}`)
    process.exit(code === 2 || code === 3 ? code : 1)
  }
  if (step.assertOutput && !step.assertOutput(output)) {
    console.log(`[product-regression] release-deterministic - ${step.label} output contract failed`)
    process.exit(1)
  }
  console.log(`[pass] ${step.label}`)
}

console.log('realProviderTouched=false')
console.log('candidateMutationRealExecuted=false')
console.log('externalMcpServerUsed=false')
console.log('[pass] release-deterministic')
process.exit(0)
