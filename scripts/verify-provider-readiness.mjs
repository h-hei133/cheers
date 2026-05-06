#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Agent, ProxyAgent, fetch as undiciFetch } from 'undici'
import { getRealProviderHome, getTestRoot } from './support/testPaths.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
const realHome = getRealProviderHome({ allowDefault: true })
const projectRoot = path.join(getTestRoot(), 'provider-readiness-smoke')
const fixturePath = `${projectRoot}/fixture.txt`
const classificationSelfTest = process.argv.includes('--classification-self-test')
const preflightOnly = process.argv.includes('--preflight-only')
const baselineSmoke = process.argv.includes('--baseline-smoke')
const expectedBaselineBaseUrl =
  process.env.PRIVATE_AGENTS_EXPECT_PROVIDER_BASE_URL?.trim() ||
  'https://api.siliconflow.cn/v1'
const expectedBaselineModel =
  process.env.PRIVATE_AGENTS_EXPECT_MODEL?.trim() ||
  'deepseek-ai/DeepSeek-V4-Flash'
const providerProxy =
  process.env.PRIVATE_AGENTS_PROVIDER_PROXY?.trim() ||
  undefined
const providerNoProxy =
  process.env.PRIVATE_AGENTS_PROVIDER_NO_PROXY?.trim() ||
  process.env.NO_PROXY?.trim() ||
  process.env.no_proxy?.trim() ||
  undefined

const networkFailurePattern =
  /(provider-readiness:network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable)/i
const configFailurePattern =
  /(provider-readiness:(missing-key|missing-config|auth|unsupported-provider)|missing.*config|failed to parse.*config|config\.json|api key|apikey|not connected|connect first|credentials|authentication was rejected|401|403)/i
const realHomeConfigPattern =
  /[A-Za-z]:[\\/]+Test[\\/]+home-sf[\\/]+\.private-agents[\\/]+config\.json/gi
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const suffix = detail ? ` - ${redactProviderOutput(detail)}` : ''
  console.log(`[${status}] ${name}${suffix}`)
}

function summarizeOutput(output) {
  return redactProviderOutput(output)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-18)
    .join('\n')
}

function redactProviderOutput(input) {
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
    .replace(realHomeConfigPattern, '[REAL_PROVIDER_CONFIG_PATH]')
}

function renderPresence(value) {
  return value ? 'present' : 'none'
}

