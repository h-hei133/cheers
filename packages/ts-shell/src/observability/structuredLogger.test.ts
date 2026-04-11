import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createComponentLogger,
  redactSecrets,
  redactSecretsFromObject,
  setStructuredLogSink,
  type StructuredLogEntry,
} from './structuredLogger.js'
import { createTraceContext, resetTraceContext, setGlobalTraceContext } from './traceContext.js'

describe('structured logger', () => {
  let captured: StructuredLogEntry[] = []

  beforeEach(() => {
    captured = []
    resetTraceContext()
    setGlobalTraceContext(createTraceContext())
    setStructuredLogSink(entry => captured.push(entry))
  })

  afterEach(() => {
    setStructuredLogSink(null)
    resetTraceContext()
  })

  it('redacts secrets in strings and objects', () => {
    expect(redactSecrets('token sk_12345678901234567890')).toContain('[REDACTED]')

    const redacted = redactSecretsFromObject({
      apiKey: 'sk_12345678901234567890',
      nested: { password: 'secret' },
      normal: 'ok',
    }) as { apiKey: string; nested: { password: string }; normal: string }

    expect(redacted.apiKey).toBe('[REDACTED]')
    expect(redacted.nested.password).toBe('[REDACTED]')
    expect(redacted.normal).toBe('ok')
  })

  it('emits structured entries with trace correlation', () => {
    const logger = createComponentLogger('test-component')
    logger.info('hello', { apiKey: 'sk_12345678901234567890', safe: 'value' })

    expect(captured).toHaveLength(1)
    expect(captured[0].component).toBe('test-component')
    expect(captured[0].traceId).toMatch(/^trace_/)
    expect(captured[0].spanId).toMatch(/^span_/)
    expect(captured[0].fields.apiKey).toBe('[REDACTED]')
    expect(captured[0].fields.safe).toBe('value')
  })
})
