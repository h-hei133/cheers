import type { QueryEvent } from '../query/runtime/events.js';

/** Display observers cannot replace a run's outcome or block other observers. */
export function notifyObservers(observers: Iterable<(event: QueryEvent) => unknown>, event: QueryEvent): void {
  for (const observer of observers) {
    try {
      const result = observer(event);
      // A void callback can still return asynchronous work. Handle rejection
      // without awaiting it or allocating a Promise for each synchronous delta.
      if (result && (typeof result === 'object' || typeof result === 'function')
        && typeof (result as { then?: unknown }).then === 'function') {
        void Promise.resolve(result).catch(() => {});
      }
    } catch { /* A display failure is not a durable failure. */ }
  }
}