function resolveProviderTransport() {
  const connectTimeoutMs = parsePositiveInteger(
    process.env.PRIVATE_AGENTS_PROVIDER_CONNECT_TIMEOUT_MS,
    30000,
  )
  const headersTimeoutMs = parsePositiveInteger(
    process.env.PRIVATE_AGENTS_PROVIDER_HEADERS_TIMEOUT_MS,
    120000,
  )
  const bodyTimeoutMs = parsePositiveInteger(
    process.env.PRIVATE_AGENTS_PROVIDER_BODY_TIMEOUT_MS,
    120000,
  )
  const explicitProxy = providerProxy?.toLowerCase() === 'env'
    ? process.env.HTTPS_PROXY?.trim() ||
      process.env.https_proxy?.trim() ||
      process.env.HTTP_PROXY?.trim() ||
      process.env.http_proxy?.trim() ||
      undefined
    : providerProxy && providerProxy.toLowerCase() !== 'off' && providerProxy.toLowerCase() !== 'none'
      ? providerProxy
      : undefined
  const noProxy = (providerNoProxy ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return {
    connectTimeoutMs,
    headersTimeoutMs,
    bodyTimeoutMs,
    proxyUrl: explicitProxy,
    noProxy,
  }
}

function createProviderFetch() {
  const transport = resolveProviderTransport()
  const directDispatcher = new Agent({
    connect: { timeout: transport.connectTimeoutMs },
    headersTimeout: transport.headersTimeoutMs,
    bodyTimeout: transport.bodyTimeoutMs,
  })
  const proxyDispatcher = transport.proxyUrl
    ? new ProxyAgent({
        uri: transport.proxyUrl,
        connect: { timeout: transport.connectTimeoutMs },
        headersTimeout: transport.headersTimeoutMs,
        bodyTimeout: transport.bodyTimeoutMs,
      })
    : undefined

  return async function providerFetch(url, init = {}) {
    const parsed = new URL(String(url))
    const dispatcher =
      proxyDispatcher && !matchesNoProxy(parsed.hostname, transport.noProxy)
        ? proxyDispatcher
        : directDispatcher
    return await undiciFetch(url, { ...init, dispatcher })
  }
}

function matchesNoProxy(hostname, entries) {
  const host = hostname.toLowerCase()
  for (const entry of entries) {
    if (entry === '*') return true
    if (entry.startsWith('*.') && host.endsWith(entry.slice(1))) return true
    if (entry.startsWith('.') && (host === entry.slice(1) || host.endsWith(entry))) return true
    if (host === entry) return true
  }
  return false
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function loadConfig() {
  if (!realHome) {
    return {
      ok: false,
      status: 'config-failure',
      reason: 'real provider home is not configured; set PRIVATE_AGENTS_REAL_HOME on Linux/WSL to opt in',
    }
  }
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
  const configuredProvider = typeof config.provider === 'string' ? config.provider : 'openai'
  const connections = Array.isArray(config.providerConnections) ? config.providerConnections : []
  const activeConnection = connections.find(
    (connection) => connection?.id === config.activeProviderConnectionId,
  ) ?? connections.find((connection) => connection?.provider === configuredProvider)
  const provider = activeConnection?.provider ?? configuredProvider
  const profile = config.providerCredentials?.[provider] ?? {}
  const envApiKey = process.env[getProviderEnvVar(provider)]?.trim()
  const connectionApiKey =
    activeConnection?.provider === provider ? activeConnection.apiKey?.trim() : undefined
  const configApiKey = profile.apiKey?.trim()
  const accountAuth =
    provider === 'openai'
      ? activeConnection?.accountAuth?.openai ?? profile.accountAuth?.openai
      : provider === 'google'
        ? activeConnection?.accountAuth?.google ?? profile.accountAuth?.google
        : undefined

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
  const apiKey = connectionApiKey ?? configApiKey ?? envApiKey

  return {
    provider,
    activeConnectionId: activeConnection?.id ?? 'none',
    credentialSource: source,
    authMode,
    baseUrl,
    model,
    hasCredential,
    apiKey,
    accountAuth,
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

function runClassificationSelfTest() {
  console.log('gate name=provider-readiness')
  console.log('mode=classification-self-test')
  console.log('homeRead=false')
  console.log('real-provider HOME not read')

  const cases = [
    {
      name: 'missing-key',
      result: {
        output: 'Provider readiness failed (provider-readiness:missing-key): OPENAI_API_KEY is not set',
        timedOut: false,
      },
      expectedStatus: 'config-failure',
      expectedCode: 3,
    },
    {
      name: 'auth',
      result: {
        output: 'Provider readiness failed (provider-readiness:auth): authentication was rejected (401/403)',
        timedOut: false,
      },
      expectedStatus: 'config-failure',
      expectedCode: 3,
    },
    {
      name: 'network',
      result: {
        output: 'Provider readiness failed (provider-readiness:network): fetch failed after reconnecting',
        timedOut: false,
      },
      expectedStatus: 'provider-network-inconclusive',
      expectedCode: 2,
    },
    {
      name: 'timeout',
      result: {
        output: '',
        timedOut: true,
      },
      expectedStatus: 'provider-network-inconclusive',
      expectedCode: 2,
    },
    {
      name: 'contract-regression',
      result: {
        output: 'Result block missing after provider check',
        timedOut: false,
      },
      expectedStatus: 'product-regression',
      expectedCode: 1,
    },
    {
      name: 'redacted-config',
      result: {
        output: 'Failed to parse D:/Test/home-sf/.private-agents/config.json: access_token=acct-secret',
        timedOut: false,
      },
      expectedStatus: 'config-failure',
      expectedCode: 3,
    },
    {
      name: 'redacted-network',
      result: {
        output: 'provider-readiness:network fetch failed Authorization: Bearer sk-live-secret https://example.test/v1?api_key=sk-url-secret',
        timedOut: false,
      },
      expectedStatus: 'provider-network-inconclusive',
      expectedCode: 2,
    },
  ]

  let ok = true
  for (const item of cases) {
    const classified = classifyCliFailure(item.result)
    const passed =
      classified.status === item.expectedStatus &&
      classified.code === item.expectedCode
    printStep(
      `provider-readiness-classification-${item.name}`,
      passed ? 'pass' : 'product-regression',
      passed
        ? classified.status
        : `got=${classified.status}/${classified.code} expected=${item.expectedStatus}/${item.expectedCode}`,
    )
    ok = ok && passed
  }

  const redactionSample = summarizeOutput(
    'D:/Test/home-sf/.private-agents/config.json Authorization: Bearer sk-live-secret refresh_token=refresh-secret https://example.test/v1?api_key=sk-url-secret',
  )
  const redactionPassed =
    redactionSample.includes('[REAL_PROVIDER_CONFIG_PATH]') &&
    redactionSample.includes('Bearer [REDACTED]') &&
    redactionSample.includes('refresh_token=[REDACTED]') &&
    redactionSample.includes('api_key=[REDACTED]') &&
    !redactionSample.includes('sk-live-secret') &&
    !redactionSample.includes('refresh-secret') &&
    !redactionSample.includes('sk-url-secret') &&
    !redactionSample.includes('.private-agents/config.json')
  printStep(
    'provider-readiness-redaction-self-test',
    redactionPassed ? 'pass' : 'product-regression',
    redactionPassed ? 'sanitized output tail' : redactionSample,
  )
  ok = ok && redactionPassed

  printStep('provider-readiness-classification-self-test', ok ? 'pass' : 'product-regression')
  process.exit(ok ? 0 : 1)
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

function summarizeFetchCause(error) {
  const cause = error && typeof error === 'object' ? error.cause : undefined
  if (!cause || typeof cause !== 'object') {
    return redactProviderOutput(error instanceof Error ? error.message : String(error))
  }

  const fields = []
  for (const key of ['name', 'code', 'errno', 'syscall', 'hostname', 'address', 'port']) {
    const value = cause[key]
    if (typeof value === 'string' && value.trim()) {
      fields.push(`${key}=${value.trim().replace(/\s+/g, '_').slice(0, 160)}`)
    } else if (typeof value === 'number') {
      fields.push(`${key}=${value}`)
    }
  }
  if (cause instanceof Error && cause.message.trim()) {
    fields.push(`message=${cause.message.trim().replace(/\s+/g, '_').slice(0, 160)}`)
  }
  return redactProviderOutput(fields.length > 0 ? fields.join(' ') : String(error))
}

async function runProviderBaselineSmoke(resolved) {
  const baseUrl = String(resolved.baseUrl ?? '').replace(/\/+$/, '')
  const model = String(resolved.model ?? '').trim()
  const endpoint = `${baseUrl}/chat/completions`
  const expectedEndpoint = `${expectedBaselineBaseUrl.replace(/\/+$/, '')}/chat/completions`
  const accountToken = resolved.accountAuth?.accessToken?.trim()
  const authToken = accountToken || resolved.apiKey?.trim()

  console.log('baselinePrompt=hello / 你是什么模型')
  console.log('baselineTools=0')
  console.log('baselineWillWrite=false')
  console.log(`baselineProvider=${resolved.provider}`)
  console.log(`baselineUrl=${endpoint}`)
  console.log(`baselineUrlExpected=${expectedEndpoint}`)
  console.log(`baselineModel=${model || 'missing'}`)
  console.log(`baselineModelExpected=${expectedBaselineModel}`)
  console.log(`baselineAuthorization=${authToken ? 'Bearer [REDACTED]' : 'missing'}`)
  console.log(`baselineProxy=${resolveProviderTransport().proxyUrl ? 'enabled' : 'disabled'}`)
  console.log(`baselineNoProxy=${providerNoProxy ? 'configured' : 'none'}`)

  if (resolved.provider !== 'openai-compatible') {
    printStep(
      'provider-baseline-config',
      'config-failure',
      `expected provider openai-compatible, got ${resolved.provider}`,
    )
    return { ok: false, status: 'config-failure', code: 3 }
  }
  if (endpoint !== expectedEndpoint) {
    printStep(
      'provider-baseline-config',
      'config-failure',
      `expected chat endpoint ${expectedEndpoint}, got ${endpoint}`,
    )
    return { ok: false, status: 'config-failure', code: 3 }
  }
  if (model !== expectedBaselineModel) {
    printStep(
      'provider-baseline-config',
      'config-failure',
      `expected model ${expectedBaselineModel}, got ${model || 'missing'}`,
    )
    return { ok: false, status: 'config-failure', code: 3 }
  }
  if (!authToken) {
    printStep('provider-baseline-config', 'config-failure', 'authorization header missing')
    return { ok: false, status: 'config-failure', code: 3 }
  }

  const startedAt = Date.now()
  let response
  try {
    response = await createProviderFetch()(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'user', content: 'hello / 你是什么模型' }],
      }),
      signal: AbortSignal.timeout(30000),
    })
  } catch (error) {
    const cause = summarizeFetchCause(error)
    printStep('provider-baseline-chat', 'provider-network-inconclusive', 'fetch failed')
    console.log(`fetchCause=${cause}`)
    console.log(`elapsedMs=${Date.now() - startedAt}`)
    return { ok: false, status: 'provider-network-inconclusive', code: 2 }
  }

  console.log(`httpStatus=${response.status}`)
  if (response.status === 401 || response.status === 403) {
    printStep('provider-baseline-chat', 'config-failure', `HTTP ${response.status}`)
    return { ok: false, status: 'config-failure', code: 3 }
  }
  if (!response.ok) {
    const errorText = redactProviderOutput((await response.text()).slice(0, 400))
    printStep('provider-baseline-chat', 'config-failure', `HTTP ${response.status}`)
    if (errorText) console.log(`httpErrorBody=${errorText}`)
    return { ok: false, status: 'config-failure', code: 3 }
  }

  const text = redactProviderOutput((await response.text()).slice(0, 400))
  const redactionPassed =
    !/Bearer\s+(?!\[REDACTED\])\S+/i.test(text) &&
    !/sk-[A-Za-z0-9][A-Za-z0-9._-]{8,}/.test(text)
  console.log(`responseBodyPresent=${text.length > 0}`)
  console.log(`redaction=${redactionPassed ? 'pass' : 'fail'}`)
  printStep(
    'provider-baseline-chat',
    redactionPassed ? 'pass' : 'product-regression',
    `elapsedMs=${Date.now() - startedAt}`,
  )
  return redactionPassed
    ? { ok: true, status: 'pass', code: 0 }
    : { ok: false, status: 'product-regression', code: 1 }
}

