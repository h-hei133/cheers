#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const anchoredSmokeRunnerPath = path.join(
  repoRoot,
  'scripts',
  'real-provider-smokes',
  'anchoredSmokeRunner.ts',
)
const approvedRealProviderHome = '/home/wang/.private-agents-real'
const defaultProviderEnvPath = path.join(approvedRealProviderHome, 'provider.env')
const fakeReadyHome = '/tmp/private-agents-fake-ready'

const focusedTests = [
  'src/orchestration/liveProviderAdapterApproval.test.ts',
  'src/orchestration/openAICompatibleAnchoredSmokeAdapter.test.ts',
  'src/orchestration/liveProviderSmokeFixture.test.ts',
  'src/orchestration/liveProviderSmokeEvidence.test.ts',
  'src/orchestration/liveProviderSmokeCalibration.test.ts',
  'src/orchestration/liveProviderSmokeResult.test.ts',
  'src/orchestration/anchoredProviderSmokeGate.test.ts',
  'src/orchestration/proposalQualityCorpus.test.ts',
  'src/orchestration/proposalQualityReport.test.ts',
  'src/orchestration/providerSmokeResult.test.ts',
  'src/orchestration/anchoredProviderSmoke.test.ts',
  'src/orchestration/realProviderProposalDryRun.test.ts',
  'src/orchestration/providerPromptAudit.test.ts',
  'src/orchestration/providerOutputValidator.test.ts',
  'src/orchestration/providerAnchorQuality.test.ts',
  'src/orchestration/providerAnchorCandidate.test.ts',
  'src/orchestration/providerProposalAnchors.test.ts',
  'src/orchestration/providerAnchorMatcher.test.ts',
  'src/orchestration/providerAnchorConflict.test.ts',
  'src/orchestration/providerAnchoredProposal.test.ts',
  'src/orchestration/providerAnchoringResult.test.ts',
  'src/orchestration/anchoredProposalRuntime.test.ts',
  'src/orchestration/anchoredProposalEval.test.ts',
  'src/orchestration/anchoredProposalScorecard.test.ts',
  'src/orchestration/harnessTrace.test.ts',
  'src/orchestration/harnessScorecard.test.ts',
  'src/orchestration/harnessFailureTaxonomy.test.ts',
  'src/session/sessionResultParity.test.ts',
  'src/session/continuationEvidenceParity.test.ts',
]

