import fs from 'node:fs'
import path from 'node:path'

export const approvedRealProviderHome = '/home/wang/.private-agents-real'
export const defaultProviderEnvPath = path.join(approvedRealProviderHome, 'provider.env')
export const fakeReadyHome = '/tmp/private-agents-fake-ready'

export function buildEffectiveProviderEnv(processEnv) {
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

export function parseApprovedProviderEnvFile(filePath) {
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

export function canonicalProviderEnv(env) {
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

export function sanitizedProviderEnv(source) {
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
