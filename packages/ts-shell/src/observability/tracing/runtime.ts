import { getGlobalRotatingFileSink } from '../rotatingFileSink.js';
import { runMetrics } from '../metrics.js';
import { JsonlTraceStore } from './jsonlStore.js';
import { runTraceScope, type TraceScope } from './context.js';
import { InMemoryTraceStore } from './span.js';
import type { TelemetryContext } from './types.js';
import type { OperationSpan } from './operations.js';
import { traceParentCarrier } from './carrier.js';

/** Capture storage once; async settlement never re-resolves the current profile. */
export function runSessionTrace<T>(
  identity: { readonly sessionId: string; readonly workspaceRoot: string },
  callback: (span: OperationSpan<'session.run'>) => T | Promise<T>,
  recorder?: TelemetryContext,
  traceParent?: string,
): Promise<T> {
  const persist = !process.env.VITEST && process.env.NODE_ENV !== 'test';
  let scope: TraceScope = identity;
  let context = recorder;
  if (persist) {
    try {
      const sink = getGlobalRotatingFileSink();
      scope = { ...identity, sink };
      context ??= new JsonlTraceStore({ sink, sessionId: identity.sessionId });
    } catch { /* Tracing must remain available in memory when persistence is unavailable. */ }
  }
  context ??= new InMemoryTraceStore();
  return runTraceScope(context, scope, { name: 'session.run', attributes: identity }, span => runMetrics(async () => {
    try { return await callback(span); }
    catch (error) {
      span.setStatus({ status: 'error', error: { name: 'RunError', message: 'Session run failed.' } });
      throw error;
    }
  }), traceParentCarrier(traceParent));
}