const realHomePathPattern =
  /(?:\/[^\s"'`<>]*\.private-agents-real|[A-Za-z]:[\\/]+Test[\\/]+home-sf)(?:[\\/][^\s"'`<>]*)?/gi
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi

console.log('gate name=live-real-provider-anchored-smoke')
console.log('mode=route199-openai-compatible-anchored-provider-smoke')
console.log('route=route199-openai-compatible-anchored-provider-smoke')
console.log('status taxonomy: pass=0 product-regression=1 provider-network=2 config-or-skip=3')
console.log('marker live-smoke-default-no-provider-call')
console.log('marker live-smoke-no-opt-in-safe-skip')
console.log('marker live-smoke-provider-not-configured-safe-skip')
console.log('marker live-smoke-provider-unavailable-safe-skip')
console.log('marker live-smoke-openai-compatible-adapter-approval')
console.log('marker live-smoke-openai-compatible-provider-boundary')
console.log('marker live-smoke-fake-ready-provider-called')
console.log('marker live-smoke-calibration-substrate')
console.log('marker live-smoke-result-provider-called-no-write')
console.log('marker live-smoke-harness-scorecard')
console.log('marker live-smoke-session-continue')
console.log('marker live-smoke-no-apply')
console.log('marker live-smoke-raw-output-excluded')
console.log('marker live-smoke-failure-taxonomy')

const liveOptIn = process.env.PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE?.trim() === '1'
const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === '1'
const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim()
const fakeReady = realProviderHome === fakeReadyHome

console.log(`live-smoke-opt-in=${liveOptIn ? 'true' : 'false'}`)
console.log(`real-provider-smoke-opt-in=${realProviderSmokeOptIn ? 'true' : 'false'}`)
console.log('private-config-manual-read=false')

let liveExitCode = 0
if (!liveOptIn) {
  printScriptSkip({
    name: 'live-anchored-provider-smoke-opt-in',
    skipReason: 'no-opt-in',
    providerKind: 'unknown',
    providerSafeLabel: 'not-ready',
    detail: 'Set PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE=1 to request the optional live provider smoke.',
  })
} else if (!realProviderSmokeOptIn && !fakeReady) {
  printScriptSkip({
    name: 'live-anchored-provider-smoke-real-provider-opt-in',
    skipReason: 'real-provider-smoke-not-enabled',
    providerKind: 'unknown',
    providerSafeLabel: 'not-ready',
    detail: 'Set PRIVATE_AGENTS_REAL_PROVIDER_SMOKE=1 to allow the approved real-provider boundary.',
  })
} else if (fakeReady) {
  liveExitCode = runAnchoredSmokeRunner({
    ...sanitizedProviderEnv(process.env),
    PRIVATE_AGENTS_ANCHORED_SMOKE_FAKE_READY: '1',
    PRIVATE_AGENTS_REAL_PROVIDER: 'openai-compatible',
    PRIVATE_AGENTS_ANCHORED_SMOKE_PROVIDER_SAFE_LABEL: 'fake-ready-openai-compatible',
    PRIVATE_AGENTS_ANCHORED_SMOKE_CONFIG_SOURCE: 'fake-ready',
  })
} else {
  const effective = buildEffectiveProviderEnv(process.env)
  console.log(`configSource=${effective.configSource}`)
  if (effective.providerEnvError) {
    printScriptSkip({
      name: 'live-anchored-provider-smoke-provider-env',
      skipReason: 'provider-not-configured',
      providerKind: 'unknown',
      providerSafeLabel: 'not-ready',
      detail: effective.providerEnvError.reason,
    })
  } else {
    const canonical = canonicalProviderEnv(effective.env)
    liveExitCode = runAnchoredSmokeRunner({
      ...sanitizedProviderEnv(process.env),
      ...canonical.env,
      PRIVATE_AGENTS_ANCHORED_SMOKE_CONFIG_SOURCE: effective.configSource,
      PRIVATE_AGENTS_ANCHORED_SMOKE_PROVIDER_SAFE_LABEL: canonical.providerSafeLabel,
    })
  }
}

const testExitCode = runFocusedTests()
if (liveExitCode !== 0) process.exit(liveExitCode)
process.exit(testExitCode)

function printScriptSkip(input) {
  console.log(`[skip] ${input.name}`)
  console.log(`skip-reason=${input.skipReason}`)
  console.log(`provider-kind=${input.providerKind}`)
  console.log(`provider-safe-label=${input.providerSafeLabel}`)
  console.log('adapter-approved=false')
  console.log('provider-called=false')
  console.log('provider-error-class=none')
  console.log('output-validation=none')
  console.log('anchor-quality=none')
  console.log('no-write=true')
  console.log('redaction-status=raw-content-excluded')
  console.log('mutation-authority=not-granted')
  console.log('raw-provider-output=excluded')
  if (input.detail) console.log(redact(input.detail))
}

function buildEffectiveProviderEnv(processEnv) {
  if (processEnv.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() !== '1') {
    return {
      env: processEnv,
      configSource: 'not-loaded-no-real-provider-opt-in',
    }
  }

  const providerEnvPath =
    processEnv.PRIVATE_AGENTS_PROVIDER_ENV?.trim() ||
    processEnv.PRIVATE_AGENTS_REAL_PROVIDER_ENV?.trim() ||
    defaultProviderEnvPath
  const explicitProviderEnvPath = Boolean(
    processEnv.PRIVATE_AGENTS_PROVIDER_ENV?.trim() ||
      processEnv.PRIVATE_AGENTS_REAL_PROVIDER_ENV?.trim(),
  )
  const loaded = parseApprovedProviderEnvFile(providerEnvPath)
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

function parseApprovedProviderEnvFile(filePath) {
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

function canonicalProviderEnv(env) {
  const provider = chooseProvider(env) ?? 'unknown'
  const apiKey = getTrimmed(env, [
    'PRIVATE_AGENTS_REAL_API_KEY',
    ...providerSpecificApiKeyNames(provider),
  ])
  const baseUrl = getTrimmed(env, [
    'PRIVATE_AGENTS_REAL_BASE_URL',
    'PRIVATE_AGENTS_PROVIDER_BASE_URL',
    'PRIVATE_AGENTS_BASE_URL',
    ...providerSpecificBaseUrlNames(provider),
  ])
  const model = getTrimmed(env, [
    'PRIVATE_AGENTS_REAL_MODEL',
    'PRIVATE_AGENTS_PROVIDER_MODEL',
    'PRIVATE_AGENTS_MODEL',
    ...providerSpecificModelNames(provider),
  ])
  return {
    providerSafeLabel: provider === 'openai-compatible' ? 'openai-compatible' : provider,
    env: {
      PRIVATE_AGENTS_REAL_PROVIDER: provider,
      ...(apiKey ? { PRIVATE_AGENTS_REAL_API_KEY: apiKey } : {}),
      ...(baseUrl ? { PRIVATE_AGENTS_REAL_BASE_URL: baseUrl } : {}),
      ...(model ? { PRIVATE_AGENTS_REAL_MODEL: model } : {}),
    },
  }
}

function chooseProvider(env) {
  const explicit = getTrimmed(env, [
    'PRIVATE_AGENTS_REAL_PROVIDER',
    'PRIVATE_AGENTS_PROVIDER',
    'provider',
    'PROVIDER',
  ])
  if (explicit) return normalizeProvider(explicit)
  if (getTrimmed(env, ['OPENAI_COMPATIBLE_API_KEY'])) return 'openai-compatible'
  if (
    getTrimmed(env, ['PRIVATE_AGENTS_REAL_API_KEY', 'OPENAI_API_KEY']) &&
    hasCompatibleBaseUrlHint(env)
  ) {
    return 'openai-compatible'
  }
  if (getTrimmed(env, ['GOOGLE_API_KEY'])) return 'google'
  if (getTrimmed(env, ['ANTIGRAVITY_API_KEY'])) return 'antigravity'
  if (getTrimmed(env, ['CLAUDECODE_API_KEY'])) return 'claudecode'
  if (getTrimmed(env, ['OPENAI_API_KEY'])) return 'openai'
  return undefined
}

function normalizeProvider(value) {
  const normalized = value?.trim().toLowerCase().replace(/_/g, '-')
  switch (normalized) {
    case 'compatible':
    case 'openaicompatible':
    case 'openai-compatible':
    case 'openai-compatible-api':
    case 'siliconflow':
    case 'deepseek':
      return 'openai-compatible'
    case 'openai':
    case 'google':
    case 'antigravity':
    case 'claudecode':
      return normalized
    default:
      return normalized || undefined
  }
}

function hasCompatibleBaseUrlHint(env) {
  return Boolean(
    getTrimmed(env, [
      'PRIVATE_AGENTS_REAL_BASE_URL',
      'PRIVATE_AGENTS_PROVIDER_BASE_URL',
      'PRIVATE_AGENTS_BASE_URL',
      'OPENAI_COMPATIBLE_BASE_URL',
      'OPENAI_API_BASE',
      'OPENAI_API_BASE_URL',
      'OPENAI_BASE_URL',
      'API_BASE_URL',
      'BASE_URL',
    ]),
  )
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

function getTrimmed(env, names) {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

function runAnchoredSmokeRunner(env) {
  const runnerBundle = buildAnchoredSmokeRunnerBundle(env)
  const outputDir = path.dirname(runnerBundle)
  const stdoutPath = path.join(outputDir, 'anchoredSmokeRunner.stdout.log')
  const stderrPath = path.join(outputDir, 'anchoredSmokeRunner.stderr.log')
  const stdoutFd = fs.openSync(stdoutPath, 'w')
  const stderrFd = fs.openSync(stderrPath, 'w')
  const result = spawnSync(process.execPath, [runnerBundle], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', stdoutFd, stderrFd],
  })
  fs.closeSync(stdoutFd)
  fs.closeSync(stderrFd)
  const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : ''
  const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : ''
  if (stdout) fs.writeSync(process.stdout.fd, redact(stdout))
  if (stderr) fs.writeSync(process.stderr.fd, redact(stderr))
  return result.status ?? 1
}

function buildAnchoredSmokeRunnerBundle(env) {
  const esbuild = require('esbuild')
  const testRoot = env.PRIVATE_AGENTS_TEST_ROOT?.trim() || '/tmp/private-agents-test'
  const bundleDir = path.join(testRoot, 'live-real-provider-anchored-smoke', 'runner')
  fs.mkdirSync(bundleDir, { recursive: true })
  const outfile = path.join(bundleDir, 'anchoredSmokeRunner.cjs')
  esbuild.buildSync({
    entryPoints: [anchoredSmokeRunnerPath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent',
  })
  return outfile
}

function runFocusedTests() {
  const testEnv = sanitizedProviderEnv(process.env)
  testEnv.PRIVATE_AGENTS_PROVIDER_MODE = 'synthetic'
  testEnv.PRIVATE_AGENTS_REAL_HOME = ''
  testEnv.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE = ''
  testEnv.PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE = ''

  const result = spawnSync(
    'npm',
    ['run', 'test', '-w', 'packages/ts-shell', '--', ...focusedTests],
    {
      stdio: 'inherit',
      env: testEnv,
    },
  )

  if (result.status !== 0) {
    console.log(`[product-regression] live-anchored-provider-smoke - focused tests exited ${result.status}`)
    return result.status ?? 1
  }

  console.log('[pass] live-anchored-provider-smoke - focused module tests passed')
  return 0
}

function sanitizedProviderEnv(source) {
  const env = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') env[key] = value
  }
  for (const key of [
    'PRIVATE_AGENTS_REAL_API_KEY',
    'OPENAI_API_KEY',
    'OPENAI_COMPATIBLE_API_KEY',
    'GOOGLE_API_KEY',
    'ANTIGRAVITY_API_KEY',
    'CLAUDECODE_API_KEY',
    'PRIVATE_AGENTS_PROVIDER_ENV',
    'PRIVATE_AGENTS_REAL_PROVIDER_ENV',
  ]) {
    delete env[key]
  }
  return env
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
}
