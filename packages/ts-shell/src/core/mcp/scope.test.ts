import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer, type ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { registerCatalogContribution } from '../catalog/contributions.js';
import { sessionMcpDefinitions } from '../catalog/mcp.js';
import { projectTrust } from '../security/projectTrust.js';
import { CoreMcpGateway } from './gateway.js';
import { McpSessionGateway } from './scope.js';
import type { ScopedMcpServerConfig } from './types.js';

it('keeps same-name extension connections and their contracts local to each session', async () => {
  const root = process.cwd();
  const name = 'extension-session';
  const ordinary = 'ordinary';
  const ordinaryConfig = { transport: 'http', scope: 'user', url: 'http://127.0.0.1:8099/mcp' } as const;
  const sharedConfigs: Record<string, ScopedMcpServerConfig> = { [ordinary]: ordinaryConfig };
  const shared = new CoreMcpGateway(root, undefined, undefined, undefined, undefined, () => ({ ...sharedConfigs }));
  const trust = vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(false);
  const connect = vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
  const capabilities = vi.spyOn(Client.prototype, 'getServerCapabilities').mockReturnValue({ tools: {} });
  let holdNext = false;
  let entered!: () => void;
  let release!: () => void;
  let held: Promise<void>;
  const hold = () => {
    holdNext = true;
    held = new Promise<void>(resolve => { release = resolve; });
    return new Promise<void>(resolve => { entered = resolve; });
  };
  const requests = vi.spyOn(Client.prototype, 'request').mockImplementation(async input => {
    if (input.method === 'tools/list') return { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] };
    if (holdNext) { holdNext = false; entered(); await held; }
    return { content: [{ type: 'text', text: 'answer' }] };
  });
  const scopes = ['alpha', 'beta'].map((sessionId, index) => ({
    gateway: new McpSessionGateway(shared, () => root, () => () => undefined, sessionMcpDefinitions(() => sessionId)),
    retire: registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], mcpServers: [{
      name, config: { url: `http://127.0.0.1:${8100 + index}/mcp`, transport: 'http', scope: 'project' },
    }] }),
  }));
  const [alpha, beta] = scopes;
  try {
    const [first, second] = await Promise.all(scopes.map(({ gateway }) => gateway.snapshot()));
    const firstId = first!.tools.find(tool => tool.serverName === name)?.contractId;
    const secondId = second!.tools.find(tool => tool.serverName === name)?.contractId;
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    expect(shared.loadConfigs()).not.toHaveProperty(name);
    expect(alpha!.gateway.loadConfigs()[name]?.url).toBe('http://127.0.0.1:8100/mcp');
    expect(beta!.gateway.loadConfigs()[name]?.url).toBe('http://127.0.0.1:8101/mcp');
    await expect(beta!.gateway.invokeTool(name, 'inspect', {}, undefined, { contractId: firstId })).rejects.toThrow();
    await expect(alpha!.gateway.invokeTool(name, 'inspect', {}, undefined, { contractId: firstId })).resolves.toEqual({ content: 'answer' });
    const reached = hold();
    const call = shared.invokeTool(ordinary, 'inspect', {});
    await Promise.race([reached, call]);
    const discovered = vi.fn();
    const filtered = Promise.all([
      beta!.gateway.snapshot(undefined, undefined, candidate => candidate === name),
      beta!.gateway.availableSnapshot(undefined, undefined, candidate => candidate === name),
    ]);
    void filtered.then(discovered, discovered);
    await vi.waitFor(() => expect(discovered).toHaveBeenCalledOnce());
    const [snapshot, available] = await filtered;
    expect(snapshot.tools.map(tool => tool.contractId)).toEqual([secondId]);
    expect(available).toEqual({ snapshot, complete: true });
    alpha!.retire();
    const retired = vi.fn();
    const close = alpha!.gateway.close().then(retired);
    await vi.waitFor(() => expect(retired).toHaveBeenCalledOnce());
    await close;
    release();
    await expect(call).resolves.toEqual({ content: 'answer' });
    await expect(alpha!.gateway.invokeTool(name, 'inspect', {}, undefined, { contractId: firstId })).rejects.toThrow();
    await expect(beta!.gateway.invokeTool(name, 'inspect', {}, undefined, { contractId: secondId })).resolves.toEqual({ content: 'answer' });
    expect(requests.mock.calls.filter(([input]) => input.method === 'tools/call')).toHaveLength(3);
    expect(connect).toHaveBeenCalledTimes(3);

    const dispatched = hold();
    const result = beta!.gateway.invokeTool(name, 'inspect', {}, undefined, { contractId: secondId }).catch(error => error);
    await Promise.race([dispatched, result]);
    sharedConfigs[name] = ordinaryConfig;
    release();
    expect(await result).toMatchObject({ failureClass: 'unknown', message: expect.stringContaining('result is unconfirmed') });
    expect(requests.mock.calls.filter(([input]) => input.method === 'tools/call')).toHaveLength(4);
  } finally {
    release?.();
    for (const { retire } of scopes) retire();
    await Promise.allSettled(scopes.map(({ gateway }) => gateway.close()));
    await shared.close();
    trust.mockRestore(); connect.mockRestore(); capabilities.mockRestore(); requests.mockRestore();
  }
});

