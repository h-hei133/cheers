import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { mcpFetch } from './fetch.js';
import { CoreMcpClient } from '../client.js';
import { describeMcpConnectionState } from '../status.js';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../../test-utils/advisor.js';
import { runMcpAuthCommand } from '../../../cli/mcp/auth/command.js';
import { HookDispatcher } from '../../hooks/hookDispatcher.js';

const variable = 'CHEERS_MCP_TEST_BEARER';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs(); cleanupAdvisorHarnesses();
});

async function fixture(unauthorized = false) {
  const calls: { route: string; authorization?: string; method?: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += String(part);
    const message = body ? JSON.parse(body) : undefined;
    calls.push({ route: req.url!, authorization: req.headers.authorization, method: message?.method });
    if (unauthorized) { res.writeHead(401, { 'www-authenticate': 'Bearer resource_metadata="http://127.0.0.1/issuer"' }); res.end(); return; }
    if (req.method === 'GET') { res.writeHead(405); res.end(); return; }
    if (message && message.id === undefined) { res.writeHead(202); res.end(); return; }
    let result: unknown = {};
    if (message?.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'bearer-fixture', version: '1' } };
    if (message?.method === 'tools/list') result = { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] };
    if (message?.method === 'tools/call') result = { content: [{ type: 'text', text: 'synthetic readonly result' }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(message ? { jsonrpc: '2.0', id: message.id, result } : {}));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`;
  const config = { transport: 'http' as const, url, scope: 'project' as const, bearerTokenEnvVar: variable };
  const client = () => { const value = new CoreMcpClient('remote', config); cleanups.push(() => value.close()); return value; };
  return { calls, url, client };
}

it('uses the named credential through the real HTTP transport and refuses identity changes before dispatch', async () => {
  const f = await fixture(); vi.stubEnv(variable, 'synthetic-first');
  const first = f.client(); expect(await first.connect()).toMatchObject({ type: 'connected' });
  expect(await first.listTools()).toHaveLength(1);
  expect(await first.invokeTool('inspect', {})).toMatchObject({ content: 'synthetic readonly result' });
  expect(f.calls.every(call => call.authorization === 'Bearer synthetic-first')).toBe(true);
  const dispatched = f.calls.length;
  vi.stubEnv(variable, 'synthetic-second');
  await expect(first.invokeTool('inspect', {})).rejects.toThrow();
  expect(f.calls).toHaveLength(dispatched);
  await first.close();
  const second = f.client(); expect(await second.connect()).toMatchObject({ type: 'connected' });
  expect(f.calls.slice(dispatched).every(call => call.authorization === 'Bearer synthetic-second')).toBe(true);
});

it.each(['', 'synthetic\r\nInjected: secret', 'non-ascii-秘密', 'x'.repeat(8193)])('rejects unavailable or unsafe bearer values without fallback (%#)', async token => {
  const f = await fixture(); vi.stubEnv(variable, token);
  const oauth = { token: vi.fn(async () => 'synthetic-oauth-fallback') };
  const fetch = mcpFetch(f.url, { bearerTokenEnvVar: variable, authorization: oauth });
  await expect(fetch(f.url, { method: 'POST', body: '{}' })).rejects.toThrow('MCP authentication is required.');
  expect(oauth.token).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});

it('keeps HTTP 401 as external authentication failure without discovery or replay', async () => {
  const f = await fixture(true); vi.stubEnv(variable, 'synthetic-rejected');
  const state = await f.client().connect(); expect(state.type).toBe('needs-auth');
  expect(f.calls).toHaveLength(1); expect(f.calls[0]?.route).toBe('/mcp');
  expect(describeMcpConnectionState(state).doNext).not.toContain('/mcp auth');
});

it('reports missing environment authentication with the applicable recovery action', async () => {
  const f = await fixture(); vi.stubEnv(variable, '');
  const state = await f.client().connect(); expect(state.type).toBe('needs-auth');
  const projection = describeMcpConnectionState(state);
  expect(projection.doNext).toContain('environment'); expect(projection.doNext).not.toContain('/mcp auth');
  expect(f.calls).toEqual([]);
});

it('does not attach the environment bearer to another HTTP path or consult OAuth', async () => {
  const f = await fixture(); vi.stubEnv(variable, 'synthetic-private');
  const oauth = { token: vi.fn(async () => 'synthetic-oauth-fallback') };
  const fetch = mcpFetch(f.url, { bearerTokenEnvVar: variable, authorization: oauth });
  await (await fetch(f.url.replace('/mcp', '/issuer'), { method: 'POST', body: '{}' })).text();
  expect(f.calls[0]?.authorization).toBeUndefined(); expect(oauth.token).not.toHaveBeenCalled();
});

it('rechecks the captured credential after a synchronous admission callback changes it', async () => {
  const f = await fixture(); vi.stubEnv(variable, 'synthetic-first'); let checks = 0;
  const fetch = mcpFetch(f.url, { bearerTokenEnvVar: variable,
    admission: () => { if (++checks === 2) vi.stubEnv(variable, 'synthetic-second'); return undefined; } });
  await expect(fetch(f.url, { method: 'POST', body: '{}' })).rejects.toThrow('MCP authentication is required.');
  expect(f.calls).toEqual([]);
});

it.each(['auth', 'logout'])('keeps externally managed bearer %s unchanged without OAuth discovery or publication', async action => {
  const f = await fixture(), setup = createAdvisorHarness(false, false);
  fs.writeFileSync(path.join(setup.root, '.cheers.mcp.json'), JSON.stringify({ mcpServers: { remote: {
    transport: 'http', url: f.url, bearerTokenEnvVar: variable } } }));
  const authorize = vi.fn(), changed = vi.fn();
  const result = await runMcpAuthCommand([action, 'remote'], { root: setup.root, trusted: () => true, sourceAccess: () => {}, changed,
    onAuthorizeUrl: authorize, gate: () => ({ sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build',
      permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} }) });
  expect(result.report?.facts.status).toBe('unchanged'); expect(result.output).toContain('environment');
  expect(result.report?.facts.connection).toBe('not-tested');
  expect(authorize).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
