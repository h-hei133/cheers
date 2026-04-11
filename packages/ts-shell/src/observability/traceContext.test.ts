import { afterEach, describe, expect, it } from 'vitest'
import {
  createChildSpan,
  createTraceContext,
  getGlobalTraceContext,
  resetTraceContext,
  setGlobalTraceContext,
} from './traceContext.js'

describe('trace context', () => {
  afterEach(() => {
    resetTraceContext()
  })

  it('creates unique root trace contexts', () => {
    const first = createTraceContext()
    const second = createTraceContext()

    expect(first.traceId).toMatch(/^trace_/)
    expect(first.spanId).toMatch(/^span_/)
    expect(first.traceId).not.toBe(second.traceId)
    expect(first.spanId).not.toBe(second.spanId)
  })

  it('creates child spans under the same trace', () => {
    const root = createTraceContext()
    const child = createChildSpan(root)

    expect(child.traceId).toBe(root.traceId)
    expect(child.parentSpanId).toBe(root.spanId)
    expect(child.spanId).not.toBe(root.spanId)
  })

  it('lazily initializes and reuses the global trace context', () => {
    const first = getGlobalTraceContext()
    const second = getGlobalTraceContext()
    expect(first).toEqual(second)

    const custom = createTraceContext()
    setGlobalTraceContext(custom)
    expect(getGlobalTraceContext()).toEqual(custom)
  })
})
