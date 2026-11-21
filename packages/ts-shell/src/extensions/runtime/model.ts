import vm from 'node:vm';
import { isThinkingPreference, type ThinkingPreference } from '../../core/models/effort.js';

export interface ExtensionThinkingUpdate {
  /** Applied means the effective request uses the saved preference. */
  readonly status: 'applied' | 'saved';
  readonly level: ThinkingPreference;
}

export interface ExtensionModelUpdate {
  readonly status: ExtensionThinkingUpdate['status'];
  readonly model: string;
}

export function isExtensionModel(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 512
    && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}

/** File extensions receive a realm-local Promise and a serialized receipt. */
export function createThinkingBridge(context: vm.Context, change: (level: ThinkingPreference) => Promise<ExtensionThinkingUpdate>) {
  return createPreferenceBridge(context, 'level', isThinkingPreference, change);
}

export function createModelBridge(context: vm.Context, change: (model: string) => Promise<ExtensionModelUpdate>) {
  return createPreferenceBridge(context, 'model', isExtensionModel, change);
}

function createPreferenceBridge<Key extends 'model' | 'level', Value extends ThinkingPreference | string,
  Result extends Readonly<Record<Key, Value>> & { readonly status: ExtensionThinkingUpdate['status'] }>(
  context: vm.Context, key: Key, valid: (value: unknown) => value is Value, change: (value: Value) => Promise<Result>,
) {
  const send = async (value: unknown, reply: (status: ExtensionThinkingUpdate['status'] | null, diagnostic?: string) => void): Promise<void> => {
    const settle = (status: ExtensionThinkingUpdate['status'] | null, diagnostic?: string) => {
      try { reply(status, diagnostic); } catch { /* A VM reply cannot change the native settlement. */ }
    };
    if (!valid(value) || typeof reply !== 'function') {
      settle(null, key === 'level' ? 'Invalid extension thinking level.' : 'Invalid extension model.');
      return;
    }
    try {
      const result = await change(value);
      const status = result.status;
      if (result[key] !== value || (status !== 'applied' && status !== 'saved')) {
        throw new Error('Invalid extension model preference receipt.');
      }
      settle(status);
    } catch (error) {
      settle(null, ExtensionThinkingError.diagnostic(error, key === 'level' ? undefined : 'Extension model change failed.'));
    }
  };
  Object.defineProperty(context, '__thinking', { value: Object.setPrototypeOf(send, null), configurable: true });
  return new vm.Script(`(() => {
    const send = globalThis.__thinking;
    const LocalPromise = Promise, LocalError = Error, freeze = Object.freeze;
    delete globalThis.__thinking;
    return value => new LocalPromise((resolve, reject) => {
      send(value, (status, diagnostic) => {
        if (status === null) reject(new LocalError(diagnostic));
        else resolve(freeze({ __proto__: null, status, ${key}: value }));
      });
    });
  })()`).runInContext(context) as typeof change;
}

/** Only native, report-safe model diagnostics pass into a file extension. */
export class ExtensionThinkingError extends Error {
  readonly #diagnostic: string;

  constructor(diagnostic: string) {
    super(diagnostic);
    this.#diagnostic = diagnostic;
  }

  static diagnostic(error: unknown, fallback = 'Extension thinking level change failed.'): string {
    return error && typeof error === 'object' && #diagnostic in error
      ? error.#diagnostic : fallback;
  }
}