async function main() {
  if (classificationSelfTest) {
    runClassificationSelfTest()
    return
  }

  console.log('gate name=provider-readiness')
  console.log(`mode=${preflightOnly ? 'preflight-only' : baselineSmoke ? 'baseline-smoke' : 'smoke'}`)
  console.log('status taxonomy: pass=0 product-regression=1 provider-network-inconclusive=2 config-failure=3')
  console.log('exit semantics: 0=ready, 1=provider reachable but smoke contract regressed, 2=network inconclusive after retry, 3=config/auth/unsupported/misconfigured')
  console.log(`repo=${repoRoot}`)
  console.log(`HOME used=${realHome ?? 'not-configured'}`)
  console.log(`USERPROFILE used=${realHome ?? 'not-configured'}`)
  console.log('homeCreated=false')

  const loaded = loadConfig()
  if (!loaded.ok) {
    printStep('real-provider-config', loaded.status, loaded.reason)
    process.exit(3)
  }
  printStep('real-provider-config', 'pass', 'config path redacted')

  const resolved = resolveCredential(loaded.config)
  console.log(`provider=${resolved.provider}`)
  console.log(`activeConnection=${resolved.activeConnectionId === 'none' ? 'none' : 'present'}`)
  console.log(`credentialSource=${resolved.credentialSource}`)
  console.log(`authMode=${resolved.authMode}`)
  console.log(`endpoint=${renderPresence(resolved.baseUrl)}`)
  console.log(`model=${renderPresence(resolved.model)}`)
  const credentialOk = validateCredential(resolved)
  if (!credentialOk.ok) {
    printStep('real-provider-credential', 'config-failure', credentialOk.reason)
    process.exit(3)
  }
  printStep('real-provider-credential', 'pass', 'credential present (redacted)')

  if (preflightOnly) {
    printStep('provider-readiness-preflight', 'pass', 'configuration resolved (redacted)')
    process.exit(0)
  }

  if (baselineSmoke) {
    const baseline = await runProviderBaselineSmoke(resolved)
    printStep('provider-baseline-smoke-gate', baseline.status)
    process.exit(baseline.code)
  }

  let smoke = await runRealProviderSmoke()
  if (smoke.code === 2) {
    printStep('provider-readiness-retry', 'provider-network-inconclusive', 'retrying once after transient network classification')
    await sleep(1500)
    smoke = await runRealProviderSmoke()
  }
  printStep('provider-readiness-smoke-gate', smoke.status)
  process.exit(smoke.code)
}

main().catch((error) => {
  console.error(redactProviderOutput(error instanceof Error ? error.stack ?? error.message : String(error)))
  process.exit(1)
})
