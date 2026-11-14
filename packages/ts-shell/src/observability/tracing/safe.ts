import type { SpanOptions, TelemetryContext, TelemetryPropagation, TelemetrySpan } from './types.js';

const originals = new WeakMap<TelemetryContext, TelemetryContext>();
const noop = (): void => {};
const inert: TelemetrySpan = {
  startSpan: (_options, callback) => Promise.resolve().then(() => callback(inert)),
  addLink: noop, addEvent: noop, setAttributes: noop, setStatus: noop,
};

function observe(action: () => void): void {
  try { void Promise.resolve(action()).catch(() => {}); } catch { /* Telemetry methods are side-channels. */ }
}

function protect(span: TelemetrySpan): TelemetrySpan {
  let propagation: TelemetryPropagation | undefined;
  try { propagation = span.propagation; }
  catch { /* A broken propagation getter cannot prevent product execution. */ }
  const captured = propagation;
  const safe: TelemetrySpan = {
    propagation: captured ? {
      inject: context => {
        try { return captured.inject(originals.get(context) ?? context); }
        catch { return undefined; }
      },
      extract: carrier => {
        try { return captured.extract(carrier); }
        catch { return inert; }
      },
    } : undefined,
    startSpan: (options, callback) => recordSpan(span, options, callback),
    addLink: link => observe(() => span.addLink({ ...link, context: originals.get(link.context) ?? link.context })),
    addEvent: (name, attributes) => observe(() => span.addEvent(name, attributes)),
    setAttributes: attributes => observe(() => span.setAttributes(attributes)),
    setStatus: status => observe(() => span.setStatus(status)),
  };
  originals.set(safe, span);
  return safe;
}

/** The invocation owns completion; recorder settlement never holds it pending. */
export function recordSpan<T>(
  recorder: TelemetryContext,
  options: SpanOptions,
  callback: (span: TelemetrySpan) => T | Promise<T>,
): Promise<T> {
  let operation: Promise<T> | undefined;
  let fallback = false;
  const invoke = (span: TelemetrySpan): Promise<T> => {
    if (operation) {
      if (fallback) {
        const late = protect(span);
        late.setAttributes({ 'telemetry.coverage': 'unavailable', 'telemetry.late': true });
        late.setStatus({ status: 'error', error: { name: 'TelemetryUnavailable', message: 'Recorder admitted after operation start; invocation capture is unavailable.' } });
      }
      return operation;
    }
    operation = Promise.resolve().then(() => callback(protect(span)));
    return operation;
  };
  try {
    // Observe late failures, including ones after the product has returned.
    void Promise.resolve(recorder.startSpan(options, invoke)).catch(() => {});
  } catch { /* Fall back below when recording cannot admit the invocation. */ }
  // Built-in recorders admit synchronously and await the callback, so their
  // ordinary settlement/persistence runs before this promise returns its value.
  // An unresponsive recorder gets one microtask to admit, then the product runs.
  return Promise.resolve().then(() => {
    if (operation) return operation;
    fallback = true;
    return invoke(inert);
  });
}
