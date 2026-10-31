#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspectRuntimeConfig } from './support/config.mjs'
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
  process.env.CHEERS_EXPECT_PROVIDER_BASE_URL?.trim() ||
  'https://api.siliconflow.cn/v1'
const expectedBaselineModel =
  process.env.CHEERS_EXPECT_MODEL?.trim() ||
  'deepseek-ai/DeepSeek-V4-Flash'
const networkFailurePattern =
  /(provider-readiness:network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable)/i
const configFailurePattern =
  /(provider-readiness:(missing-key|missing-config|auth|unsupported-provider)|missing.*config|failed to parse.*config|config\.json|api key|apikey|not connected|connect first|credentials|authentication was rejected|401|403)/i
const realHomeConfigPattern =
  /[A-Za-z]:[\\/]+Test[\\/]+home-sf[\\/]+\.(?:cheers|cheer|private-agents|coding-agents)[\\/]+config\.json/gi
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

function validateCredential(resolved) {
  if (resolved.blocked) return { ok: false, reason: 'The selected connection or account pool cannot be used.' }
  if (!resolved.hasCredential) return { ok: false, reason: 'The resolved provider credential is missing.' }
  if (!resolved.endpointPresent) return { ok: false, reason: 'The resolved provider endpoint is missing.' }
  if (resolved.requiresModel && !resolved.modelPresent) return { ok: false, reason: 'The resolved provider model is missing.' }
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
        output: 'Failed to parse D:/Test/home-sf/.cheers/config.json: access_token=acct-secret',
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
    'D:/Test/home-sf/.cheers/config.json Authorization: Bearer sk-live-secret refresh_token=refresh-secret https://example.test/v1?api_key=sk-url-secret',
  )
  const redactionPassed =
    redactionSample.includes('[REAL_PROVIDER_CONFIG_PATH]') &&
    redactionSample.includes('Bearer [REDACTED]') &&
    redactionSample.includes('refresh_token=[REDACTED]') &&
    redactionSample.includes('api_key=[REDACTED]') &&
    !redactionSample.includes('sk-live-secret') &&
    !redactionSample.includes('refresh-secret') &&
    !redactionSample.includes('sk-url-secret') &&
    !redactionSample.includes('.cheers/config.json')
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
      CHEERS_PROVIDER_MODE: 'real',
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

async function runProviderBaselineSmoke() {
  const result = await inspectRuntimeConfig(realHome, projectRoot, { operation: 'baseline',
    expectedBaseUrl: expectedBaselineBaseUrl, expectedModel: expectedBaselineModel })
  console.log('baselinePrompt=hello / 你是什么模型')
  console.log('baselineTools=0')
  console.log('baselineWillWrite=false')
  if (result.httpStatus !== undefined) console.log(`httpStatus=${result.httpStatus}`)
  if (result.responseBodyPresent !== undefined) console.log(`responseBodyPresent=${result.responseBodyPresent}`)
  printStep('provider-baseline-chat', result.status, result.reason ?? 'HTTP response observed; body not reported')
  return { ...result, code: result.status === 'pass' ? 0 : result.status === 'provider-network-inconclusive' ? 2 : 3 }
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

  const loaded = await inspectRuntimeConfig(realHome, projectRoot)
  if (!loaded.ok) {
    printStep('real-provider-config', loaded.status, loaded.reason)
    process.exit(3)
  }
  printStep('real-provider-config', 'pass', 'config path redacted')

  const resolved = loaded
  console.log(`provider=${resolved.provider}`)
  console.log(`activeConnection=${!resolved.activeConnectionId ? 'none' : 'present'}`)
  console.log(`credentialSource=${resolved.credentialSource}`)
  console.log(`authMode=${resolved.authMode}`)
  console.log(`endpoint=${resolved.endpointPresent ? 'present' : 'missing'}`)
  console.log(`model=${resolved.modelPresent ? 'present' : 'missing'}`)
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
    const baseline = await runProviderBaselineSmoke()
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
