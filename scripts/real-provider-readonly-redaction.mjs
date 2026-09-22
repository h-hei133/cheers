#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REAL_HOME_CONFIG_PATTERN =
  /[A-Za-z]:[\\/]+Test[\\/]+home-sf[\\/]+\.(?:cheers|cheer|private-agents|coding-agents)[\\/]+config\.json/gi
const REAL_HOME_PATTERN = /[A-Za-z]:[\\/]+Test[\\/]+home-sf(?:[\\/][^\s"'`<>]*)?/gi
const WINDOWS_CHEERS_CONFIG_PATTERN =
  /[A-Za-z]:[\\/]+[^\s"'`<>]+[\\/]+\.(?:cheers|cheer|private-agents|coding-agents)[\\/]+config\.json/gi
const POSIX_CHEERS_CONFIG_PATTERN =
  /\/[^\s"'`<>]+\/\.(?:cheers|cheer|private-agents|coding-agents)\/config\.json/gi
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const AUTHORIZATION_BEARER_PATTERN =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const KEY_VALUE_SECRET_PATTERN =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key|token|signature|sig)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const OPENAI_STYLE_KEY_PATTERN = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi

const FORBIDDEN_PROVIDER_DETAIL_PATTERNS = [
  { label: 'real-provider-home', pattern: /D:[\\/]+Test[\\/]+home-sf/i },
  { label: 'user-config-path', pattern: /\.(?:cheers|cheer|private-agents|coding-agents)[\\/]+config\.json/i },
  { label: 'bearer-token', pattern: /Bearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i },
  { label: 'api-key-value', pattern: /\b(api[_-]?key|x-api-key)\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'access-token-value', pattern: /\baccess[_-]?token\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'refresh-token-value', pattern: /\brefresh[_-]?token\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'openai-style-key', pattern: /\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/i },
  { label: 'secret-query-param', pattern: /[?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=(?!\[REDACTED\])[^&\s"'`<>]+/i },
]

export function redactReadonlyProviderOutput(input) {
  return String(input ?? '')
    .replace(
      AUTHORIZATION_BEARER_PATTERN,
      (_match, prefix, quote) => `${prefix}${quote}Bearer [REDACTED]`,
    )
    .replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]')
    .replace(
      KEY_VALUE_SECRET_PATTERN,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    )
    .replace(OPENAI_STYLE_KEY_PATTERN, '[REDACTED_API_KEY]')
    .replace(SECRET_QUERY_PARAM_PATTERN, '$1[REDACTED]')
    .replace(REAL_HOME_CONFIG_PATTERN, '[REAL_PROVIDER_CONFIG_PATH]')
    .replace(WINDOWS_CHEERS_CONFIG_PATTERN, '[CHEERS_CONFIG_PATH]')
    .replace(POSIX_CHEERS_CONFIG_PATTERN, '[CHEERS_CONFIG_PATH]')
    .replace(REAL_HOME_PATTERN, '[REAL_PROVIDER_HOME]')
}

export function assertReadonlyProviderOutputRedacted(input) {
  const text = String(input ?? '')
  const leaks = FORBIDDEN_PROVIDER_DETAIL_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.label)

  return {
    ok: leaks.length === 0,
    leaks,
  }
}

export function redactAndAssertReadonlyProviderOutput(input) {
  const redacted = redactReadonlyProviderOutput(input)
  const assertion = assertReadonlyProviderOutputRedacted(redacted)
  return {
    redacted,
    ...assertion,
  }
}

function runSelfTest() {
  const sample = [
    'Authorization: Bearer sk-live-secret-123456789',
    'api_key=sk-query-secret-123456789',
    'refresh_token=refresh-secret',
    'accessToken: access-secret',
    'https://example.test/v1?api_key=sk-url-secret&signature=sig-secret',
    'D:/Test/home-sf/.cheers/config.json',
  ].join('\n')

  const result = redactAndAssertReadonlyProviderOutput(sample)
  const hasMarkers =
    result.redacted.includes('Bearer [REDACTED]') &&
    result.redacted.includes('api_key=[REDACTED]') &&
    result.redacted.includes('refresh_token=[REDACTED]') &&
    (result.redacted.includes('[REAL_PROVIDER_CONFIG_PATH]') ||
      result.redacted.includes('[CHEERS_CONFIG_PATH]'))
  const passed = result.ok && hasMarkers

  console.log(`[${passed ? 'PASS' : 'FAIL'}] real-provider-readonly-redaction-self-test`)
  if (!passed) {
    console.log(`leaks=${result.leaks.join(',') || 'none'}`)
  }
  process.exitCode = passed ? 0 : 1
}

const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false

if (isMain) {
  if (process.argv.includes('--self-test')) {
    runSelfTest()
  } else {
    console.log('Usage: node scripts/real-provider-readonly-redaction.mjs --self-test')
  }
}
