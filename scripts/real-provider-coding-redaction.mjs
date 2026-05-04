#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const WINDOWS_PRIVATE_AGENTS_CONFIG_PATTERN =
  /[A-Za-z]:[\\/]+[^\s"'`<>]+[\\/]+\.private-agents[\\/]+config\.json/gi
const POSIX_PRIVATE_AGENTS_CONFIG_PATTERN =
  /\/[^\s"'`<>]+\/\.private-agents\/config\.json/gi
const REAL_HOME_PATTERN = /[A-Za-z]:[\\/]+Test[\\/]+home-sf(?:[\\/][^\s"'`<>]*)?/gi
const POSIX_REAL_HOME_PATTERN =
  /\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const AUTHORIZATION_BEARER_PATTERN =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const KEY_VALUE_SECRET_PATTERN =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key|token|authorization|signature|sig)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const OPENAI_STYLE_KEY_PATTERN = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const SECRET_QUERY_PARAM_PATTERN =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|authorization|signature|sig)=)[^&\s"'`<>]+/gi

const FORBIDDEN_PROVIDER_DETAIL_PATTERNS = [
  { label: 'real-provider-home', pattern: /D:[\\/]+Test[\\/]+home-sf/i },
  { label: 'posix-real-provider-home', pattern: /\/[^\s"'`<>]*\.private-agents-real/i },
  { label: 'private-agents-config-path', pattern: /\.private-agents[\\/]+config\.json/i },
  { label: 'bearer-token', pattern: /Bearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i },
  { label: 'api-key-value', pattern: /\b(api[_-]?key|x-api-key)\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'access-token-value', pattern: /\baccess[_-]?token\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'refresh-token-value', pattern: /\brefresh[_-]?token\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'authorization-value', pattern: /\bauthorization\s*[:=]\s*(?!["']?\[REDACTED\])["']?[^\s"'`,;]+/i },
  { label: 'openai-style-key', pattern: /\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/i },
  { label: 'secret-query-param', pattern: /[?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|authorization|signature|sig)=(?!\[REDACTED\])[^&\s"'`<>]+/i },
]

export function redactCodingProviderOutput(input) {
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
    .replace(WINDOWS_PRIVATE_AGENTS_CONFIG_PATTERN, '[PRIVATE_AGENTS_CONFIG_PATH]')
    .replace(POSIX_PRIVATE_AGENTS_CONFIG_PATTERN, '[PRIVATE_AGENTS_CONFIG_PATH]')
    .replace(REAL_HOME_PATTERN, '[REAL_PROVIDER_HOME]')
    .replace(POSIX_REAL_HOME_PATTERN, '[REAL_PROVIDER_HOME]')
}

export function assertCodingProviderOutputRedacted(input) {
  const text = String(input ?? '')
  const leaks = FORBIDDEN_PROVIDER_DETAIL_PATTERNS
    .filter((item) => item.pattern.test(text))
    .map((item) => item.label)

  return {
    ok: leaks.length === 0,
    leaks,
  }
}

export function redactAndAssertCodingProviderOutput(input) {
  const redacted = redactCodingProviderOutput(input)
  const assertion = assertCodingProviderOutputRedacted(redacted)
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
    'access_token=access-secret',
    'https://example.test/v1?api_key=sk-url-secret&signature=sig-secret',
    'D:/Test/home-sf/.private-agents/config.json',
    '/home/example/.private-agents-real/.private-agents/config.json',
    '/home/wang/.private-agents-real/.private-agents/sessions/session-1/transcript.jsonl',
  ].join('\n')

  const result = redactAndAssertCodingProviderOutput(sample)
  const hasMarkers =
    (result.redacted.includes('Bearer [REDACTED]') ||
      result.redacted.includes('Authorization: [REDACTED]')) &&
    result.redacted.includes('api_key=[REDACTED]') &&
    result.redacted.includes('refresh_token=[REDACTED]') &&
    result.redacted.includes('[PRIVATE_AGENTS_CONFIG_PATH]') &&
    result.redacted.includes('[REAL_PROVIDER_HOME]') &&
    !result.redacted.includes('.private-agents-real')
  const passed = result.ok && hasMarkers

  console.log(`[${passed ? 'PASS' : 'FAIL'}] real-provider-coding-redaction-self-test`)
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
    console.log('Usage: node scripts/real-provider-coding-redaction.mjs --self-test')
  }
}
