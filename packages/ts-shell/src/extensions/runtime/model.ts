import vm from 'node:vm';
import { isThinkingPreference, type ThinkingPreference } from '../../core/models/effort.js';

export interface ExtensionThinkingUpdate {
  /** Applied means the effective request uses the saved preference. */
  readonly status: 'applied' | 'saved';
  readonly level: ThinkingPreference;
}

/** File extensions receive a realm-local Promise and a serialized receipt. */
export function createThinkingBridge(context: vm.Context, change: (level: ThinkingPreference) => Promise<ExtensionThinkingUpdate>) {
  const send = async (level: unknown, reply: (status: ExtensionThinkingUpdate['status'] | null, diagnostic?: string) => void): Promise<void> => {
    const settle = (status: ExtensionThinkingUpdate['status'] | null, diagnostic?: string) => {
      try { reply(status, diagnostic); } catch { /* A VM reply cannot change the native settlement. */ }
    };
    if (!isThinkingPreference(level) || typeof reply !== 'function') {
      settle(null, 'Invalid extension thinking level.');
      return;
    }
    try {
      const result = await change(level);
      const status = result.status;
      if (result.level !== level || (status !== 'applied' && status !== 'saved')) {
        throw new Error('Invalid extension thinking receipt.');
      }
      settle(status);
    } catch (error) {
      settle(null, ExtensionThinkingError.diagnostic(error));
    }
  };
  Object.defineProperty(context, '__thinking', { value: Object.setPrototypeOf(send, null), configurable: true });
  return new vm.Script(`(() => {
    const send = globalThis.__thinking;
    const LocalPromise = Promise, LocalError = Error, freeze = Object.freeze;
    delete globalThis.__thinking;
    return level => new LocalPromise((resolve, reject) => {
      send(level, (status, diagnostic) => {
        if (status === null) reject(new LocalError(diagnostic));
        else resolve(freeze({ __proto__: null, status, level }));
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

  static diagnostic(error: unknown): string {
    return error && typeof error === 'object' && #diagnostic in error
      ? error.#diagnostic : 'Extension thinking level change failed.';
  }
}
