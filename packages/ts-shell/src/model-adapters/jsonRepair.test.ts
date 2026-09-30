import { describe, expect, it } from 'vitest'
import {
  parseJsonWithRepair,
  repairJson,
} from './jsonRepair.js'

describe('jsonRepair', () => {
  it('parses valid JSON without alteration', () => {
    const valid = '{"command":"echo hello","timeout":30}'
    expect(parseJsonWithRepair(valid)).toEqual({ command: 'echo hello', timeout: 30 })
  })

  it('repairs unescaped newlines and tabs inside strings', () => {
    const raw = '{"code":"function test() {\n\treturn 1;\n}"}'
    const repaired = repairJson(raw)
    expect(repaired).toContain('\\n\\t')
    expect(parseJsonWithRepair(raw)).toEqual({ code: 'function test() {\n\treturn 1;\n}' })
  })

  it('repairs unescaped double quotes and trailing backslashes', () => {
    const raw = '{"path":"C:\\Users\\test\\'
    const parsed = parseJsonWithRepair<Record<string, unknown>>(raw)
    expect(typeof parsed).toBe('object')
  })

  it('recovers partial streaming objects gracefully', () => {
    const partial = '{"path":"src/index.ts","offset":10'
    const parsed = parseJsonWithRepair<{ path: string; offset: number }>(partial)
    expect(parsed.path).toBe('src/index.ts')
    expect(parsed.offset).toBe(10)
  })

  it('rejects empty or whitespace-only tool arguments', () => {
    expect(() => parseJsonWithRepair('')).toThrow('Unable to parse JSON payload')
    expect(() => parseJsonWithRepair('   ')).toThrow('Unable to parse JSON payload')
  })
})
