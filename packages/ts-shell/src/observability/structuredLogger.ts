import {
  createChildSpan,
  getGlobalTraceContext,
  type TraceContext,
} from './traceContext.js'
import { getGlobalRotatingFileSink } from './rotatingFileSink.js'
import type { StructuredLogEntry } from './types.js'

export type { StructuredLogEntry } from './types.js'
const secretPatterns = [
  /\bsk[-_][A-Za-z0-9_-]{16,}\b/g,
  /\bpk[-_][A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /https?:\/\/([^:\s]+):([^@\s]+)@/gi,
  /eyJ[A-Za-z0-9_\-.]+\.eyJ[A-Za-z0-9_\-.]+\.[A-Za-z0-9_\-.]+/g,
];

const sensitiveKeys = ['secret', 'token', 'password', 'apiKey', 'api_key', 'authorization']

let globalSink: ((entry: StructuredLogEntry) => void) | null = null
let enableFilePersistence: boolean = true

export function setStructuredLogSink(sink: ((entry: StructuredLogEntry) => void) | null): void {
  globalSink = sink
}

export function setFilePersistenceEnabled(enabled: boolean): void {
  enableFilePersistence = enabled
}

export function redactSecrets(value: string): string {
  let next = value
  for (const pattern of secretPatterns) {
    next = next.replace(pattern, '[REDACTED]')
  }
  return next
}

export function redactSecretsFromObject(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value)
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return '[CIRCULAR]'
    }
    seen.add(value)

    if (Array.isArray(value)) {
      return value.map(item => redactSecretsFromObject(item, seen))
    }

    const redacted: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      const lowerKey = key.toLowerCase()
      const isSensitive =
        sensitiveKeys.some(s => lowerKey.includes(s.toLowerCase())) ||
        /token|secret|password|apikey|auth/i.test(key)

      if (isSensitive) {
        redacted[key] = '[REDACTED]'
      } else {
        redacted[key] = redactSecretsFromObject(item, seen)
      }
    }
    return redacted
  }

  return value
}

export class StructuredLogger {
  private readonly component: string
  private readonly traceContext: TraceContext

  constructor(component: string, traceContext: TraceContext = createChildSpan(getGlobalTraceContext())) {
    this.component = component
    this.traceContext = traceContext
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.emit('debug', message, fields)
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.emit('info', message, fields)
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.emit('warn', message, fields)
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.emit('error', message, fields)
  }

  child(subComponent: string): StructuredLogger {
    const childContext = createChildSpan(this.traceContext)
    return new StructuredLogger(`${this.component}.${subComponent}`, childContext)
  }

  private emit(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields: Record<string, unknown>,
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      traceId: this.traceContext.traceId,
      spanId: this.traceContext.spanId,
      parentSpanId: this.traceContext.parentSpanId,
      component: this.component,
      message: redactSecrets(message),
      fields: redactSecretsFromObject(fields) as Record<string, unknown>,
    }

    if (globalSink) {
      try {
        globalSink(entry)
      } catch {
        // Sinks are side-channels
      }
    }

    if (enableFilePersistence && !process.env.VITEST && process.env.NODE_ENV !== 'test') {
      try {
        getGlobalRotatingFileSink().write(entry)
      } catch {
        // Non-blocking
      }
    }
  }
}

export function createComponentLogger(
  component: string,
  traceContext?: TraceContext,
): StructuredLogger {
  return new StructuredLogger(component, traceContext)
}
