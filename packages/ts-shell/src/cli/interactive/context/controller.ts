import type { PromptEstimate } from '../../../context/request/estimate.js';

export interface ContextPreview {
  readonly estimate: PromptEstimate;
  readonly verify: () => void;
  readonly verifyContent?: (signal: AbortSignal) => Promise<void>;
  /** Absolute expiry shared with the owning request reservation, when present. */
  readonly expiresAt?: number;
  /** Release any reservation or retained preview state when this reading is retired. */
  readonly dispose?: () => void;
}
export interface ContextReading {
  readonly tokens?: number;
  readonly source: 'estimated' | 'calibrated' | 'unknown' | 'stale';
}

/** One pending read, bounded debounce, no filesystem or network in frame callbacks. */
export function createContextController(input: {
  readonly identity: () => string | undefined;
  readonly load: (signal: AbortSignal) => Promise<ContextPreview>;
  readonly repaint: () => void;
}) {
  let stopped = false;
  let key: string | undefined;
  let previous: ContextPreview | undefined;
  let activeValue: ContextPreview | undefined;
  let pending: AbortController | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let source: ContextReading['source'] = 'unknown';
  let retryAt = 0;
  let checkedAt = 0;
  let expiresAt = 0;
  const disposed = new WeakSet<object>();
  const discard = (value: ContextPreview | undefined) => {
    if (!value || disposed.has(value)) return;
    disposed.add(value);
    try { value.dispose?.(); } catch { /* Cleanup must not break the next reading. */ }
  };
  const invalidate = () => {
    // Cancellation is not settlement: keep the serial read slot until finally.
    pending?.abort();
    if (scheduled) clearTimeout(scheduled); scheduled = undefined;
    const retired = previous;
    const inFlight = activeValue;
    source = retired ? 'stale' : 'unknown'; previous = undefined;
    activeValue = undefined; discard(retired); discard(inFlight);
  };
  const request = () => {
    if (stopped) return;
    let actual: string | undefined;
    try { actual = input.identity(); } catch { actual = undefined; }
    if (actual !== key) { invalidate(); key = actual; retryAt = 0; input.repaint(); }
    if (!actual) return;
    if (previous && Date.now() >= expiresAt) { invalidate(); retryAt = 0; input.repaint(); }
    if (pending) return;
    if (previous) {
      if (Date.now() < checkedAt + 2000) return;
      try {
        previous.verify();
        if (!previous.verifyContent) { checkedAt = Date.now(); return; }
      }
      catch { invalidate(); retryAt = 0; input.repaint(); }
    }
    if (pending || scheduled || Date.now() < retryAt) return;
    const captured = actual;
    const checking = previous;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      if (stopped || key !== captured) return;
      const controller = new AbortController(); pending = controller;
      const timeout = setTimeout(() => {
        controller.abort();
        if (!stopped && pending === controller && key === captured) {
          const retired = previous;
          const inFlight = activeValue;
          if (retired) source = 'stale';
          previous = undefined; activeValue = undefined; discard(retired); discard(inFlight); retryAt = Date.now() + 5000; input.repaint();
        }
      }, 10000); timeout.unref?.();
      let currentValue: ContextPreview | undefined;
      void Promise.resolve().then(() => checking ?? input.load(controller.signal)).then(async value => {
        currentValue = value;
        activeValue = value;
        if (stopped || controller.signal.aborted || pending !== controller || input.identity() !== captured) {
          discard(value); if (activeValue === value) activeValue = undefined; return;
        }
        value.verify(); await value.verifyContent?.(controller.signal); value.verify();
        if (stopped || controller.signal.aborted || pending !== controller || input.identity() !== captured) {
          discard(value); if (activeValue === value) activeValue = undefined; return;
        }
        if (checking && Date.now() >= expiresAt) throw new Error('Context preview expired.');
        if (!checking && value.expiresAt !== undefined && Date.now() >= value.expiresAt) throw new Error('Context preview expired.');
        previous = value; source = value.estimate.source;
        checkedAt = Date.now(); if (!checking) expiresAt = value.expiresAt ?? checkedAt + 20000; input.repaint();
      }).catch(() => {
        discard(currentValue);
        discard(activeValue); activeValue = undefined;
        const retired = previous;
        if (!stopped && !controller.signal.aborted && pending === controller && key === captured) {
          if (retired) source = 'stale';
          previous = undefined; discard(retired); retryAt = Date.now() + 5000; input.repaint();
        }
      }).finally(() => {
        if (activeValue === currentValue) activeValue = undefined;
        currentValue = undefined; clearTimeout(timeout); if (pending === controller) pending = undefined;
      });
    }, 150);
    scheduled.unref?.();
  };
  return {
    start: () => { if (stopped || interval) return; request(); interval = setInterval(request, 500); interval.unref?.(); },
    update: request,
    read: (): ContextReading => {
      // Draft/config changes are noticed synchronously, without inspecting their sources.
      let current: string | undefined;
      try { current = input.identity(); } catch { return { source: 'unknown' }; }
      if (!current || current !== key) return { source: 'unknown' };
      if (previous && Date.now() >= expiresAt) return { source: 'stale' };
      return previous ? { tokens: previous.estimate.tokens, source: previous.estimate.source } : { source };
    },
    stop: () => { stopped = true; invalidate(); if (interval) clearInterval(interval); interval = undefined; },
  };
}
