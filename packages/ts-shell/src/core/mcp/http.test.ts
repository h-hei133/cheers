import fs from 'node:fs';
import path from 'node:path';
import { createServer, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { CoreMcpClient } from './client.js';
import { mcpFetch } from './http/fetch.js';
import { requestScope } from '../network/request.js';
import { HookDispatcher } from '../hooks/hookDispatcher.js';
import { runMcpAuthCommand } from '../../cli/mcp/auth/command.js';
import { McpAuthService } from '../../cli/mcp/auth/service.js';
import { credentialPath, readCredentials } from '../../cli/mcp/auth/store.js';
import { validateDiscovery } from '../../cli/mcp/auth/record.js';
import { loadMcpConfigs } from './config/document.js';
import type { ToolGateOptions } from '../../turn/tools.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(cleanups.splice(0).reverse().map(cleanup => cleanup())); cleanupAdvisorHarnesses(); });

async function fixture() {
  const setup = createAdvisorHarness(false, false); const calls: { route: string; method?: string; authorization?: string; body: string }[] = [];
  const streams = new Set<ServerResponse>(); const posts = new Set<ServerResponse>();
  const pings = new Map<number, ServerResponse>();
  let requireAuth = false; let holdToken = false; let loseResult = false; let toolStream: 'pending' | 'complete' | 'error' | 'ping' | undefined;
  const heldTokens: (() => void)[] = [];
  let activeToken = 'SYNTHETIC_MCP_ACCESS'; let authorizeUrl: URL | undefined; let tokenReceived!: () => void;
  const tokenWait = new Promise<void>(resolve => { tokenReceived = resolve; });
  const server = createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += String(chunk);
    calls.push({ route: req.url!, method: req.method, authorization: req.headers.authorization, body: text });
    const json = (value: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json', 'mcp-session-id': 'fixture-session' }); res.end(JSON.stringify(value)); };
    if (req.url!.startsWith('/.well-known/oauth-protected-resource')) return json({ resource: url, authorization_servers: [origin], scopes_supported: ['read'] });
    if (req.url!.startsWith('/.well-known/oauth-authorization-server')) return json({ issuer: origin, authorization_endpoint: origin + '/authorize', token_endpoint: origin + '/token', registration_endpoint: origin + '/register', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] });
    if (req.url === '/register') { const body = JSON.parse(text); return json({ ...body, client_id: 'synthetic-client' }); }
    if (req.url === '/token') {
      tokenReceived(); if (holdToken) { holdToken = false; await new Promise<void>(resolve => heldTokens.push(resolve)); }
      const params = new URLSearchParams(text);
      if (params.get('grant_type') === 'authorization_code') {
        if (createHash('sha256').update(params.get('code_verifier')!).digest('base64url') !== authorizeUrl?.searchParams.get('code_challenge')) return json({ error: 'invalid_grant' }, 400);
      } else activeToken = 'SYNTHETIC_MCP_ACCESS_RENEWED';
      return json({ access_token: activeToken, refresh_token: 'SYNTHETIC_MCP_REFRESH', token_type: 'Bearer', expires_in: 3600 });
    }
    if (req.url === '/redirect') { res.writeHead(307, { location: origin + '/mcp' }); res.end(); return; }
    if (req.url !== '/mcp') { res.writeHead(404); res.end(); return; }
    if (requireAuth && req.headers.authorization !== `Bearer ${activeToken}`) { res.writeHead(401, { 'www-authenticate': 'Bearer' }); res.end('RAW_REMOTE_SECRET_MUST_NOT_DISPLAY'); return; }
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders(); streams.add(res); res.once('close', () => streams.delete(res)); return; }
    if (req.method === 'DELETE') { res.writeHead(204); res.end(); return; }
    const message = JSON.parse(text);
    if (!message.method && pings.has(message.id)) {
      res.writeHead(202); res.end();
      pings.get(message.id)!.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'stream effect response' }] } })}\n\n`);
      pings.delete(message.id); return;
    }
    if (message.id === undefined) { res.writeHead(202); res.end(); return; }
    if (message.method === 'initialize') return json({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {}, resources: { subscribe: true, listChanged: true }, prompts: { listChanged: true } }, serverInfo: { name: 'fixture', version: '1' } } });
    if (message.method === 'tools/list') return json({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] } });
    if (message.method === 'tools/call' && loseResult) { res.destroy(); return; }
    if (message.method === 'tools/call' && toolStream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders(); posts.add(res); res.once('close', () => posts.delete(res));
      if (toolStream === 'ping') { pings.set(message.id, res); res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, method: 'ping' })}\n\n`); }
      else if (toolStream !== 'pending') {
        const response = toolStream === 'complete' ? { result: { content: [{ type: 'text', text: 'stream effect response' }] } } : { error: { code: -32602, message: 'remote rejection' } };
        // Split a resumption field across chunks and use CRLF, retaining the RPC ID.
        res.write('i'); res.write(`d: resume-${message.id}\r\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, ...response })}\r\n\r\n`);
      }
      return;
    }
    let result: unknown = {};
    if (message.method === 'tools/call') result = { content: [{ type: 'text', text: 'actual HTTP effect response' }] };
    if (message.method === 'resources/list') result = message.params?.cursor ? { resources: [{ uri: 'fixture://two', name: 'second' }] } : { resources: [{ uri: 'fixture://one', name: 'first' }], nextCursor: 'page-two' };
    if (message.method === 'resources/read') result = { contents: [{ uri: message.params.uri, text: 'HTTP resource body' }] };
    if (message.method === 'prompts/list') result = { prompts: [{ name: 'greeting' }] };
    if (message.method === 'prompts/get') result = { messages: [{ role: 'user', content: { type: 'text', text: 'HTTP prompt body' } }] };
    json({ jsonrpc: '2.0', id: message.id, result });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; const url = origin + '/mcp';
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const target = path.join(setup.root, '.cheers.mcp.json'); fs.writeFileSync(target, JSON.stringify({ mcpServers: { remote: { transport: 'http', url } } }));
  const config = loadMcpConfigs(setup.root, true).remote!; const service = new McpAuthService('remote', config);
  let approve = true;
  const gate: ToolGateOptions = { sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {},
    escalationPromptHandler: async () => ({ promptId: 'p', respondedAt: Date.now(), decision: approve ? 'allow-once' : 'deny' }) };
  const host = { root: setup.root, trusted: () => true, sourceAccess: () => {}, gate: () => gate, changed: async () => {},
    onAuthorizeUrl: (value: string) => { authorizeUrl = new URL(value); void browser(authorizeUrl); } };
  async function browser(selected: URL, state?: string) {
    const callback = new URL(selected.searchParams.get('redirect_uri')!); callback.searchParams.set('code', 'synthetic-code'); callback.searchParams.set('state', state ?? selected.searchParams.get('state')!);
    const response = await fetch(callback); await response.text();
  }
  const client = (timeout = 1000) => { const item = new CoreMcpClient('remote', config, setup.root, timeout, undefined, service); cleanups.push(() => item.close()); return item; };
  return { ...setup, url, origin, config, service, calls, host, gate, client, browser, streams, posts, tokenWait,
    auth: () => runMcpAuthCommand(['auth', 'remote'], host), setApproval: (value: boolean) => { approve = value; },
    requireAuth: () => { requireAuth = true; }, holdToken: () => { holdToken = true; }, releaseToken: () => heldTokens.splice(0).forEach(release => release()), loseResult: () => { loseResult = true; },
    toolStream: (value: 'pending' | 'complete' | 'error' | 'ping') => { toolStream = value; } };
}

