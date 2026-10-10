import { expect, it } from 'vitest';
import { loadToolCatalog } from './catalog.js';
import type { McpToolDescriptor } from '../mcp/types.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { registerCatalogContribution } from '../catalog/contributions.js';

it('keeps captured child content and MCP permission hints from widening at startup', async () => {
  const descriptor: McpToolDescriptor = { serverName: 'fixture', toolName: 'inspect', qualifiedName: 'mcp_fixture_inspect',
    description: 'Inspect', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } };
  const root = process.cwd();
  const unregister = registerCatalogContribution({ root, sessionId: 'parent', commands: [], skills: () => [],
    tools: [{ name: 'parent_only', description: '', argsSchema: {}, execute: async () => ({ success: true }) }] });
  try {
    const input = { workspaceRoot: root, sessionId: 'child', catalogContent: { skills: new Map(), tools: [], mcpTools: [descriptor] },
      runtimeConfig: { enableMcpTools: true, disabledTools: [], hiddenToolPrefixes: [] } as RuntimeConfig,
      mcpGateway: { snapshot: async () => ({ clients: [], tools: [descriptor, { ...descriptor, toolName: 'new', qualifiedName: 'mcp_fixture_new' }] }) } };
    const captured = await loadToolCatalog(input);
    expect(captured.tools.has('bash')).toBe(true); expect(captured.tools.has('parent_only')).toBe(false);
    expect(captured.tools.has(descriptor.qualifiedName)).toBe(true); expect(captured.tools.has('mcp_fixture_new')).toBe(false);
    const changed = await loadToolCatalog({ ...input, mcpGateway: { snapshot: async () => ({ clients: [], tools: [{ ...descriptor, annotations: { readOnlyHint: true } }] }) } });
    expect(changed.tools.has(descriptor.qualifiedName)).toBe(false);
  } finally { unregister(); }
});
