#!/usr/bin/env node

import {
  canonicalProviderEnv,
  sanitizedProviderEnv,
} from './approvedProviderEnv.mjs'

const secret = 'test-secret-token'
const env = {
  CHEERS_REAL_PROVIDER: 'openai-compatible',
  CHEERS_REAL_API_KEY: 'primary-secret-token',
  CHEERS_REAL_BASE_URL: 'https://primary.example.test/v1',
  CHEERS_REAL_MODEL: 'primary-model',
  CHEERS_REAL_FALLBACK_API_KEY: secret,
  CHEERS_REAL_FALLBACK_BASE_URL: 'https://fallback.example.test/v1',
  CHEERS_REAL_FALLBACK_MODEL: 'fallback-model',
  Authorization: `Bearer ${secret}`,
}

const canonical = canonicalProviderEnv(env)
assert(canonical.fallback?.env.CHEERS_REAL_FALLBACK_CONFIGURED === '1', 'fallback configured marker missing')
assert(canonical.fallback?.providerSafeLabel === 'openai-compatible-fallback', 'fallback safe label missing')
assert(canonical.fallback?.env.CHEERS_REAL_FALLBACK_PROVIDER === 'openai-compatible', 'fallback provider missing')

const sanitized = sanitizedProviderEnv(env)
assert(!('CHEERS_REAL_API_KEY' in sanitized), 'primary key was not removed')
assert(!('CHEERS_REAL_FALLBACK_API_KEY' in sanitized), 'fallback key was not removed')
assert(JSON.stringify(sanitized).includes(secret) === false, 'sanitized output retained secret material')

console.log('[pass] approved-provider-env-fallback-self-test')

function assert(condition, message) {
  if (!condition) {
    console.error(`[fail] approved-provider-env-fallback-self-test - ${message}`)
    process.exit(1)
  }
}
