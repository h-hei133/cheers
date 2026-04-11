import { randomUUID } from 'node:crypto'

export interface TraceContext {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
}

let globalTraceContext: TraceContext | null = null

export function createTraceContext(): TraceContext {
  return {
    traceId: `trace_${randomUUID()}`,
    spanId: `span_${randomUUID()}`,
  }
}

export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: `span_${randomUUID()}`,
    parentSpanId: parent.spanId,
  }
}

export function setGlobalTraceContext(context: TraceContext): void {
  globalTraceContext = context
}

export function getGlobalTraceContext(): TraceContext {
  if (!globalTraceContext) {
    globalTraceContext = createTraceContext()
  }
  return globalTraceContext
}

export function resetTraceContext(): void {
  globalTraceContext = null
}
