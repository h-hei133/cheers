import { types } from 'node:util';

export interface CallbackCancellation {
  readonly isCancelled: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface CallbackCaptureOptions {
  readonly check?: () => void;
  readonly cancellation?: CallbackCancellation;
  readonly invalid?: () => Error;
  readonly failed?: () => Error;
  readonly cancelled?: () => Error;
}

/** Observe one known Promise realm without consulting an arbitrary value's then. */
export function createCallbackResultCapture(isProxy: (value: unknown) => boolean, isPromise: (value: unknown) => boolean,
  ResultPromise: PromiseConstructor, CallbackPromise: PromiseConstructor) {
  const descriptor = Object.getOwnPropertyDescriptor, prototypeOf = Object.getPrototypeOf;
  const create = Object.create, define = Object.defineProperties, freeze = Object.freeze, apply = Reflect.apply;
  const callbackPrototype = CallbackPromise.prototype, callbackThen = callbackPrototype.then;
  const callbackSpecies = descriptor(CallbackPromise, Symbol.species)?.get;
  const resultThen = ResultPromise.prototype.then;
  // Private promises remain usable when a VM callback changes its public Promise prototype.
  const resultConstructor = freeze(define(create(null), { [Symbol.species]: { value: ResultPromise } }));

  function protectedPromise<T>(promise: Promise<T>): Promise<T> {
    return define(promise, {
      constructor: { value: resultConstructor },
      then: { value: function then(fulfilled?: (value: T) => unknown, rejected?: (reason: unknown) => unknown) {
        return protectedPromise(apply(resultThen, promise, [fulfilled, rejected]));
      } },
    });
  }

  function observable(value: unknown): value is Promise<unknown> {
    if (isProxy(value) || !isPromise(value) || prototypeOf(value) !== callbackPrototype
      || descriptor(value, 'constructor') !== undefined || descriptor(value, 'then') !== undefined) return false;
    const constructor = descriptor(callbackPrototype, 'constructor'), then = descriptor(callbackPrototype, 'then');
    const species = descriptor(CallbackPromise, Symbol.species);
    return constructor?.value === CallbackPromise && then?.value === callbackThen
      && species?.get === callbackSpecies && species?.set === undefined && species?.value === undefined;
  }

  /** Capture synchronously before resolving; only a null-prototype envelope crosses awaits. */
  return function captureCallbackResult<T>(operation: () => unknown, capture: (value: unknown) => T,
    options: CallbackCaptureOptions = {}): Promise<{ readonly value: T }> {
    return protectedPromise(new ResultPromise<{ readonly value: T }>((resolve, reject) => {
      let settled = false;
      let unsubscribe: (() => void) | undefined;
      const cancelled = () => options.cancellation?.isCancelled() === true;
      const detach = () => { const release = unsubscribe; unsubscribe = undefined; try { release?.(); } catch { /* Settlement remains observable. */ } };
      const refusal = (kind: 'invalid' | 'failed' | 'cancelled') => {
        if (settled) return;
        settled = true;
        detach();
        reject(options[kind]?.() ?? new Error(kind === 'cancelled' ? 'Callback was cancelled.' : 'Callback result was refused.'));
      };
      const check = () => {
        if (cancelled()) { refusal('cancelled'); return false; }
        options.check?.();
        if (cancelled()) { refusal('cancelled'); return false; }
        return !settled;
      };
      const accept = (value: unknown) => {
        if (settled) return;
        try {
          if (!check()) return;
          const saved = capture(value);
          if (!check()) return;
          const envelope = freeze(define(create(null), { value: { value: saved, enumerable: true } }));
          settled = true;
          detach();
          resolve(envelope);
        } catch { refusal(cancelled() ? 'cancelled' : 'invalid'); }
      };
      const fail = () => {
        if (settled) return;
        try { if (!check()) return; } catch { /* The failed callback does not publish a result. */ }
        refusal(cancelled() ? 'cancelled' : 'failed');
      };
      try {
        unsubscribe = options.cancellation?.subscribe(() => refusal('cancelled'));
        if (!check()) return;
        const value = operation();
        if (isProxy(value)) { refusal('invalid'); return; }
        if (isPromise(value)) {
          if (!observable(value)) { refusal('invalid'); return; }
          // Keep both observers attached after cancellation so late rejection is consumed.
          apply(callbackThen, value, [accept, fail]);
        } else accept(value);
      } catch { fail(); }
    }));
  };
}

export const captureCallbackResult = createCallbackResultCapture(types.isProxy, types.isPromise, Promise, Promise);

const throwIfAborted = AbortSignal.prototype.throwIfAborted;
const addListener = EventTarget.prototype.addEventListener, removeListener = EventTarget.prototype.removeEventListener;

/** Native cancellation ports keep signal access outside the realm-independent factory. */
export function callbackCancellation(signal?: AbortSignal): CallbackCancellation | undefined {
  if (!signal) return undefined;
  return {
    isCancelled: () => { try { throwIfAborted.call(signal); return false; } catch { return true; } },
    subscribe: listener => {
      addListener.call(signal, 'abort', listener, { once: true });
      return () => removeListener.call(signal, 'abort', listener);
    },
  };
}
