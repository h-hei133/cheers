import { isNotificationEvent } from './model.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';

const logger = createComponentLogger('extension-events');

/** Share handler ordering and cancellation while retaining each event's result contract. */
export async function runEventHandlers(input: {
  readonly handlers: ReadonlyMap<string, readonly ((payload: unknown) => unknown | Promise<unknown>)[]>;
  readonly event: string;
  readonly payload: unknown;
  readonly aliases?: readonly string[];
  readonly signal?: AbortSignal;
  readonly ownerSignal?: AbortSignal;
}): Promise<unknown> {
  const notification = isNotificationEvent(input.event);
  const admitted = () => {
    if (input.signal) AbortSignal.prototype.throwIfAborted.call(input.signal);
    if (input.ownerSignal) AbortSignal.prototype.throwIfAborted.call(input.ownerSignal);
  };
  let current = input.payload;
  let matched = false;
  for (const name of [input.event, ...(input.aliases ?? [])]) {
    for (const handler of input.handlers.get(name) ?? []) {
      admitted(); matched = true;
      let result;
      try { result = await handler(current); }
      catch (error) {
        admitted();
        if (!notification) throw error;
        logger.warn('Extension notification handler failed.');
        continue;
      }
      admitted();
      if (!notification && result !== undefined) current = result;
    }
  }
  return matched ? current : undefined;
}
