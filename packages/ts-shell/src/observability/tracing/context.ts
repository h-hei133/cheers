import { AsyncLocalStorage } from 'node:async_hooks';
import type { StructuredLogEntry } from '../types.js';
import type { SpanOptions, TelemetryCarrier, TelemetryContext, TelemetrySpan } from './types.js';
import { recordSpan } from './safe.js';

/** The sink is captured by the run owner, including its profile storage scope. */
export interface TraceLogSink {
  write(entry: StructuredLogEntry): void;
  getLogDir(): string;
  getCurrentFilePath(): string;
}

export interface TraceScope {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly sink?: TraceLogSink;
}

interface ActiveTrace {
  readonly span: TelemetrySpan;
  readonly scope: TraceScope;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly toolRequests: Map<string, { readonly requestId: string; readonly span: TelemetrySpan }>;
}

const activeTrace = new AsyncLocalStorage<ActiveTrace>();

/** Read recorder-owned properties inside the instrumentation boundary. */
function identity(carrier: TelemetryCarrier | undefined): { traceId?: string; spanId?: string } {
  try {
    const traceId = carrier?.['cheers-trace-id'];
    const spanId = carrier?.['cheers-span-id'];
    if (typeof traceId !== 'string' || !/^[a-f0-9]{32}$/.test(traceId) || /^0+$/.test(traceId)
      || typeof spanId !== 'string' || !/^[a-f0-9]{16}$/.test(spanId) || /^0+$/.test(spanId)) return {};
    return { traceId, spanId };
  } catch { return {}; }
}

export function currentTrace(): ActiveTrace | undefined {
  return activeTrace.getStore();
}

export function runTraceScope<T>(
  recorder: TelemetryContext,
  scope: TraceScope,
  options: SpanOptions,
  callback: (span: TelemetrySpan) => T | Promise<T>,
): Promise<T> {
  const captured = Object.freeze({ ...scope });
  return recordSpan(recorder, options, span => {
    const carrier = span.propagation?.inject(span);
    return activeTrace.run({ span, scope: captured, ...identity(carrier),
      toolRequests: new Map(),
    }, () => callback(span));
  });
}

/** Unbound callers retain their ordinary behavior; traced callers inherit the run. */
export function traceOperation<T>(
  options: SpanOptions,
  callback: (span: TelemetrySpan | undefined) => T | Promise<T>,
): Promise<T> {
  const parent = currentTrace();
  if (!parent) return Promise.resolve().then(() => callback(undefined));
  return parent.span.startSpan({ ...options, attributes: {
    ...options.attributes, sessionId: parent.scope.sessionId, workspaceRoot: parent.scope.workspaceRoot,
  } }, span => {
    const carrier = span.propagation?.inject(span);
    return activeTrace.run({ span, scope: parent.scope, ...identity(carrier), parentSpanId: parent.spanId,
      toolRequests: parent.toolRequests,
    }, async () => {
      try { return await callback(span); }
      catch (error) {
        // Provider bodies and arbitrary thrown values must not become trace text.
        span.setStatus({ status: 'error', error: { name: 'OperationError', message: 'Operation failed.' } });
        throw error;
      }
    });
  });
}

export function rememberToolRequests(requestId: string, toolIds: readonly string[]): void {
  const active = currentTrace();
  if (!active) return;
  for (const toolId of toolIds.slice(0, 256)) {
    if (active.toolRequests.size >= 256) active.toolRequests.delete(active.toolRequests.keys().next().value!);
    active.toolRequests.set(toolId, { requestId, span: active.span });
  }
}

export function toolRequest(toolId: string): { readonly requestId: string; readonly span: TelemetrySpan } | undefined {
  return currentTrace()?.toolRequests.get(toolId);
}