it('shares one negotiated HTTP connection for complete catalogs, content, prompts and bounded notifications', async () => {
  const f = await fixture(); const client = f.client();
  expect(await client.connect()).toMatchObject({ type: 'connected' });
  expect(await client.listTools()).toHaveLength(1);
  expect(await client.content({ action: 'resources' })).toMatchObject({ kind: 'resources', items: [{ uri: 'fixture://one' }, { uri: 'fixture://two' }] });
  expect(await client.content({ action: 'read', uri: 'fixture://one' })).toMatchObject({ kind: 'read', value: { contents: [{ text: 'HTTP resource body' }] } });
  expect(await client.content({ action: 'prompt', name: 'greeting' })).toMatchObject({ kind: 'prompt' });
  await vi.waitFor(() => expect(f.streams.size).toBe(1));
  for (const stream of f.streams) for (let i = 0; i < 205; i++) stream.write('data: {"jsonrpc":"2.0","method":"notifications/message","params":{"level":"info","data":"secret remote body"}}\n\n');
  await vi.waitFor(() => expect(client.notifications().dropped).toBe(5));
  expect(JSON.stringify(client.notifications())).not.toContain('secret remote body');
  expect(f.calls.filter(item => item.body && JSON.parse(item.body).method === 'initialize')).toHaveLength(1);
});

