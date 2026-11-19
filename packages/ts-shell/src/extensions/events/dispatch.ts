import { isNotificationEvent } from './model.js';
import { isSessionBeforeEvent, sessionCancellation } from './decision.js';
import { createComponentLogger } from '../../observability/structuredLogger.js';
import { captureTreeResult, mergeTreeResult } from './tree.js';
import { captureCompactResult, mergeCompactResult } from './compact.js';
import { captureToolResult, reduceToolResult } from './result.js';
import { captureMessageResult, projectMessageEnd } from './message.js';
import type { ExtensionMessageEndEvent, ExtensionMessageEndResult } from './model.js';
import type { ExtensionBeforeCompactResult, ExtensionBeforeTreeResult } from './model.js';
import type { ExtensionInputEvent } from './model.js';
import type { ExtensionToolResult, ExtensionToolResultEvent } from './model.js';
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
  const compact = input.event === 'session_before_compact';
  const toolResult = input.event === 'tool_result';
  const messageEnd = input.event === 'message_end';
  const captureResult = nativeInput ? captureInputResult : guardedInput ? captureInputHookResult
    : compact ? captureCompactResult : toolResult ? captureToolResult : messageEnd ? captureMessageResult : undefined;
  const inputSignal = captureResult && input.signal && input.ownerSignal ? AbortSignal.any([input.signal, input.ownerSignal]) : input.signal ?? input.ownerSignal;
  const admitted = () => {
    if (input.signal) AbortSignal.prototype.throwIfAborted.call(input.signal);
    if (input.ownerSignal) AbortSignal.prototype.throwIfAborted.call(input.ownerSignal);
  };
  let current = nativeInput ? captureInputEvent(input.payload) : input.event === 'UserPromptSubmit' ? captureInputHookPayload(input.payload) : input.payload;
  let transformed = false;
  let hookResult: HookDecision | undefined;
  let matched = false;
  let treeResult: ExtensionBeforeTreeResult = { cancel: false };
  let compactResult: ExtensionBeforeCompactResult | undefined;
  let toolPatch: ExtensionToolResult | undefined;
  let messagePatch: ExtensionMessageEndResult | undefined;
  for (const name of [input.event, ...(input.aliases ?? [])]) {
    for (const handler of input.handlers.get(name) ?? []) {
      admitted(); matched = true;
      let result;
      try {
        result = captureResult ? (await captureCallbackResult<unknown>(() => handler(current), captureResult, {
          check: admitted, cancellation: callbackCancellation(inputSignal),
          ...(guardedInput ? { invalid: () => new InputRefusal(), failed: () => new InputRefusal(), cancelled: () => new InputRefusal() } : {}),
        })).value : await handler(current);
      }
      catch (error) {
        admitted();
        if (guardedInput) throw new InputRefusal();
        if (toolResult) { logger.warn('Extension tool result was refused.'); continue; }
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
      if (toolResult) {
        const reduced = reduceToolResult(current as ExtensionToolResultEvent, toolPatch, captureToolResult(result));
        current = reduced.event;
        toolPatch = reduced.result;
        continue;
      }
      if (messageEnd) {
        const next = captureMessageResult(result);
        const event = current as ExtensionMessageEndEvent;
        if (event.canReplace && next?.message) {
          current = projectMessageEnd(event, next);
          messagePatch = next;
        }
        continue;
      }
      if (sessionBefore && result !== undefined) {
        if (compact) {
          compactResult = mergeCompactResult(compactResult, captureCompactResult(result));
          if (compactResult?.cancel) return compactResult;
          continue;
        }
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
  if (compact) return compactResult;
  if (toolResult) return toolPatch;
  if (messageEnd) return messagePatch;
  if (nativeInput) {
    const event = current as ExtensionInputEvent;
    return Object.freeze(transformed ? { action: 'transform', text: event.text, ...(event.images === undefined ? {} : { images: event.images }) }
      : { action: 'continue' });
  }
  return input.event === 'session_before_tree' ? Object.freeze(treeResult) : sessionBefore ? Object.freeze({ cancel: false }) : matched ? current : undefined;
}
