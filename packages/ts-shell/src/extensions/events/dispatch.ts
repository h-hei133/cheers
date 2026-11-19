import { isNotificationEvent } from './model.js';
import { isSessionBeforeEvent, sessionCancellation } from './decision.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import { captureTreeResult, mergeTreeResult } from './tree.js';
import type { ExtensionBeforeTreeResult } from './model.js';
import type { ExtensionInputEvent } from './model.js';
import { captureInputEvent, captureInputHookPayload, captureInputHookResult, captureInputResult, InputRefusal, projectInputEvent, reduceInputHookResult } from './input.js';
import { callbackCancellation, captureCallbackResult } from '../../core/values/promise.js';
import type { HookDecision } from '../../core/hooks/types.js';

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
  const sessionBefore = isSessionBeforeEvent(input.event);
  const nativeInput = input.event === 'input';
  const guardedInput = nativeInput || input.event === 'UserPromptSubmit';
  const inputSignal = guardedInput && input.signal && input.ownerSignal ? AbortSignal.any([input.signal, input.ownerSignal]) : input.signal ?? input.ownerSignal;
  const admitted = () => {
    if (input.signal) AbortSignal.prototype.throwIfAborted.call(input.signal);
    if (input.ownerSignal) AbortSignal.prototype.throwIfAborted.call(input.ownerSignal);
  };
  let current = nativeInput ? captureInputEvent(input.payload) : input.event === 'UserPromptSubmit' ? captureInputHookPayload(input.payload) : input.payload;
  let transformed = false;
  let hookResult: HookDecision | undefined;
  let matched = false;
  let treeResult: ExtensionBeforeTreeResult = { cancel: false };
  for (const name of [input.event, ...(input.aliases ?? [])]) {
    for (const handler of input.handlers.get(name) ?? []) {
      admitted(); matched = true;
      let result;
      try {
        result = guardedInput ? (await captureCallbackResult<unknown>(() => handler(current),
          nativeInput ? captureInputResult : captureInputHookResult, {
          check: admitted, cancellation: callbackCancellation(inputSignal),
          invalid: () => new InputRefusal(), failed: () => new InputRefusal(), cancelled: () => new InputRefusal(),
        })).value : await handler(current);
      }
      catch (error) {
        admitted();
        if (guardedInput) throw new InputRefusal();
        if (!notification) throw error;
        logger.warn('Extension notification handler failed.');
        continue;
      }
      admitted();
      if (input.event === 'UserPromptSubmit') {
        const reduced = reduceInputHookResult(hookResult, result);
        hookResult = reduced.result;
        if (reduced.stop) return hookResult;
        continue;
      }
      if (nativeInput) {
        const next = captureInputResult(result);
        if (next.action === 'handled') return next;
        current = projectInputEvent(current as ExtensionInputEvent, next);
        transformed ||= next.action === 'transform';
        continue;
      }
      if (sessionBefore && result !== undefined) {
        if (input.event === 'session_before_tree') {
          treeResult = mergeTreeResult(treeResult, captureTreeResult(result));
          if (treeResult.cancel) return treeResult;
          continue;
        }
        if (sessionCancellation(result)) return Object.freeze({ cancel: true });
        continue;
      }
      if (!notification && result !== undefined) current = result;
    }
  }
  if (input.event === 'UserPromptSubmit') return hookResult;
  if (nativeInput) {
    const event = current as ExtensionInputEvent;
    return Object.freeze(transformed ? { action: 'transform', text: event.text, ...(event.images === undefined ? {} : { images: event.images }) }
      : { action: 'continue' });
  }
  return input.event === 'session_before_tree' ? Object.freeze(treeResult) : sessionBefore ? Object.freeze({ cancel: false }) : matched ? current : undefined;
}
