#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const classificationSelfTest = process.argv.includes('--classification-self-test')
const help = process.argv.includes('--help') || process.argv.includes('-h')

const allowedProviders = new Set([
  'openai',
  'openai-compatible',
  'google',
  'antigravity',
  'claudecode',
])
const compatibleProviders = new Set([
  'openai-compatible',
  'google',
  'antigravity',
  'claudecode',
])

const realHomePathPattern =
  /(?:\/[^\s"'`<>]*\.private-agents-real|[A-Za-z]:[\\/]+Test[\\/]+home-sf)(?:[\\/][^\s"'`<>]*)?/gi
const providerConfigPathPattern =
  /(?:\/[^\s"'`<>]*|[A-Za-z]:[\\/][^\s"'`<>]*)?[\\/]\.private-agents[\\/]config\.json/gi
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi

function usage() {
  console.log('Usage: npm run verify:provider-readiness:real')
  console.log('')
  console.log('Default behavior: skip unless PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 is set.')
  console.log('Required opt-in env:')
  console.log('  PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1')
  console.log('  PRIVATE_AGENTS_TEST_ROOT=<isolated test root>')
  console.log('  PRIVATE_AGENTS_REAL_PROVIDER=openai|openai-compatible|google|antigravity|claudecode')
  console.log('  PRIVATE_AGENTS_REAL_API_KEY=<provider api key>')
  console.log('  PRIVATE_AGENTS_REAL_BASE_URL=<base url>   required for OpenAI-compatible style providers')
  console.log('  PRIVATE_AGENTS_REAL_MODEL=<model>         required for OpenAI-compatible style providers')
  console.log('')
  console.log('This smoke refuses PRIVATE_AGENTS_REAL_HOME and never reads real user provider config.')
}

function printHeader(mode) {
  console.log('gate name=real-provider-readiness-smoke')
  console.log(`mode=${mode}`)
  console.log('status taxonomy: pass=0 product-regression=1 network=2 missing-config/missing-key/auth/unsupported=3')
  console.log('configSource=explicit-env')
  console.log('real-provider-home-read=false')
}

function printStep(name, status, detail = '') {
  const suffix = detail ? ` - ${redact(detail)}` : ''
  console.log(`[${status}] ${name}${suffix}`)
}

function redact(input) {
  return String(input ?? '')
    .replace(
      authorizationBearerPattern,
      (_match, prefix, quote) => `${prefix}${quote}Bearer [REDACTED]`,
    )
    .replace(bearerTokenPattern, 'Bearer [REDACTED]')
    .replace(
      keyValueSecretPattern,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    )
    .replace(openAiStyleKeyPattern, '[REDACTED_API_KEY]')
    .replace(secretQueryParamPattern, '$1[REDACTED]')
    .replace(realHomePathPattern, '[REAL_PROVIDER_HOME]')
    .replace(providerConfigPathPattern, '[PROVIDER_CONFIG_PATH]')
}

function summarizeOutput(output) {
  return redact(output)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-24)
    .join('\n')
}

function classifyOutput(result) {
  const output = result.output ?? ''
  if (/provider-readiness:missing-key|missing[^ \n]*(?: api)? key|api key.*missing|credential.*missing/i.test(output)) {
    return { status: 'missing-key', code: 3 }
  }
  if (/provider-readiness:missing-config|missing.*config|requires a configured base URL|requires a configured model|failed to parse.*config/i.test(output)) {
    return { status: 'missing-config', code: 3 }
  }
  if (/provider-readiness:unsupported-provider|unsupported provider|provider .*not.*supported/i.test(output)) {
    return { status: 'unsupported', code: 3 }
  }
  if (/provider-readiness:auth|invalid[_ -]?api[_ -]?key|authentication was rejected|unauthorized|forbidden|\b401\b|\b403\b/i.test(output)) {
    return { status: 'auth', code: 3 }
  }
  if (result.timedOut || /provider-readiness:network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable/i.test(output)) {
    return { status: 'network', code: 2 }
  }
  if (/provider-readiness:unknown|unknown/i.test(output)) {
    return { status: 'unknown', code: 1 }
  }
  return { status: 'product-regression', code: 1 }
}

function validateEnv(env) {
  const optIn = env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === '1'
  if (!optIn) {
    return { ok: false, skip: true, status: 'skip', code: 0, reason: 'set PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 to run the real provider smoke' }
  }

  if (env.PRIVATE_AGENTS_REAL_HOME?.trim()) {
    return { ok: false, status: 'missing-config', code: 3, reason: 'PRIVATE_AGENTS_REAL_HOME must be unset; this smoke uses explicit env and isolated HOME only' }
  }

  const testRoot = env.PRIVATE_AGENTS_TEST_ROOT?.trim()
  if (!testRoot) {
    return { ok: false, status: 'missing-config', code: 3, reason: 'PRIVATE_AGENTS_TEST_ROOT is required and must point at an isolated temp directory' }
  }

  const provider = env.PRIVATE_AGENTS_REAL_PROVIDER?.trim().toLowerCase()
  if (!provider) {
    return { ok: false, status: 'missing-config', code: 3, reason: 'PRIVATE_AGENTS_REAL_PROVIDER is required' }
  }
  if (!allowedProviders.has(provider)) {
    return { ok: false, status: 'unsupported', code: 3, reason: `unsupported provider ${provider}` }
  }

  const apiKey = env.PRIVATE_AGENTS_REAL_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, status: 'missing-key', code: 3, reason: 'PRIVATE_AGENTS_REAL_API_KEY is required' }
  }

  const baseUrl = env.PRIVATE_AGENTS_REAL_BASE_URL?.trim()
  const model = env.PRIVATE_AGENTS_REAL_MODEL?.trim()
  if (compatibleProviders.has(provider) && !baseUrl) {
    return { ok: false, status: 'missing-config', code: 3, reason: `${provider} requires PRIVATE_AGENTS_REAL_BASE_URL` }
  }
  if (compatibleProviders.has(provider) && !model) {
    return { ok: false, status: 'missing-config', code: 3, reason: `${provider} requires PRIVATE_AGENTS_REAL_MODEL` }
  }

  return { ok: true, provider, apiKey, baseUrl, model, testRoot: path.resolve(testRoot) }
}

function writeRuntimeConfig(input) {
  const runtimeHome = path.join(input.testRoot, 'real-provider-readiness-smoke', 'runtime-home')
  const workspace = path.join(input.testRoot, 'real-provider-readiness-smoke', 'workspace')
  const configDir = path.join(runtimeHome, '.private-agents')
  const configPath = path.join(configDir, 'config.json')
  fs.mkdirSync(configDir, { recursive: true })
  fs.mkdirSync(workspace, { recursive: true })
  fs.writeFileSync(
    path.join(workspace, 'README.md'),
    'real provider readiness smoke workspace\n',
    'utf8',
  )

  const credential = {
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    ...(input.model ? { model: input.model } : {}),
  }
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        provider: input.provider,
        providerCredentials: {
          [input.provider]: credential,
        },
      },
      null,
      2,
    ),
    'utf8',
  )

  return { runtimeHome, workspace }
}

