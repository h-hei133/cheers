import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebFetchToolDefinition } from './webFetch.js';
import { createWebSearchToolDefinition } from './webSearch.js';

const context = { workspaceRoot: '/workspace', taskId: 'web-test' };
const sources = ['fetch', 'exa', 'tavily', 'keyless'] as const;
type Source = typeof sources[number];
function select(source: Source) {
  vi.stubEnv('EXA_API_KEY', source === 'exa' ? 'SYNTHETIC_KEY' : '');
  vi.stubEnv('TAVILY_API_KEY', source === 'tavily' ? 'SYNTHETIC_KEY' : '');
  return source === 'fetch' ? createWebFetchToolDefinition() : createWebSearchToolDefinition();
}
function args(source: Source) { return source === 'fetch' ? { url: 'https://example.com/page' } : { query: 'question' }; }
function body(status: number, bytes = 10, declared?: number) {
  const cancel = vi.fn();
  const pull = vi.fn(controller => controller.enqueue(new Uint8Array(bytes).fill(65)));
  const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), {
    status, statusText: 'PRIVATE_STATUS', headers: declared === undefined ? {} : { 'content-length': String(declared) },
  });
  return { response, pull, cancel };
}

beforeEach(() => { vi.stubEnv('EXA_API_KEY', ''); vi.stubEnv('TAVILY_API_KEY', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe.each(sources)('%s network boundary', source => {
  it('pre-cancellation issues zero requests', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const controller = new AbortController(); controller.abort('PRIVATE_ABORT');
    const result = await select(source).execute(args(source), { ...context, abortSignal: controller.signal });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.metadata?.network).toMatchObject({ source, code: 'cancelled' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ABORT');
  });
  it('retains a local deadline when a parent signal exists', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetch);
    const parent = new AbortController();
    const pending = select(source).execute(args(source), { ...context, abortSignal: parent.signal });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
    expect((await pending).metadata?.network).toMatchObject({ source, code: 'timeout' });
    expect(parent.signal.aborted).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([[429, 'rate_limited'], [403, 'denied'], [500, 'http_error']] as const)(
    'discards HTTP %s without reading or leaking its body', async (status, code) => {
      const response = body(status, 10_000_000);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response.response));
      const result = await select(source).execute(args(source), context);
      expect(result.success).toBe(false);
      expect(result.metadata?.network).toEqual({ source, code, status });
      expect(response.pull).not.toHaveBeenCalled(); expect(response.cancel).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain('PRIVATE_STATUS');
    });
  it.each(['declared', 'streamed'] as const)('cancels a %s oversized success', async mode => {
    const bytes = (source === 'fetch' ? 5 : 2) * 1024 * 1024 + 1;
    const response = body(200, bytes, mode === 'declared' ? bytes : 1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response.response));
    const result = await select(source).execute(args(source), context);
    expect(result.metadata?.network).toMatchObject({ source, code: 'response_limit' });
    expect(response.cancel).toHaveBeenCalledOnce();
    expect(response.pull).toHaveBeenCalledTimes(mode === 'declared' ? 0 : 1);
  });
  it('does not expose native transport exception contents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('PRIVATE_TRANSPORT https://secret.test/token')));
    const result = await select(source).execute(args(source), context);
    expect(result.metadata?.network).toMatchObject({ source, code: 'network_error' });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_TRANSPORT|secret.test/);
  });
});

it('cancels a redirect response before checking the next URL', async () => {
  const response = body(302); response.response.headers.set('location', 'http://127.0.0.1/PRIVATE_PATH');
  const fetch = vi.fn().mockResolvedValue(response.response); vi.stubGlobal('fetch', fetch);
  const result = await select('fetch').execute(args('fetch'), context);
  expect(result.metadata?.network).toMatchObject({ code: 'denied' });
  expect(fetch).toHaveBeenCalledOnce(); expect(response.cancel).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain('PRIVATE_PATH');
});

it('shares the original deadline across redirect and body reads', async () => {
  vi.useFakeTimers();
  const response = body(302); response.response.headers.set('location', '/next');
  const cancel = vi.fn();
  let resolveFirst!: (response: Response) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 })));
  vi.stubGlobal('fetch', fetch);
  const pending = select('fetch').execute({ ...args('fetch'), timeoutMs: 100 }, context);
  await vi.advanceTimersByTimeAsync(90); resolveFirst(response.response);
  await vi.advanceTimersByTimeAsync(10);
  expect((await pending).metadata?.network).toMatchObject({ code: 'timeout' });
  expect(fetch).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledOnce();
});

it.each(['exa', 'tavily'] as const)('validates and bounds %s results', async source => {
  const results = Array.from({ length: 12 }, (_, i) => ({ title: `title${i}` + 'a'.repeat(600), url: 'https://example.com/' + 'b'.repeat(2100), content: 'c'.repeat(2000), highlights: ['d'.repeat(2000)] }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results }))));
  const result = await select(source).execute({ query: 'test', numResults: 2 }, context);
  expect(result.success).toBe(true); expect(result.metadata?.truncated).toBe(true);
  expect(result.output).toContain('Search results truncated');
  expect(result.output).toContain('title0'); expect(result.output).toContain('title1'); expect(result.output).not.toContain('title2');
  expect(result.output!.length).toBeLessThan(8000);
});

it.each(['exa', 'tavily'] as const)('refuses malformed %s responses without exposing values', async source => {
  for (const raw of ['PRIVATE_INVALID_JSON', '{}', '{"results":null}', '{"results":[{"title":7,"text":"PRIVATE_VALUE"}]}', '['.repeat(40) + '0' + ']'.repeat(40)]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(raw)));
    const result = await select(source).execute(args(source), context);
    expect(result.metadata?.network).toMatchObject({ code: 'invalid_response' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  }
});

it('preserves keyless HTML result parsing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<div class="result"><a class="result__a" href="https://example.com">Title</a><span class="result__snippet">Useful text</span></div>')));
  const result = await select('keyless').execute(args('keyless'), context);
  expect(result.success).toBe(true); expect(result.output).toContain('Title'); expect(result.output).toContain('Useful text');
});
