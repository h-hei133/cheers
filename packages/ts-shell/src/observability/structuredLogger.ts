import {
  createChildSpan,
  getGlobalTraceContext,
  type TraceContext,
} from './traceContext.js'

export interface StructuredLogEntry {
  readonly timestamp: string
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly component: string
  readonly message: string
  readonly fields: Record<string, unknown>
}

const secretPatterns = [
  /\bsk_[A-Za-z0-9_-]{16,}\b/g,
  /\bpk_[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /https?:\/\/([^:\s]+):([^@\s]+)@/gi,
  /eyJ[A-Za-z0-9_\-.]+\.eyJ[A-Za-z0-9_\-.]+\.[A-Za-z0-9_\-.]+/g,
]

const sensitiveKeys = ['secret', 'token', 'password', 'apiKey', 'api_key', 'authorization']

let globalSink: ((entry: StructuredLogEntry) => void) | null = null

export function setStructuredLogSink(sink: ((entry: StructuredLogEntry) => void) | null): void {
  globalSink = sink
}

export function redactSecrets(value: string): string {
  let next = value
  for (const pattern of secretPatterns) {
    next = next.replace(pattern, '[REDACTED]')
  }
  return next
}

export function redactSecretsFromObject(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value)
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSecretsFromObject(item))
  }

  if (typeof value === 'object' && value !== null) {
    const redacted: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKeys.includes(key) || sensitiveKeys.includes(key.toLowerCase())) {
        redacted[key] = '[REDACTED]'
      } else {
        redacted[key] = redactSecretsFromObject(item)
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

  private emit(
    level: StructuredLogEntry['level'],
    message: string,
    fields: Record<string, unknown>,
  ): void {
    globalSink?.({
      timestamp: new Date().toISOString(),
      level,
      traceId: this.traceContext.traceId,
      spanId: this.traceContext.spanId,
      parentSpanId: this.traceContext.parentSpanId,
      component: this.component,
      message: redactSecrets(message),
      fields: redactSecretsFromObject(fields) as Record<string, unknown>,
    })
  }
}

export function createComponentLogger(
  component: string,
  traceContext?: TraceContext,
): StructuredLogger {
  return new StructuredLogger(component, traceContext)
}