function getProviderEnvVar(provider) {
  switch (provider) {
    case 'openai':
      return 'OPENAI_API_KEY'
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
    }, options.timeoutMs ?? 300000)

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

async function runSmoke(config) {
  const { runtimeHome, workspace } = writeRuntimeConfig(config)
  console.log(`provider=${config.provider}`)
  console.log(`workspace=${workspace}`)
  console.log(`runtimeHome=${runtimeHome}`)
  console.log('HOME isolated=yes')
  console.log('USERPROFILE isolated=yes')
  console.log('PRIVATE_AGENTS_REAL_HOME=unset')

  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    workspace,
    '--provider',
    config.provider,
    '--print',
    '--non-interactive-approval',
    'deny',
    'Run node --version in this workspace for provider readiness smoke.',
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      PRIVATE_AGENTS_REAL_HOME: '',
      PRIVATE_AGENTS_AUDIT_LOG: path.join(config.testRoot, 'real-provider-readiness-smoke', 'audit', 'permissions.jsonl'),
      [getProviderEnvVar(config.provider)]: config.apiKey,
    },
    timeoutMs: 300000,
  })

  const classified = classifyOutput(result)
  if (classified.code !== 1 && classified.status !== 'product-regression') {
    printStep('real-provider-readiness-cli', classified.status, result.timedOut ? 'timed out' : `exit=${result.code}`)
    console.log(summarizeOutput(result.output))
    return classified
  }

  if (
    !result.timedOut &&
    result.output.includes('Result') &&
    /- Outcome: (success|stopped|error)/.test(result.output)
  ) {
    printStep('real-provider-readiness-cli', 'pass', 'structured terminal result observed')
    return { status: 'pass', code: 0 }
  }

  printStep('real-provider-readiness-cli', 'product-regression', result.timedOut ? 'timed out' : `exit=${result.code}`)
  console.log(summarizeOutput(result.output))
  return { status: 'product-regression', code: 1 }
}

