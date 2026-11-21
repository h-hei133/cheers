import { afterEach, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CoreMcpGateway } from '../mcp/gateway.js';
import { projectTrust } from '../security/projectTrust.js';
import { authorizationForMcp } from '../../cli/mcp/auth/service.js';
import { runExtensionFactory } from '../../extensions/runtime/inProcessLoader.js';
import { registerCatalogContribution } from './contributions.js';
import { sessionMcpDefinitions } from './mcp.js';

afterEach(() => vi.restoreAllMocks());

it('dispatches an extension server through the ordinary gateway and retires the exact generation', async () => {
  const root = process.cwd();
  const sessionId = 'mcp-extension-generation';
  const name = 'extension-example';
  vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(false);
  vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
  vi.spyOn(Client.prototype, 'getServerCapabilities').mockReturnValue({ tools: {} });
  const requests = vi.spyOn(Client.prototype, 'request').mockImplementation(async request => request.method === 'tools/list'
    ? { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] }
    : { content: [{ type: 'text', text: 'answer' }] });
  const gateway = new CoreMcpGateway(root, undefined, authorizationForMcp, undefined, sessionMcpDefinitions(() => sessionId));
  const register = async () => {
    const controller = new AbortController();
    const loaded = await runExtensionFactory({ workspaceRoot: root, signal: controller.signal, factory: api =>
      api.registerMcpServer(name, { url: 'http://127.0.0.1:8000/mcp' }) });
    const unregister = registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [],
      mcpServers: loaded.mcpServers, signal: loaded.signal });
    return { controller, unregister };
  };
  const original = await register();
  try {
    const snapshot = await gateway.snapshot(undefined, undefined, candidate => candidate === name);
    const config = gateway.loadConfigs()[name]!;
    expect(authorizationForMcp(name, config)).toBeUndefined();
    expect(snapshot.tools[0]).toEqual(expect.objectContaining({ qualifiedName: 'mcp__extension-example__inspect' }));
    const contractId = snapshot.tools[0]?.contractId;
    expect(contractId).toBeTruthy();
    await expect(gateway.invokeTool(name, 'inspect', {}, undefined, { contractId })).resolves.toEqual({ content: 'answer' });
    original.controller.abort();
    await expect(gateway.invokeTool(name, 'inspect', {}, undefined, { contractId })).rejects.toThrow();
    const successor = await register();
    try {
      expect(gateway.loadConfigs()[name]?.extensionOwner).not.toBe(config.extensionOwner);
      await expect(gateway.invokeTool(name, 'inspect', {}, undefined, { contractId })).rejects.toThrow();
      expect(requests.mock.calls.filter(([request]) => request.method === 'tools/call')).toHaveLength(1);
    } finally { successor.unregister(); }
  } finally { original.unregister(); await gateway.close(); }
});
