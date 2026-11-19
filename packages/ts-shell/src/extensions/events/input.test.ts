import { describe, expect, it, vi } from 'vitest';
import { runEventHandlers } from './dispatch.js';
import { captureInputEvent, captureInputResult, createInputResultCapture, InputRefusal, projectInputEvent } from './input.js';
import { snapshotData } from '../../core/values/data.js';

const image = Object.freeze({ type: 'image' as const, mimeType: 'image/png', data: 'opaque-image-data' });
const event = Object.freeze({ type: 'input' as const, text: 'Original', prompt: 'Original', sessionId: 'input-session',
  workspaceRoot: '/tmp/cheers-test/input-events', timestamp: '2026-11-19T00:00:00Z', source: 'sdk' as const,
  images: Object.freeze([image]) });

function dispatch(handlers: readonly ((payload: unknown) => unknown | Promise<unknown>)[], payload: unknown = event,
  signal?: AbortSignal, ownerSignal?: AbortSignal) {
  return runEventHandlers({ handlers: new Map([['input', handlers]]), event: 'input', payload, signal, ownerSignal });
}

describe('native input results', () => {
  it('chains only transformed text and images while retaining the original input envelope', async () => {
    const replacement = Object.freeze({ ...image, data: 'replacement-image-data' });
    const seen: unknown[] = [];
    const result = await dispatch([
      payload => { seen.push(payload); return { action: 'transform', text: 'First', source: 'extension',
        sessionId: 'replacement', workspaceRoot: '/replacement', timestamp: 'changed', streamingBehavior: 'steer' }; },
      payload => { seen.push(payload); return { action: 'continue' }; },
      payload => { seen.push(payload); return { action: 'transform', text: 'Final', images: [replacement] }; },
      payload => { seen.push(payload); },
    ]);
    expect(seen).toEqual([event, { ...event, text: 'First', prompt: 'First' }, { ...event, text: 'First', prompt: 'First' },
      { ...event, text: 'Final', prompt: 'Final', images: [replacement] }]);
    expect(result).toEqual({ action: 'transform', text: 'Final', images: [replacement] });
    expect(event.text).toBe('Original'); expect(event.images).toEqual([image]);
    expect(seen.every(payload => Object.isFrozen(payload))).toBe(true);
  });

  it('preserves images when omitted and accepts an explicit empty array as removal', async () => {
    const seen: unknown[] = [];
    const result = await dispatch([
      () => ({ action: 'transform', text: 'Keep' }),
      payload => { seen.push(payload); return { action: 'transform', text: 'Clear', images: [] }; },
      payload => { seen.push(payload); return { action: 'transform', text: 'Still clear' }; },
    ]);
    expect(seen).toEqual([{ ...event, text: 'Keep', prompt: 'Keep' }, { ...event, text: 'Clear', prompt: 'Clear', images: [] }]);
    expect(result).toEqual({ action: 'transform', text: 'Still clear', images: [] });
  });

  it('accepts an image-only transform while preserving omitted source images', async () => {
    expect(await dispatch([() => ({ action: 'transform', text: '' })]))
      .toEqual({ action: 'transform', text: '', images: [image] });
    expect(projectInputEvent(event, captureInputResult({ action: 'transform', text: '  ' })))
      .toEqual({ ...event, text: '  ', prompt: '  ' });
  });

  it('refuses a transform that leaves neither text nor images', async () => {
    const result = captureInputResult({ action: 'transform', text: '' });
    expect(() => projectInputEvent({ ...event, images: [] }, result)).toThrow(InputRefusal);
    await expect(dispatch([() => ({ action: 'transform', text: '  ', images: [] })]))
      .rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
  });

  it('shares input result capture through explicit factory dependencies', () => {
    const supplied = vi.fn(snapshotData);
    const capture = createInputResultCapture(supplied, InputRefusal);
    const result = { action: 'transform', text: 'Captured', images: [{ ...image, privateMetadata: 'Discarded' }] };
    expect(capture(result)).toEqual(captureInputResult(result));
    expect(supplied).toHaveBeenCalledWith(result, expect.objectContaining({ allowCrossRealm: true, bytes: 64 * 1024 * 1024 }));
    expect(() => capture({ decision: 'block' })).toThrow(InputRefusal);
  });

  it('captures and freezes the original input instead of adopting handler-owned envelope fields', () => {
    const original = { ...event, images: [{ ...image }], source: 'cli' as const };
    const captured = captureInputEvent(original);
    Object.assign(original, { text: 'Mutated' }); Object.assign(original.images[0]!, { data: 'Mutated' });
    expect(captured).toEqual({ ...event, source: 'cli' });
    expect(Object.isFrozen(captured)).toBe(true); expect(Object.isFrozen(captured.images)).toBe(true);
    expect(Object.isFrozen(captured.images![0])).toBe(true);
    expect(() => captureInputEvent({ ...event, prompt: 'Inconsistent' })).toThrow(InputRefusal);
    expect(() => captureInputEvent({ ...event, source: 'unknown' })).toThrow(InputRefusal);
  });

  it('stops after handled without invoking later handlers', async () => {
    const later = vi.fn(() => ({ action: 'transform', text: 'Must not run' }));
    expect(await dispatch([() => ({ action: 'transform', text: 'Prepared' }), () => ({ action: 'handled' }), later]))
      .toEqual({ action: 'handled' });
    expect(later).not.toHaveBeenCalled();
  });

  it.each(['block', 'retry'] as const)('retains a legacy %s refusal without exposing its private reason', async decision => {
    const later = vi.fn(() => ({ action: 'handled' }));
    const pending = dispatch([() => ({ decision, reason: 'PRIVATE_INPUT_REASON' }), later]);
    await expect(pending).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
    expect(later).not.toHaveBeenCalled();
  });

  it('normalizes absent, legacy allow and feedback results as continuation without replacing the payload', async () => {
    const seen: unknown[] = [];
    expect(await dispatch([
      payload => { seen.push(payload); },
      payload => { seen.push(payload); return { decision: 'allow' }; },
      payload => { seen.push(payload); return { feedback: 'Legacy feedback', hookSpecificOutput: { note: 'Recorded elsewhere' } }; },
    ])).toEqual({ action: 'continue' });
    expect(seen).toEqual([event, event, event]);
    expect(await dispatch([])).toEqual({ action: 'continue' });
  });

  it('normalizes a callback rejection without exposing its private failure', async () => {
    const later = vi.fn(() => ({ action: 'continue' }));
    await expect(dispatch([async () => { throw new Error('PRIVATE_HANDLER_FAILURE'); }, later]))
      .rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
    expect(later).not.toHaveBeenCalled();
  });

  it.each(['then-getter', 'thenable', 'constructor-getter', 'then-own', 'species'] as const)(
    'refuses a callback %s before invoking its Promise hooks', async kind => {
      const hook = vi.fn(() => undefined);
      const result = { action: 'continue' };
      let value: unknown;
      if (kind === 'then-getter') value = Object.defineProperty(result, 'then', { get: hook });
      if (kind === 'thenable') value = { then: (resolve: (value: unknown) => void) => { hook(); resolve(result); } };
      if (kind === 'constructor-getter') value = Object.defineProperty(Promise.resolve(result), 'constructor', { get: hook });
      if (kind === 'then-own') value = Object.defineProperty(Promise.resolve(result), 'then', { value: () => { hook(); return Promise.resolve(result); } });
      if (kind === 'species') {
        class CallbackPromise extends Promise<unknown> { static get [Symbol.species]() { hook(); return Promise; } }
        value = new CallbackPromise(resolve => resolve(result));
      }
      const later = vi.fn(() => ({ action: 'continue' }));
      const outcome = await dispatch([() => value, later]).then(result => ({ result }), error => ({ error }));
      expect(hook).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ error: { name: 'InputRefusal', message: 'Extension input was refused.' } });
      expect(later).not.toHaveBeenCalled();
    });

  it.each(['continue', 'handled', 'transform'] as const)('refuses mixed %s results with an unknown or invalid legacy decision', async action => {
    for (const decision of ['unknown', 'unsupported', 'invalid', false, 1, null]) {
      const result = { action, text: 'Replacement', decision };
      expect(() => captureInputResult(result)).toThrow(InputRefusal);
      const later = vi.fn(() => ({ action: 'continue' }));
      await expect(dispatch([() => result, later])).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
      expect(later).not.toHaveBeenCalled();
    }
  });

  it.each(['block', 'retry', 'unknown', 'invalid'] as const)(
    'keeps a legacy UserPromptSubmit %s from being erased by a later allow', async decision => {
      const payload = Object.freeze({ eventName: 'UserPromptSubmit', sessionId: event.sessionId, workspaceRoot: event.workspaceRoot,
        timestamp: event.timestamp, prompt: event.text });
      const refusal = { decision, reason: 'Original refusal', feedback: 'Keep this decision' };
      const seen: unknown[] = [];
      const later = vi.fn(() => ({ decision: 'allow', feedback: 'Must not replace refusal' }));
      const pending = runEventHandlers({ event: 'UserPromptSubmit', payload,
        handlers: new Map([['UserPromptSubmit', [value => { seen.push(value); return refusal; }, later]]]) });
      if (decision === 'invalid') await expect(pending).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
      else expect(await pending).toEqual(refusal);
      expect(seen).toEqual([payload]); expect(seen.every(value => Object.isFrozen(value))).toBe(true);
      expect(later).not.toHaveBeenCalled();
    });

  it('keeps the original legacy UserPromptSubmit envelope through non-veto feedback handlers', async () => {
    const payload = { eventName: 'UserPromptSubmit', sessionId: event.sessionId, workspaceRoot: event.workspaceRoot,
      timestamp: event.timestamp, prompt: event.text };
    const seen: unknown[] = [];
    const result = await runEventHandlers({ event: 'UserPromptSubmit', payload, handlers: new Map([['UserPromptSubmit', [
      value => { seen.push(value); return { decision: 'allow', feedback: 'First feedback' }; },
      value => { seen.push(value); return { decision: 'allow', feedback: 'Second feedback' }; },
    ]]]) });
    expect(seen).toEqual([payload, payload]); expect(seen.every(value => Object.isFrozen(value))).toBe(true);
    expect(result).toMatchObject({ decision: 'allow', feedback: expect.stringContaining('First feedback') });
    expect(result).toMatchObject({ feedback: expect.stringContaining('Second feedback') });
  });

  it.each([
    null, [], 'handled', { action: 'unknown' }, { action: 'transform' }, { action: 'transform', text: 1 },
    { action: 'transform', text: 'Invalid image', images: null },
    { action: 'transform', text: 'Invalid image', images: [{ type: 'text', text: 'Not an image' }] },
    { action: 'transform', text: 'Invalid image', images: [{ ...image, data: 1 }] },
    { action: 'transform', text: 'Invalid image', images: Array(1) },
    { action: 'transform', text: 'x'.repeat(1024 * 1024 + 1) },
    { action: 'transform', text: 'Too many images', images: Array.from({ length: 65 }, () => image) },
  ])('refuses malformed or oversized input results', async result => {
    await expect(dispatch([() => result])).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
  });

  it.each(['getter', 'toJSON', 'proxy', 'cycle'] as const)('rejects %s data without executing extension hooks during capture', async kind => {
    const effect = vi.fn(() => { throw new Error('PRIVATE_INPUT_GETTER'); });
    const result: Record<string, unknown> = { action: 'transform', text: 'Unsafe' };
    let value: unknown = result;
    if (kind === 'getter') Object.defineProperty(result, 'images', { enumerable: true, get: effect });
    if (kind === 'toJSON') result.toJSON = effect;
    if (kind === 'proxy') value = new Proxy(result, { ownKeys: effect });
    if (kind === 'cycle') result.self = result;
    await expect(dispatch([() => value])).rejects.toMatchObject({ name: 'InputRefusal', message: 'Extension input was refused.' });
    expect(effect).not.toHaveBeenCalled();
  });

  it.each(['caller', 'owner'] as const)('discards a late transform after %s cancellation', async kind => {
    const controller = new AbortController(); let finish!: () => void; let enter!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const later = vi.fn(() => ({ action: 'continue' }));
    const pending = dispatch([async () => { enter(); await held; return { action: 'transform', text: 'Late' }; }, later], event,
      kind === 'caller' ? controller.signal : undefined, kind === 'owner' ? controller.signal : undefined);
    const observed = pending.catch(error => error);
    await entered; controller.abort(); finish();
    expect(await observed).toBeInstanceOf(Error); expect(later).not.toHaveBeenCalled();
  });
});
