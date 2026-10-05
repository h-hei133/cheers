import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createWebFetchToolDefinition } from './webFetch.js';
import { createWebSearchToolDefinition } from './webSearch.js';
import { adaptTools, createToolHooks } from '../../turn/tools.js';
import type { HookDispatcher } from '../hooks/hookDispatcher.js';

const nativeFetch = globalThis.fetch;
let server: Server;
let base: string;
let handle: (response: ServerResponse) => void;
const context = { workspaceRoot: '/workspace', taskId: 'local-http' };

beforeEach(async () => {
  vi.stubEnv('EXA_API_KEY', ''); vi.stubEnv('TAVILY_API_KEY', '');
  server = createServer((_request, response) => handle(response));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local fixture address');
  base = `http://127.0.0.1:${address.port}`;
  // Redirect only the test transport to our fixture; product public-URL policy remains active.
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => nativeFetch(base, init));
});

afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

it('a real stalled HTTP body is cancelled at the tool deadline', async () => {
  let closed = false;
  handle = response => { response.on('close', () => { closed = true; }); response.writeHead(200); response.write('partial'); };
  const result = await createWebFetchToolDefinition().execute({ url: 'https://example.com', timeoutMs: 500 }, context);
  expect(result.metadata?.network).toMatchObject({ code: 'timeout' });
  expect(result.success).toBe(false);
  await vi.waitFor(() => expect(closed).toBe(true));
});

it('counts decoded gzip bytes rather than trusting its small Content-Length', async () => {
  const compressed = gzipSync(Buffer.alloc(6 * 1024 * 1024, 'a'));
  handle = response => {
    response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': compressed.length });
    response.end(compressed);
  };
  const result = await createWebFetchToolDefinition().execute({ url: 'https://example.com' }, context);
  expect(result.metadata?.network).toMatchObject({ code: 'response_limit' });
  expect(result.success).toBe(false);
});

it('discards a streaming error body and keeps secrets out of model and hook evidence', async () => {
  vi.stubEnv('EXA_API_KEY', 'SYNTHETIC_KEY');
  let closed = false;
  handle = response => {
    response.on('close', () => { closed = true; });
    response.writeHead(429, { 'content-type': 'text/plain' });
    response.write('PRIVATE_ERROR_BODY');
  };
  const events: unknown[] = [];
  const setup = { sessionId: 'local', workspaceRoot: '/workspace', emit: (event: unknown) => { events.push(event); },
    hooks: { dispatch: async (event: unknown) => { events.push(event); return { decision: 'allow' }; } } as unknown as HookDispatcher };
  const definition = createWebSearchToolDefinition();
  const [tool] = adaptTools(new Map([['web_search', definition]]), setup);
  const result = await tool.execute('local-http', { query: 'test' });
  expect(result.isError).toBe(true);
  expect(result.metadata?.network).toMatchObject({ code: 'rate_limited', status: 429 });
  await createToolHooks(setup).afterToolCall!({ assistantMessage: { role: 'assistant', content: '' },
    call: { id: 'local-http', name: 'web_search', args: { query: 'test' } }, args: { query: 'test' }, result, isError: true });
  expect(JSON.stringify({ result, events })).not.toContain('PRIVATE_ERROR_BODY');
  await vi.waitFor(() => expect(closed).toBe(true));
});

it('retains normal real HTTP text', async () => {
  handle = response => { response.writeHead(200, { 'content-type': 'text/markdown' }); response.end('# public text'); };
  const result = await createWebFetchToolDefinition().execute({ url: 'https://example.com' }, context);
  expect(result.success).toBe(true); expect(result.output).toBe('# public text');
});