it('requires explicit approved PKCE sign-in, stores source/issuer-bound private credentials and reuses them after restart', async () => {
  const f = await fixture(); f.requireAuth();
  expect(await f.client().connect()).toMatchObject({ type: 'needs-auth' });
  expect(f.calls.some(call => call.route === '/register')).toBe(false);
  f.setApproval(false); const denied = await f.auth(); expect(denied.report?.facts.status).toBe('unchanged');
  expect(f.calls.some(call => call.route === '/register')).toBe(false); expect(fs.existsSync(f.service.target)).toBe(false);
  f.setApproval(true); expect((await f.auth()).report?.facts.status).toBe('persisted');
  const record = readCredentials(f.service.target).record!; expect(record.issuer).toBe(f.origin); expect(record.tokens.issuer).toBe(f.origin);
  expect(fs.statSync(f.service.target).mode & 0o777).toBe(0o600);
  expect(credentialPath('other', f.config)).not.toBe(f.service.target);
  expect(credentialPath('remote', { ...f.config, scope: 'user', sourcePath: 'different' })).not.toBe(f.service.target);
  expect(credentialPath('remote', { ...f.config, enabled: false, overridePath: 'override' })).toBe(f.service.target);
  expect(await f.client().connect()).toMatchObject({ type: 'connected' });
  expect(await f.client().invokeTool('echo', {})).toMatchObject({ content: 'actual HTTP effect response' });
});

it('persists renewal before using its bearer token and never replays a lost tool effect', async () => {
  const f = await fixture(); f.requireAuth(); expect((await f.auth()).report?.facts.status).toBe('persisted');
  const saved = JSON.parse(fs.readFileSync(f.service.target, 'utf8')); saved.expiresAt = Date.now() - 1; fs.writeFileSync(f.service.target, JSON.stringify(saved));
  expect(await f.client().connect()).toMatchObject({ type: 'connected' });
  expect(readCredentials(f.service.target).record?.tokens.access_token).toBe('SYNTHETIC_MCP_ACCESS_RENEWED');
  expect(f.calls.filter(call => call.route === '/token')).toHaveLength(2);
  const client = f.client(); await client.connect(); await client.listTools(); f.loseResult();
  await expect(client.invokeTool('echo', {})).rejects.toThrow(/no operation was replayed|closed/i);
  expect(f.calls.filter(call => call.body.includes('tools/call'))).toHaveLength(1);
});

it('cancels sign-in with no late token publication and refuses a mismatched callback state', async () => {
  const f = await fixture(); const abort = new AbortController(); let url!: URL; let offered!: () => void;
  const available = new Promise<void>(resolve => { offered = resolve; });
  const pending = runMcpAuthCommand(['auth', 'remote'], { ...f.host, signal: abort.signal, onAuthorizeUrl: value => { url = new URL(value); offered(); } });
  await available; abort.abort(); expect((await pending).report?.facts.status).toBe('unverified');
  expect(fs.existsSync(f.service.target)).toBe(false); expect(f.calls.some(call => call.route === '/token')).toBe(false);
  await expect(f.browser(url)).rejects.toThrow();
  const rejected = await runMcpAuthCommand(['auth', 'remote'], { ...f.host, onAuthorizeUrl: value => { void f.browser(new URL(value), 'wrong-state'); } });
  expect(rejected.report?.facts.status).toBe('unverified'); expect(fs.existsSync(f.service.target)).toBe(false);
});

