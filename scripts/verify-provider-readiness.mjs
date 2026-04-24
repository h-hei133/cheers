#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const realHome = 'D:/Test/home-sf'
const projectRoot = 'D:/Test/provider-readiness-smoke'
const fixturePath = `${projectRoot}/fixture.txt`

const networkFailurePattern =
  /(provider-readiness:network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable)/i
const configFailurePattern =
  /(provider-readiness:(missing-key|missing-config|auth|unsupported-provider)|missing.*config|api key|apikey|not connected|connect first|credentials|authentication was rejected|401|403)/i

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
    .slice(-18)
    .join('\n')
}

function loadConfig() {
  const configPath = path.join(realHome, '.private-agents', 'config.json')
  if (!fs.existsSync(realHome)) {
    return { ok: false, status: 'config-failure', reason: `${realHome} missing` }
  }
  if (!fs.existsSync(configPath)) {
    return { ok: false, status: 'config-failure', reason: `${configPath} missing` }
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return { ok: true, configPath, config }
  } catch (error) {
    return {
      ok: false,
      status: 'config-failure',
      reason: `Failed to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function resolveCredential(config) {
  const provider = typeof config.provider === 'string' ? config.provider : 'openai'
  const connections = Array.isArray(config.providerConnections) ? config.providerConnections : []
  const activeConnection = connections.find(
    (connection) => connection?.id === config.activeProviderConnectionId,
  ) ?? connections.find((connection) => connection?.provider === provider)
  const profile = config.providerCredentials?.[provider] ?? {}

  const source = activeConnection?.provider === provider && (activeConnection.apiKey || activeConnection.accountAuth)
    ? 'connection'
    : profile.apiKey || profile.accountAuth
      ? 'config'
      : process.env[getProviderEnvVar(provider)]
        ? 'env'
        : 'missing'
  const authMode = activeConnection?.provider === provider && activeConnection.accountAuth
    ? 'account-auth'
    : profile.accountAuth
      ? 'account-auth'
      : 'api-key'
  const baseUrl = activeConnection?.baseUrl ?? profile.baseUrl
  const model = activeConnection?.model ?? profile.model
  const hasCredential =
    source === 'env' ||
    Boolean(activeConnection?.apiKey || activeConnection?.accountAuth || profile.apiKey || profile.accountAuth)

  return {
    provider,
    activeConnectionId: activeConnection?.id ?? 'none',
    credentialSource: source,
    authMode,
    baseUrl,
    model,
    hasCredential,
  }
}

function getProviderEnvVar(provider) {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY'
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'google':
      return 'GOOGLE_API_KEY'
    case 'antigravity':
      return 'ANTIGRAVITY_API_KEY'
    case 'claudecode':
      return 'CLAUDECODE_API_KEY'
    default:
      return 'OPENAI_COMPATIBLE_API_KEY'
  }
}

function validateCredential(resolved) {
  if (resolved.credentialSource === 'missing' || !resolved.hasCredential) {
    return {
      ok: false,
      reason: `${getProviderEnvVar(resolved.provider)} or configured credential is missing`,
    }
  }
  if (['openai-compatible', 'google', 'antigravity', 'claudecode'].includes(resolved.provider)) {
    if (!resolved.baseUrl) return { ok: false, reason: `${resolved.provider} baseUrl is missing` }
    if (!resolved.model) return { ok: false, reason: `${resolved.provider} model is missing` }
  }
  return { ok: true }
}

function writeFixture() {
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.writeFileSync(
    fixturePath,
    ['provider readiness smoke fixture line 1', 'provider readiness smoke fixture line 2'].join('\n'),
    'utf8',
  )
}

function classifyCliFailure(result) {
  const output = result.output ?? ''
  if (configFailurePattern.test(output)) return { status: 'config-failure', code: 3 }
  if (result.timedOut || networkFailurePattern.test(output)) {
    return { status: 'provider-network-inconclusive', code: 2 }
  }
  return { status: 'product-regression', code: 1 }
}

async function runRealProviderSmoke() {
  writeFixture()
  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    projectRoot,
    '--provider',
    'openai-compatible',
    '--print',
    `read the first line from ${fixturePath}`,
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: realHome,
      USERPROFILE: realHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
    },
    timeoutMs: 300000,
  })

  if (result.code !== 0 || result.timedOut) {
    const classified = classifyCliFailure(result)
    printStep('real-provider-cli-smoke', classified.status, result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return { ok: false, ...classified }
  }

  const requiredMarkers = [
    'Result',
    'Outcome:',
  ]
  const missing = requiredMarkers.filter((marker) => !result.output.includes(marker))
  if (missing.length > 0) {
    printStep('real-provider-cli-smoke', 'product-regression', `missing=${missing.join(' | ')}`)
    console.log(summarizeOutput(result.output))
    return { ok: false, status: 'product-regression', code: 1 }
  }

  printStep('real-provider-cli-smoke', 'pass', 'structured result markers observed')
  return { ok: true, status: 'pass', code: 0 }
}

async function main() {
  console.log('gate name=provider-readiness')
  console.log('mode=smoke')
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log(`repo=${repoRoot}`)
  console.log(`HOME used=${realHome}`)
  console.log(`USERPROFILE used=${realHome}`)
  console.log('homeCreated=false')

  const loaded = loadConfig()
  if (!loaded.ok) {
    printStep('real-provider-config', loaded.status, loaded.reason)
    process.exit(3)
  }
  printStep('real-provider-config', 'pass', loaded.configPath)

  const resolved = resolveCredential(loaded.config)
  console.log(`provider=${resolved.provider}`)
  console.log(`activeConnection=${resolved.activeConnectionId}`)
  console.log(`credentialSource=${resolved.credentialSource}`)
  console.log(`authMode=${resolved.authMode}`)
  console.log(`endpoint=${resolved.baseUrl ?? 'none'}`)
  console.log(`model=${resolved.model ?? 'none'}`)
  const credentialOk = validateCredential(resolved)
  if (!credentialOk.ok) {
    printStep('real-provider-credential', 'config-failure', credentialOk.reason)
    process.exit(3)
  }
  printStep('real-provider-credential', 'pass', 'credential present (redacted)')

  const smoke = await runRealProviderSmoke()
  printStep('provider-readiness-smoke-gate', smoke.status)
  process.exit(smoke.code)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
