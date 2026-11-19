import { snapshotData } from '../../core/values/data.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';
import type { ExtensionInputEvent, ExtensionInputResult } from './model.js';
import type { HookDecision } from '../../core/hooks/types.js';
import {InputRefusal} from '../../core/hooks/input/error.js';
export {InputRefusal} from '../../core/hooks/input/error.js';

/** The worker receives the same decoder with every dependency supplied explicitly. */
export function createInputResultCapture(snapshotData: typeof import('../../core/values/data.js').snapshotData,
  Refusal: new () => Error) {
  const MAX_TEXT_BYTES = 1024 * 1024;
  const MAX_IMAGE_DATA_LENGTH = Math.ceil(16 * 1024 * 1024 / 3) * 4;

  function captureImages(value: unknown): readonly ImageContent[] {
    if (!Array.isArray(value) || value.length > 64) throw new Refusal();
    return Object.freeze(value.map(image => {
      if (!image || typeof image !== 'object' || Array.isArray(image) || image.type !== 'image'
        || typeof image.data !== 'string' || !image.data || image.data.length > MAX_IMAGE_DATA_LENGTH
        || typeof image.mimeType !== 'string' || !image.mimeType || image.mimeType.length > 128) throw new Refusal();
      // Encoding, MIME and model limits remain owned by the original image admission path.
      return Object.freeze({ type: 'image' as const, data: image.data, mimeType: image.mimeType });
    }));
  }

  return function captureInputResult(result: unknown): ExtensionInputResult {
    if (result === undefined) return Object.freeze({ action: 'continue' });
    let captured;
    try { captured = snapshotData(result, { bytes: 64 * 1024 * 1024, nodes: 4096, depth: 12, allowCrossRealm: true }); }
    catch { throw new Refusal(); }
    if (!captured || typeof captured !== 'object' || Array.isArray(captured)) throw new Refusal();
    const value = captured as Record<string, unknown>;
    if (value.decision !== undefined && value.decision !== 'allow') throw new Refusal();
    if (value.action === undefined) {
      return Object.freeze({ action: 'continue' });
    }
    if (value.action === 'continue' || value.action === 'handled') return Object.freeze({ action: value.action });
    if (value.action !== 'transform' || typeof value.text !== 'string' || Buffer.byteLength(value.text) > MAX_TEXT_BYTES) throw new Refusal();
    const images = value.images === undefined ? undefined : captureImages(value.images);
    return Object.freeze({ action: 'transform', text: value.text, ...(images === undefined ? {} : { images }) });
  };
}

export const captureInputResult = createInputResultCapture(snapshotData, InputRefusal);

/** Legacy submission hooks retain their own decision contract at the same inert boundary. */
export function createInputHookResultCapture(snapshotData: typeof import('../../core/values/data.js').snapshotData,
  Refusal: new () => Error) {
  return function captureInputHookResult(result: unknown): HookDecision | undefined {
    if (result === undefined) return undefined;
    let captured;
    try { captured = snapshotData(result, { bytes: 64 * 1024 * 1024, nodes: 4096, depth: 12, allowCrossRealm: true }); }
    catch { throw new Refusal(); }
    if (!captured || typeof captured !== 'object' || Array.isArray(captured)) throw new Refusal();
    const value = captured as Record<string, unknown>;
    if (value.decision !== undefined && (typeof value.decision !== 'string'
      || !['allow', 'block', 'retry', 'ask', 'defer', 'unknown', 'unsupported'].includes(value.decision))) throw new Refusal();
    for (const key of ['reason', 'feedback']) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Refusal();
    if (value.hookSpecificOutput !== undefined && (!value.hookSpecificOutput || typeof value.hookSpecificOutput !== 'object'
      || Array.isArray(value.hookSpecificOutput))) throw new Refusal();
    return captured as unknown as HookDecision;
  };
}

export const captureInputHookResult = createInputHookResultCapture(snapshotData, InputRefusal);