it('guards issuer endpoints, source revocation, configured header scope and HTTP redirects', async () => {
  const f = await fixture();
  expect(() => validateDiscovery({ authorizationServerUrl: f.origin, authorizationServerMetadata: { issuer: f.origin, authorization_endpoint: f.origin + '/authorize', token_endpoint: 'https://other.invalid/token', response_types_supported: ['code'] } })).toThrow(/issuer origin/);
  const fetchFn = mcpFetch(f.url, { headers: { 'X-Synthetic': 'header-secret' } });
  expect((await fetchFn(f.origin + '/redirect', { method: 'GET' })).status).toBe(307);
  expect(f.calls.filter(call => call.route === '/mcp')).toHaveLength(0);
  let allowed = true; const changed = await runMcpAuthCommand(['auth', 'remote'], { ...f.host, gate: () => ({ ...f.gate, admission: () => allowed ? undefined : 'revoked',
    escalationPromptHandler: async () => { allowed = false; return { promptId: 'p', respondedAt: Date.now(), decision: 'allow-once' }; } }) });
  expect(changed.report?.facts.status).toBe('unchanged'); expect(f.calls.some(call => call.route === '/register')).toBe(false);
});

it('lets a notification stream outlive its header deadline while retaining parent cancellation', () => {
  vi.useFakeTimers(); const abort = new AbortController(); const scope = requestScope(15_000, abort.signal);
  scope.releaseDeadline(); vi.advanceTimersByTime(60_000); expect(() => scope.check()).not.toThrow();
  abort.abort(); expect(() => scope.check()).toThrow(); scope.dispose();
});

it('closes successful and timed-out POST streams without accumulating or replaying tool effects', async () => {
  const f = await fixture(); const client = f.client(100); f.toolStream('complete');
  expect(await client.invokeTool('echo', {})).toMatchObject({ content: 'stream effect response' });
  await vi.waitFor(() => { expect(f.posts.size).toBe(0); expect(f.streams.size).toBe(1); });
  expect(client.notifications().state).toBe('live');
  f.toolStream('ping');
  expect(await client.invokeTool('echo', {})).toMatchObject({ content: 'stream effect response' });
  await vi.waitFor(() => { expect(f.posts.size).toBe(0); expect(f.streams.size).toBe(1); });
  expect(f.calls.some(call => call.body && JSON.parse(call.body).result && !JSON.parse(call.body).method)).toBe(true);
  f.toolStream('error');
  await expect(client.invokeTool('echo', {})).rejects.toMatchObject({ failureClass: 'protocol' });
  await vi.waitFor(() => { expect(f.posts.size).toBe(0); expect(f.streams.size).toBe(1); });
  expect(client.notifications().state).toBe('live');
  f.toolStream('pending');
  for (let i = 0; i < 2; i++) {
    await expect(client.invokeTool('echo', {})).rejects.toMatchObject({ failureClass: 'timeout-cancelled' });
  }
  await vi.waitFor(() => expect(f.posts.size).toBe(0));
  expect(f.calls.filter(call => call.body.includes('tools/call'))).toHaveLength(5);
});

it('fences a late fresh login and a late refresh after logout, including an originally absent profile', async () => {
  const f = await fixture(); f.holdToken(); const pending = f.auth(); await f.tokenWait;
  f.service.logout(); expect(readCredentials(f.service.target).record).toBeUndefined();
  const tombstone = fs.readFileSync(f.service.target, 'utf8'); f.releaseToken();
  expect((await pending).report?.facts.status).toBe('unverified');
  expect(fs.readFileSync(f.service.target, 'utf8')).toBe(tombstone);
  expect((await f.auth()).report?.facts.status).toBe('persisted');
  const record = JSON.parse(fs.readFileSync(f.service.target, 'utf8')); record.expiresAt = 0; fs.writeFileSync(f.service.target, JSON.stringify(record));
  f.holdToken(); const refresh = f.service.token().catch(error => error);
  await vi.waitFor(() => expect(f.calls.filter(call => call.route === '/token')).toHaveLength(3));
  f.service.logout(); const revoked = fs.readFileSync(f.service.target, 'utf8'); f.releaseToken();
  expect(await refresh).toBeInstanceOf(Error); expect(fs.readFileSync(f.service.target, 'utf8')).toBe(revoked);
});
