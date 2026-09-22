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
const defaultProviderEnvPath = '/home/wang/.private-agents-real/provider.env'

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
  /(?:\/[^\s"'`<>]*|[A-Za-z]:[\\/][^\s"'`<>]*)?[\\/]\.(?:cheers|cheer|private-agents|coding-agents)[\\/]config\.json/gi
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
  console.log('Default behavior: skip unless CHEERS_REAL_PROVIDER_SMOKE=1 is set.')
  console.log('Required opt-in env:')
  console.log('  CHEERS_REAL_PROVIDER_SMOKE=1')
  console.log('  CHEERS_TEST_ROOT=<isolated test root>')
  console.log('Provider env may be supplied explicitly or by silently loading provider.env.')
  console.log('  CHEERS_REAL_PROVIDER=openai|openai-compatible|google|antigravity|claudecode')
  console.log('  CHEERS_PROVIDER=<same providers>  accepted alias')
  console.log('  CHEERS_REAL_API_KEY=<provider api key>')
  console.log('  OPENAI_API_KEY / OPENAI_COMPATIBLE_API_KEY / GOOGLE_API_KEY / ANTIGRAVITY_API_KEY / CLAUDECODE_API_KEY')
  console.log('  CHEERS_REAL_BASE_URL=<base url>   required for OpenAI-compatible style providers')
  console.log('  CHEERS_REAL_MODEL=<model>         required for OpenAI-compatible style providers')
  console.log('')
  console.log('This smoke never reads real user provider config directories.')
}

function printHeader(mode, configSource = 'explicit-env-or-provider-env') {
  console.log('gate name=real-provider-readiness-smoke')
  console.log(`mode=${mode}`)
  console.log('status taxonomy: pass=0 product-regression=1 network=2 missing-config/missing-key/auth/unsupported=3')
  console.log(`configSource=${configSource}`)
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

function parseProviderEnvFile(filePath) {
  const resolved = path.resolve(filePath)
  if (resolved !== defaultProviderEnvPath) {
    return {
      ok: false,
      status: 'missing-config',
      code: 3,
      reason: 'provider env path must be /home/wang/.private-agents-real/provider.env',
    }
  }
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      status: 'missing-config',
      code: 3,
      reason: 'provider.env is not present at the approved path',
    }
  }

  const parsed = {}
  const content = fs.readFileSync(resolved, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2]?.trim() ?? ''
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    } else {
      const commentIndex = value.search(/\s+#/)
      if (commentIndex >= 0) value = value.slice(0, commentIndex).trim()
    }
    parsed[key] = value
  }
  return { ok: true, env: parsed }
}