function runClassificationSelfTest() {
  printHeader('classification-self-test')
  const cases = [
    ['missing-key', 'Provider readiness failed (provider-readiness:missing-key): OPENAI_API_KEY is not set', 'missing-key', 3],
    ['missing-config', 'Provider readiness failed (provider-readiness:missing-config): openai-compatible requires a configured base URL', 'missing-config', 3],
    ['unsupported', 'Provider readiness failed (provider-readiness:unsupported-provider): provider anthropic is not supported', 'unsupported', 3],
    ['auth-401', 'Provider readiness failed (provider-readiness:auth): authentication was rejected (401/403)', 'auth', 3],
    ['auth-invalid-key', 'invalid_api_key: the API key is invalid', 'auth', 3],
    ['network', 'Provider readiness failed (provider-readiness:network): fetch failed after reconnecting', 'network', 2],
    ['unknown', 'Provider readiness failed (provider-readiness:unknown): endpoint returned HTTP 500', 'unknown', 1],
  ]

  let ok = true
  for (const [name, output, expectedStatus, expectedCode] of cases) {
    const classified = classifyOutput({ output, timedOut: false })
    const passed =
      classified.status === expectedStatus &&
      classified.code === expectedCode
    printStep(
      `real-provider-readiness-classification-${name}`,
      passed ? 'pass' : 'product-regression',
      passed ? classified.status : `got=${classified.status}/${classified.code} expected=${expectedStatus}/${expectedCode}`,
    )
    ok = ok && passed
  }

  const redacted = summarizeOutput(
    '/home/wang/.private-agents-real/.private-agents/config.json Authorization: Bearer sk-live-secret refresh_token=refresh-secret https://example.test/v1?api_key=sk-url-secret',
  )
  const redactionPassed =
    redacted.includes('[REAL_PROVIDER_HOME]') &&
    redacted.includes('Bearer [REDACTED]') &&
    redacted.includes('refresh_token=[REDACTED]') &&
    redacted.includes('api_key=[REDACTED]') &&
    !redacted.includes('/home/wang/.private-agents-real') &&
    !redacted.includes('sk-live-secret') &&
    !redacted.includes('refresh-secret') &&
    !redacted.includes('sk-url-secret')
  printStep(
    'real-provider-readiness-redaction-self-test',
    redactionPassed ? 'pass' : 'product-regression',
    redactionPassed ? 'sanitized output tail' : redacted,
  )
  ok = ok && redactionPassed

  printStep('real-provider-readiness-classification-self-test', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
}

async function main() {
  if (help) {
    usage()
    return
  }

  if (classificationSelfTest) {
    runClassificationSelfTest()
    return
  }

  printHeader('real-smoke')
  const validation = validateEnv(process.env)
  if (!validation.ok) {
    printStep('real-provider-readiness-opt-in', validation.status, validation.reason)
    process.exit(validation.code)
  }

  const result = await runSmoke(validation)
  printStep('real-provider-readiness-smoke-gate', result.status)
  process.exit(result.code)
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.stack ?? error.message : String(error)))
  process.exit(1)
})
