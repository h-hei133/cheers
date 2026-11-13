export const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000
export const MAX_SCRIPT_TIMEOUT_MS = 120_000
export const DEFAULT_MAX_OUTPUT_CHARS = 64 * 1024
export const MAX_OUTPUT_TOKENS_CEILING = 32_000

const ALLOWED_OPTION_KEYS = new Set(['timeout_ms', 'max_output_tokens'])

export interface ParsedCodemodeScript {
  readonly timeoutMs: number
  readonly maxOutputChars: number
  readonly strippedCode: string
}

/**
 * Parse optional first-line `// @options: {...}` metadata and strip it with a
 * blank line so user error line numbers stay 1:1 with the input script.
 */
export function parseCodemodeScript(code: string): ParsedCodemodeScript {
  const lines = code.split('\n')
  let timeoutMs = DEFAULT_SCRIPT_TIMEOUT_MS
  let maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim()
    if (!trimmed.startsWith('// @options:')) continue
    if (index > 0) {
      throw new Error('// @options: comment must appear on line 1.')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed.slice('// @options:'.length).trim())
    } catch {
      throw new Error('Invalid JSON in // @options: comment.')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('// @options: must be a JSON object.')
    }
    const obj = parsed as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      if (!ALLOWED_OPTION_KEYS.has(key)) {
        throw new Error(`Unknown // @options: key '${key}'.`)
      }
    }
    if ('timeout_ms' in obj) {
      if (typeof obj.timeout_ms !== 'number' || !Number.isFinite(obj.timeout_ms)) {
        throw new Error('// @options: timeout_ms must be a finite number.')
      }
      timeoutMs = Math.max(100, Math.min(MAX_SCRIPT_TIMEOUT_MS, Math.trunc(obj.timeout_ms)))
    }
    if ('max_output_tokens' in obj) {
      if (typeof obj.max_output_tokens !== 'number' || !Number.isFinite(obj.max_output_tokens) || obj.max_output_tokens < 64) {
        throw new Error('// @options: max_output_tokens must be a finite number >= 64.')
      }
      const tokens = Math.min(MAX_OUTPUT_TOKENS_CEILING, Math.trunc(obj.max_output_tokens))
      maxOutputChars = tokens * 4
    }
    lines[0] = ''
  }

  return {
    timeoutMs,
    maxOutputChars,
    strippedCode: lines.join('\n'),
  }
}
