import { AsyncLocalStorage } from 'node:async_hooks';
import type { StructuredLogEntry } from '../types.js';
import type { SpanOptions, TelemetryCarrier, TelemetryContext, TelemetrySpan } from './types.js';
import { recordSpan } from './safe.js';
import { workspaceIdentity } from './scope.js';
import { MAX_SPAN_ATTRIBUTES } from './records.js';
import type { SpanAttributes } from './types.js';
import type { OperationName, OperationOptions, OperationSpan } from './operations.js';
import { traceIdentity } from './carrier.js';

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

type CapturedTraceScope = TraceScope & { readonly workspaceIdentity: string };

function scopedAttributes(attributes: SpanAttributes | undefined, scope: CapturedTraceScope): SpanAttributes {
  const reserved = new Set(['sessionId', 'workspaceRoot', 'workspaceIdentity']);
  const retained = Object.entries(attributes ?? {}).filter(([name]) => !reserved.has(name))
    .slice(0, MAX_SPAN_ATTRIBUTES - reserved.size);
  return { sessionId: scope.sessionId, workspaceRoot: scope.workspaceRoot,
    workspaceIdentity: scope.workspaceIdentity, ...Object.fromEntries(retained) };
}

interface ActiveTrace {
  readonly span: TelemetrySpan;
  readonly scope: CapturedTraceScope;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly parentSpanId?: string;
  readonly toolRequests: Map<string, { readonly requestId: string; readonly span: TelemetrySpan }>;
}

const activeTrace = new AsyncLocalStorage<ActiveTrace>();

export function currentTrace(): ActiveTrace | undefined {
  return activeTrace.getStore();
}

/** A deferred instrumentation write returns to the scope it captured. */
export function bindTrace<Args extends unknown[], T>(callback: (...args: Args) => T): (...args: Args) => T {
  const captured = currentTrace();
  return (...args) => captured ? activeTrace.run(captured, callback, ...args) : activeTrace.exit(callback, ...args);
}

export function runTraceScope<T>(
  recorder: TelemetryContext,
  scope: TraceScope,
  options: SpanOptions,
  callback: (span: TelemetrySpan) => T | Promise<T>,
  carrier?: TelemetryCarrier,
): Promise<T> {
  const captured = Object.freeze({ ...scope, workspaceIdentity: workspaceIdentity(scope.workspaceRoot) });
  const remote = traceIdentity(carrier);
  let context = recorder;
  if (remote) {
    try { context = recorder.propagation?.extract(carrier) ?? recorder; }
    catch { /* A recorder without working extraction still records the local run. */ }
  }
  return recordSpan(context, { ...options, attributes: scopedAttributes(options.attributes, captured) }, span => {
    const local = traceIdentity(span.propagation?.inject(span));
    return activeTrace.run({ span, scope: captured, ...local,
      parentSpanId: remote && local?.traceId === remote.traceId ? remote.spanId : undefined,
      toolRequests: new Map(),
    }, () => callback(span));
  });
}

/** Unbound callers retain their ordinary behavior; traced callers inherit the run. */
export function traceOperation<Name extends OperationName, T>(
  options: OperationOptions<Name>,
  callback: (span: OperationSpan<Name> | undefined) => T | Promise<T>,
): Promise<T> {
  const parent = currentTrace();
  if (!parent) return Promise.resolve().then(() => callback(undefined));
  return parent.span.startSpan({ ...options, attributes: scopedAttributes(options.attributes, parent.scope) }, span => {
    const carrier = span.propagation?.inject(span);
    return activeTrace.run({ span, scope: parent.scope, ...traceIdentity(carrier), parentSpanId: parent.spanId,
      toolRequests: parent.toolRequests,
    }, async () => {
      try { return await callback(span as OperationSpan<Name>); }
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
