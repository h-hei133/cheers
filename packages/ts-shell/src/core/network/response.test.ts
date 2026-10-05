import { afterEach, expect, it, vi } from 'vitest';
import { requestScope } from './request.js';
import { parseResponseJson, readResponseText } from './response.js';

afterEach(() => vi.useRealTimers());

it('decodes split UTF-8 at the exact byte boundary', async () => {
  const bytes = new TextEncoder().encode('中文');
  let index = 0;
  const scope = requestScope(1000);
  const response = new Response(new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close(); else controller.enqueue(bytes.slice(index, ++index));
  } }));
  try { expect(await readResponseText(response, scope, bytes.length)).toBe('中文'); }
  finally { scope.dispose(); }
});

it.each(['declared', 'streamed'] as const)('cancels %s oversized bodies without awaiting slow cleanup', async mode => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const pull = vi.fn(controller => controller.enqueue(new Uint8Array(5)));
  const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }),
    { headers: mode === 'declared' ? { 'content-length': '5' } : { 'content-length': '1' } });
  const scope = requestScope(1000);
  try {
    await expect(readResponseText(response, scope, 4)).rejects.toMatchObject({ code: 'response_limit' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(pull).toHaveBeenCalledTimes(mode === 'declared' ? 0 : 1);
    expect(response.body?.locked).toBe(false);
  } finally { scope.dispose(); }
});

it.each(['parent', 'deadline'] as const)('interrupts a stalled body on %s and releases its reader', async cause => {
  vi.useFakeTimers();
  const parent = new AbortController();
  const scope = requestScope(100, parent.signal);
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }));
  const pending = readResponseText(response, scope, 4);
  const assertion = expect(pending).rejects.toMatchObject({ code: cause === 'parent' ? 'cancelled' : 'timeout' });
  if (cause === 'parent') parent.abort('PRIVATE_REASON');
  else await vi.advanceTimersByTimeAsync(100);
  try { await assertion; expect(cancel).toHaveBeenCalledOnce(); expect(response.body?.locked).toBe(false); }
  finally { scope.dispose(); }
});

it('keeps the first stop cause and clears deadline/listener resources', async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  const remove = vi.spyOn(parent.signal, 'removeEventListener');
  const scope = requestScope(10, parent.signal);
  await vi.advanceTimersByTimeAsync(10); parent.abort();
  expect(() => scope.check()).toThrow('timeout');
  scope.dispose(); expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledOnce();
});

it('rejects excessive JSON depth before parsing while ignoring braces inside strings', () => {
  expect(() => parseResponseJson('['.repeat(33) + '0' + ']'.repeat(33))).toThrow('invalid_response');
  const value = { text: '[[["{{{', ok: true };
  expect(parseResponseJson(JSON.stringify(value), 1)).toEqual(value);
  expect(() => parseResponseJson('{bad json PRIVATE_BODY')).toThrow('invalid_response');
});