function getTrimmed(env, names) {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

function normalizeProvider(value) {
  const normalized = value?.trim().toLowerCase().replace(/_/g, '-')
  switch (normalized) {
    case 'compatible':
    case 'openai-compatible':
    case 'openai-compatible-api':
    case 'siliconflow':
    case 'deepseek':
      return 'openai-compatible'
    default:
      return normalized
  }
}

function hasCompatibleBaseUrlHint(env) {
  return Boolean(
    getTrimmed(env, [
      'CHEERS_REAL_BASE_URL',
      'CHEERS_PROVIDER_BASE_URL',
      'CHEERS_BASE_URL',
      'OPENAI_COMPATIBLE_BASE_URL',
      'OPENAI_API_BASE',
      'OPENAI_API_BASE_URL',
      'OPENAI_BASE_URL',
      'API_BASE_URL',
      'BASE_URL',
    ]),
  )
}

function chooseProvider(env) {
  const explicit = getTrimmed(env, [
    'CHEERS_REAL_PROVIDER',
    'CHEERS_PROVIDER',
  ])
  if (explicit) return normalizeProvider(explicit)
  if (
    getTrimmed(env, ['OPENAI_API_KEY']) &&
    hasCompatibleBaseUrlHint(env)
  ) {
    return 'openai-compatible'
  }
  if (getTrimmed(env, ['OPENAI_COMPATIBLE_API_KEY'])) return 'openai-compatible'
  if (getTrimmed(env, ['GOOGLE_API_KEY'])) return 'google'
  if (getTrimmed(env, ['ANTIGRAVITY_API_KEY'])) return 'antigravity'
  if (getTrimmed(env, ['CLAUDECODE_API_KEY'])) return 'claudecode'
  if (getTrimmed(env, ['OPENAI_API_KEY'])) return 'openai'
  return undefined
}

function providerSpecificApiKeyNames(provider) {
  switch (provider) {
    case 'openai':
      return ['OPENAI_API_KEY']
    case 'google':
      return ['GOOGLE_API_KEY']
    case 'antigravity':
      return ['ANTIGRAVITY_API_KEY']
    case 'claudecode':
      return ['CLAUDECODE_API_KEY']
    default:
      return ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY']
  }
}

function providerSpecificBaseUrlNames(provider) {
  switch (provider) {
    case 'openai':
      return ['OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_API_BASE_URL']
    case 'google':
      return ['GOOGLE_BASE_URL']
    case 'antigravity':
      return ['ANTIGRAVITY_BASE_URL']
    case 'claudecode':
      return ['CLAUDECODE_BASE_URL']
    default:
      return [
        'OPENAI_COMPATIBLE_BASE_URL',
        'OPENAI_BASE_URL',
        'OPENAI_API_BASE',
        'OPENAI_API_BASE_URL',
        'API_BASE_URL',
        'BASE_URL',
      ]
  }
}

function providerSpecificModelNames(provider) {
  switch (provider) {
    case 'openai':
      return ['OPENAI_MODEL', 'MODEL']
    case 'google':
      return ['GOOGLE_MODEL']
    case 'antigravity':
      return ['ANTIGRAVITY_MODEL']
    case 'claudecode':
      return ['CLAUDECODE_MODEL']
    default:
      return ['OPENAI_COMPATIBLE_MODEL', 'OPENAI_MODEL', 'MODEL']
  }
}

function buildEffectiveEnv(processEnv) {
  if (processEnv.CHEERS_REAL_PROVIDER_SMOKE?.trim() !== '1') {
    return {
      env: processEnv,
      configSource: 'not-loaded-no-opt-in',
    }
  }

  const providerEnvPath =
    processEnv.CHEERS_PROVIDER_ENV?.trim() ||
    processEnv.CHEERS_REAL_PROVIDER_ENV?.trim() ||
    defaultProviderEnvPath
  const explicitProviderEnvPath = Boolean(
    processEnv.CHEERS_PROVIDER_ENV?.trim() ||
      processEnv.CHEERS_REAL_PROVIDER_ENV?.trim(),
  )
  const loaded = parseProviderEnvFile(providerEnvPath)
  if (!loaded.ok) {
    if (
      !explicitProviderEnvPath &&
      loaded.status === 'missing-config' &&
      loaded.reason === 'provider.env is not present at the approved path'
    ) {
      return {
        env: processEnv,
        configSource: 'explicit-env',
      }
    }
    return {
      env: processEnv,
      configSource: 'explicit-env',
      providerEnvError: loaded,
    }
  }

  return {
    env: {
      ...loaded.env,
      ...processEnv,
    },
    configSource: 'explicit-env+provider-env',
  }
}

function validateEnv(env) {
  const optIn = env.CHEERS_REAL_PROVIDER_SMOKE?.trim() === '1'
  if (!optIn) {
    return { ok: false, skip: true, status: 'skip', code: 0, reason: 'set CHEERS_REAL_PROVIDER_SMOKE=1 to run the real provider smoke' }
  }

  const testRoot = env.CHEERS_TEST_ROOT?.trim()
  if (!testRoot) {
    return { ok: false, status: 'missing-config', code: 3, reason: 'CHEERS_TEST_ROOT is required and must point at an isolated temp directory' }
  }

  const provider = chooseProvider(env)
  if (!provider) {
    return { ok: false, status: 'missing-config', code: 3, reason: 'CHEERS_REAL_PROVIDER or CHEERS_PROVIDER is required' }
  }
  if (!allowedProviders.has(provider)) {
    return { ok: false, status: 'unsupported', code: 3, reason: `unsupported provider ${provider}` }
  }

  const apiKey = getTrimmed(env, [
    'CHEERS_REAL_API_KEY',
    ...providerSpecificApiKeyNames(provider),
  ])
  if (!apiKey) {
    return { ok: false, status: 'missing-key', code: 3, reason: `CHEERS_REAL_API_KEY or ${getProviderEnvVar(provider)} is required` }
  }

  const baseUrl = getTrimmed(env, [
    'CHEERS_REAL_BASE_URL',
    'CHEERS_PROVIDER_BASE_URL',
    'CHEERS_BASE_URL',
    ...providerSpecificBaseUrlNames(provider),
  ])
  const model = getTrimmed(env, [
    'CHEERS_REAL_MODEL',
    'CHEERS_PROVIDER_MODEL',
    'CHEERS_MODEL',
    ...providerSpecificModelNames(provider),
  ])
  if (compatibleProviders.has(provider) && !baseUrl) {
    return { ok: false, status: 'missing-config', code: 3, reason: `${provider} requires CHEERS_REAL_BASE_URL` }
  }
  if (compatibleProviders.has(provider) && !model) {
    return { ok: false, status: 'missing-config', code: 3, reason: `${provider} requires CHEERS_REAL_MODEL` }
  }

  return { ok: true, provider, apiKey, baseUrl, model, testRoot: path.resolve(testRoot) }
}

function writeRuntimeConfig(input) {
  const runtimeHome = path.join(input.testRoot, 'real-provider-readiness-smoke', 'runtime-home')
  const workspace = path.join(input.testRoot, 'real-provider-readiness-smoke', 'workspace')
  const configDir = path.join(runtimeHome, '.cheers')
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
  console.log('CHEERS_REAL_HOME=unset')

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
      CHEERS_PROVIDER_MODE: 'real',
      CHEERS_REAL_HOME: '',
      CHEERS_AUDIT_LOG: path.join(config.testRoot, 'real-provider-readiness-smoke', 'audit', 'permissions.jsonl'),
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
    '/home/wang/.private-agents-real/.cheers/config.json Authorization: Bearer sk-live-secret refresh_token=refresh-secret https://example.test/v1?api_key=sk-url-secret',
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

  const envCases = [
    {
      name: 'default-skip-no-provider-env-load',
      env: {},
      assert(result) {
        return result.status === 'skip' && result.code === 0
      },
    },
    {
      name: 'explicit-openai-compatible-alias',
      env: {
        CHEERS_REAL_PROVIDER_SMOKE: '1',
        CHEERS_TEST_ROOT: '/tmp/cheers-test/provider-readiness-self-test',
        CHEERS_REAL_PROVIDER: 'siliconflow',
        CHEERS_REAL_API_KEY: 'test-key',
        CHEERS_REAL_BASE_URL: 'https://example.test/v1',
        CHEERS_REAL_MODEL: 'test-model',
      },
      assert(result) {
        return result.ok === true && result.provider === 'openai-compatible'
      },
    },
    {
      name: 'openai-key-with-compatible-base-url',
      env: {
        CHEERS_REAL_PROVIDER_SMOKE: '1',
        CHEERS_TEST_ROOT: '/tmp/cheers-test/provider-readiness-self-test',
        OPENAI_API_KEY: 'test-key',
        BASE_URL: 'https://example.test/v1',
        MODEL: 'test-model',
      },
      assert(result) {
        return result.ok === true && result.provider === 'openai-compatible'
      },
    },
    {
      name: 'opt-in-missing-key',
      env: {
        CHEERS_REAL_PROVIDER_SMOKE: '1',
        CHEERS_TEST_ROOT: '/tmp/cheers-test/provider-readiness-self-test',
        CHEERS_REAL_PROVIDER: 'openai',
      },
      assert(result) {
        return result.status === 'missing-key' && result.code === 3
      },
    },
  ]
  for (const envCase of envCases) {
    const validation = validateEnv(envCase.env)
    const passed = envCase.assert(validation)
    printStep(
      `real-provider-readiness-env-contract-${envCase.name}`,
      passed ? 'pass' : 'product-regression',
      passed ? 'contract preserved' : `status=${validation.status ?? 'ok'}`,
    )
    ok = ok && passed
  }

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

  const effective = buildEffectiveEnv(process.env)
  printHeader('real-smoke', effective.configSource)
  if (effective.providerEnvError) {
    printStep(
      'real-provider-readiness-provider-env',
      effective.providerEnvError.status,
      effective.providerEnvError.reason,
    )
    process.exit(effective.providerEnvError.code)
  }
  const validation = validateEnv(effective.env)
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