it.each(['cancel', 'dispose', 'session admission', 'shared admission'] as const)(
  'keeps peer content and tool contracts current after %s when shared authority allows', async event => {
    const root = process.cwd();
    const name = 'shared-content';
    const blockedUri = 'fixture://content/one';
    const peerUri = 'fixture://content/two';
    let sessionRefused = false;
    let sharedRefused = false;
    const shared = new CoreMcpGateway(root, () => () => sharedRefused ? 'Shared admission revoked.' : undefined,
      undefined, undefined, undefined, () => ({ [name]: { transport: 'http', scope: 'user', url: 'http://127.0.0.1:8099/mcp' } }));
    const first = new McpSessionGateway(shared, () => root, () => () => sessionRefused ? 'Session admission revoked.' : undefined, sessionMcpDefinitions(() => 'first'));
    const second = new McpSessionGateway(shared, () => root, () => () => undefined, sessionMcpDefinitions(() => 'second'));
    const connect = vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
    const capabilities = vi.spyOn(Client.prototype, 'getServerCapabilities').mockReturnValue({ tools: {}, resources: {} });
    const requests = vi.spyOn(Client.prototype, 'request').mockImplementation(async input => input.method === 'tools/list'
      ? { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] }
      : { content: [{ type: 'text', text: 'answer' }] });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const reads = vi.spyOn(Client.prototype, 'readResource').mockImplementation(async ({ uri }, options) => {
      const signal = options?.signal;
      if (uri === blockedUri && signal) {
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          void held.then(resolve);
        });
      }
      return { contents: [{ uri, text: 'ready' }] };
    });
    try {
      const baseline = (await shared.snapshot()).tools[0]?.contractId;
      expect(baseline).toBeTruthy();
      const pending = first.content(name, { action: 'read', uri: blockedUri }).catch(error => error);
      await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce());
      const peer = second.content(name, { action: 'read', uri: peerUri }).catch(error => error);
      if (event === 'cancel') first.cancelContent();
      else if (event === 'dispose') await first.close();
      else {
        sessionRefused = event === 'session admission';
        sharedRefused = event === 'shared admission';
        release();
      }
      expect(await pending).toBeInstanceOf(Error);
      if (sharedRefused) {
        expect(await peer).toBeInstanceOf(Error);
        expect(shared.notifications(name)[0]?.state).toBe('not-connected');
      } else {
        expect(await peer).toMatchObject({ result: { kind: 'read', value: { contents: [{ uri: peerUri, text: 'ready' }] } } });
        expect(shared.notifications(name)[0]?.state).toBe('live');
        await expect(shared.invokeTool(name, 'inspect', {}, undefined, { contractId: baseline })).resolves.toEqual({ content: 'answer' });
      }
      expect(connect).toHaveBeenCalledOnce();
    } finally {
      release();
      await Promise.allSettled([first.close(), second.close(), shared.close()]);
      connect.mockRestore(); capabilities.mockRestore(); requests.mockRestore(); reads.mockRestore();
    }
  },
);

it.each(['json', 'stream'] as const)('keeps the HTTP session usable when scoped content admission changes during a %s response', async format => {
  const root = process.cwd();
  const name = 'shared-loopback';
  let refused = false;
  let pendingResponse: { response: ServerResponse; reply: string } | undefined;
  let initializations = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let text = '';
    for await (const chunk of request) text += String(chunk);
    const message = JSON.parse(text) as { id?: number; method: string; params?: { uri: string } };
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result: unknown;
    switch (message.method) {
      case 'initialize':
        initializations++;
        result = { protocolVersion: '2025-03-26', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'fixture', version: '1' } };
        break;
      case 'tools/list': result = { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] }; break;
      case 'tools/call': result = { content: [{ type: 'text', text: 'ready' }] }; break;
      case 'resources/read': result = { contents: [{ uri: message.params?.uri, text: 'ready' }] }; break;
      default: response.writeHead(404).end(); return;
    }
    const reply = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
    if (message.params?.uri === 'fixture://held') {
      if (format === 'stream') response.writeHead(200, { 'content-type': 'text/event-stream' }).write(': waiting\n\n');
      pendingResponse = { response, reply };
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(reply);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  const shared = new CoreMcpGateway(root, undefined, undefined, 3_000, undefined, () => ({
    [name]: { transport: 'http', scope: 'user', url: `http://127.0.0.1:${port}/mcp` },
  }));
  const first = new McpSessionGateway(shared, () => root, () => () => refused ? 'Scoped request expired.' : undefined,
    sessionMcpDefinitions(() => 'http-first'));
  const peer = new McpSessionGateway(shared, () => root, () => () => undefined, sessionMcpDefinitions(() => 'http-peer'));
  try {
    const contractId = (await shared.snapshot()).tools[0]?.contractId;
    expect(contractId).toBeTruthy();
    const pending = first.content(name, { action: 'read', uri: 'fixture://held' }).catch(error => error);
    await vi.waitFor(() => expect(pendingResponse).toBeDefined());
    const next = peer.content(name, { action: 'read', uri: 'fixture://peer' }).catch(error => error);
    refused = true;
    const { response, reply } = pendingResponse!;
    if (format === 'stream') response.end(`data: ${reply}\n\n`);
    else response.writeHead(200, { 'content-type': 'application/json' }).end(reply);
    const refusedResult = vi.fn();
    void pending.then(refusedResult);
    await vi.waitFor(() => expect(refusedResult).toHaveBeenCalledWith(expect.any(Error)));
    expect(await next).toMatchObject({ result: { kind: 'read' } });
    await expect(shared.invokeTool(name, 'inspect', {}, undefined, { contractId })).resolves.toEqual({ content: 'ready' });
    expect(initializations).toBe(1);
  } finally {
    server.closeAllConnections();
    await Promise.allSettled([first.close(), peer.close(), shared.close(), new Promise<void>(resolve => server.close(() => resolve()))]);
  }
});