/** Legacy callbacks keep the original submission and accumulate advice separately from vetoes. */
export function createInputHookReducer(capture: (value: unknown) => HookDecision | undefined) {
  const create = Object.create, assign = Object.assign, freeze = Object.freeze;
  return function reduceInputHookResult(previous: HookDecision | undefined, next: unknown): {
    readonly result: HookDecision | undefined;
    readonly stop: boolean;
  } {
    const value = capture(next);
    if (previous?.decision && previous.decision !== 'allow') return freeze({ result: previous, stop: true });
    if (value?.decision && value.decision !== 'allow') return freeze({ result: value, stop: true });
    if (value === undefined) return freeze({ result: previous, stop: false });
    const feedback = [previous?.feedback, value.feedback].filter(text => text !== undefined).join('\n\n');
    const hookSpecificOutput = previous?.hookSpecificOutput || value.hookSpecificOutput
      ? freeze(assign(create(null), previous?.hookSpecificOutput, value.hookSpecificOutput)) : undefined;
    const result = capture(freeze(assign(create(null), previous, value,
      previous?.feedback !== undefined || value.feedback !== undefined ? { feedback } : undefined,
      hookSpecificOutput === undefined ? undefined : { hookSpecificOutput })));
    return freeze({ result, stop: false });
  };
}

export const reduceInputHookResult = createInputHookReducer(captureInputHookResult);

/** Capture legacy payloads independently of the result's decision fields. */
export function createInputHookPayloadCapture(snapshotData: typeof import('../../core/values/data.js').snapshotData,
  Refusal: new () => Error) {
  return function captureInputHookPayload(payload: unknown) {
    try { return snapshotData(payload, { bytes: 64 * 1024 * 1024, nodes: 4096, depth: 12, allowCrossRealm: true }); }
    catch { throw new Refusal(); }
  };
}

export const captureInputHookPayload = createInputHookPayloadCapture(snapshotData, InputRefusal);

/** Capture the original event once, before any handler can mutate its envelope. */
export function createInputEventCapture(snapshotData: typeof import('../../core/values/data.js').snapshotData,
  captureResult: (value: unknown) => ExtensionInputResult, Refusal: new () => Error) {
  return function captureInputEvent(event: unknown): ExtensionInputEvent {
    let captured;
    try { captured = snapshotData(event, { bytes: 64 * 1024 * 1024, nodes: 4096, depth: 12, allowCrossRealm: true }); }
    catch { throw new Refusal(); }
    if (!captured || typeof captured !== 'object' || Array.isArray(captured)) throw new Refusal();
    const value = captured as Record<string, unknown>;
    if (value.type !== 'input' || typeof value.text !== 'string' || value.prompt !== value.text
      || typeof value.sessionId !== 'string' || !value.sessionId.trim()
      || typeof value.workspaceRoot !== 'string' || !value.workspaceRoot.trim()
      || typeof value.timestamp !== 'string' || typeof value.source !== 'string'
      || !['interactive', 'rpc', 'extension', 'sdk', 'cli'].includes(value.source)
      || value.streamingBehavior !== undefined && value.streamingBehavior !== 'steer' && value.streamingBehavior !== 'followUp') throw new Refusal();
    const content = captureResult({ action: 'transform', text: value.text, ...(value.images === undefined ? {} : { images: value.images }) });
    if (content.action !== 'transform') throw new Refusal();
    return Object.freeze({ type: 'input', text: content.text, prompt: content.text, sessionId: value.sessionId,
      workspaceRoot: value.workspaceRoot, timestamp: value.timestamp, source: value.source as ExtensionInputEvent['source'],
      ...(content.images === undefined ? {} : { images: content.images }),
      ...(value.streamingBehavior === undefined ? {} : { streamingBehavior: value.streamingBehavior as 'steer' | 'followUp' }) });
  };
}

export const captureInputEvent = createInputEventCapture(snapshotData, captureInputResult, InputRefusal);

/** A transform changes only the message content, preserving its original source and lifetime. */
export function createInputEventProjection(Refusal: new () => Error) {
  return function projectInputEvent(event: ExtensionInputEvent, result: ExtensionInputResult): ExtensionInputEvent {
    if (result.action === 'handled') return event;
    const text = result.action === 'transform' ? result.text : event.text;
    const images = result.action === 'transform' && result.images !== undefined ? result.images : event.images;
    if (!text.trim() && !images?.length) throw new Refusal();
    if (result.action === 'continue') return event;
    return Object.freeze({ ...event, text, prompt: text, ...(images === undefined ? {} : { images }) });
  };
}

export const projectInputEvent = createInputEventProjection(InputRefusal);
