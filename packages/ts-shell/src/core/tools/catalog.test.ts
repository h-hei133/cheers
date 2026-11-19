import { afterEach, expect, it, vi } from 'vitest';
import { loadToolCatalog } from './catalog.js';
import type { McpToolDescriptor } from '../mcp/types.js';
import { mcpCatalogFilter, type ToolMcpGateway } from './mcp.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { registerCatalogContribution } from '../catalog/contributions.js';
import { assertScopeToolAllowed } from '../../config/scope/tools.js';
import { StructuredLogger } from '../../observability/structuredLogger.js';

afterEach(() => vi.restoreAllMocks());

const definition = (name: string) => ({ name, description: name, argsSchema: { type: 'object' },
  execute: async () => ({ success: true }) });
const restrictions: Array<{ label: string; settings: Partial<RuntimeConfig>; expected: string[] }> = [
  { label: 'empty allowlist', settings: { allowedTools: [] }, expected: [] },
  { label: 'explicit deferred tool', settings: { allowedTools: ['deferred'] }, expected: ['deferred'] },
  { label: 'only one allowed discovery entry', settings: { allowedTools: ['read', 'deferred', 'tool_search'] }, expected: ['read', 'deferred'] },
  { label: 'disabled search', settings: { disabledTools: ['tool_search'] }, expected: ['read', 'deferred'] },
  { label: 'disabled load', settings: { disabledTools: ['tool_load'] }, expected: ['read', 'deferred'] },
  { label: 'hidden discovery prefix', settings: { hiddenToolPrefixes: ['tool_'] }, expected: ['read', 'deferred'] },
];

it.each(restrictions)('keeps generated discovery tools within the $label', async ({ settings, expected }) => {
  vi.spyOn(StructuredLogger.prototype, 'warn').mockImplementation(() => {});
  const config = { toolDiscovery: 'dynamic', disabledTools: [], hiddenToolPrefixes: [], ...settings } as RuntimeConfig;
  const catalog = await loadToolCatalog({ workspaceRoot: process.cwd(), discover: true, runtimeConfig: config,
    catalogContent: { skills: new Map(), tools: [] } },
  () => new Map(['read', 'deferred'].map(name => [name, definition(name)])));
  expect([...catalog.tools.keys()]).toEqual(expected);
  expect(catalog.discovery).toBeUndefined();
  for (const name of catalog.tools.keys()) expect(() => assertScopeToolAllowed(config, name)).not.toThrow();
  if (catalog.tools.has('deferred')) expect(await catalog.tools.get('deferred')!.execute({}, {} as never)).toEqual({ success: true });
});

it.each([
  { label: 'unrestricted', allowedTools: undefined },
  { label: 'explicit metadata', allowedTools: ['read', 'deferred', 'tool_search', 'tool_load'] },
])('retains admitted dynamic discovery with $label', async ({ allowedTools }) => {
  const warn = vi.spyOn(StructuredLogger.prototype, 'warn').mockImplementation(() => {});
  const config = { toolDiscovery: 'dynamic', disabledTools: [], hiddenToolPrefixes: [],
    ...(allowedTools ? { allowedTools } : {}) } as RuntimeConfig;
  const catalog = await loadToolCatalog({ workspaceRoot: process.cwd(), discover: true, runtimeConfig: config,
    catalogContent: { skills: new Map(), tools: [] } },
  () => new Map(['read', 'deferred'].map(name => [name, definition(name)])));
  expect([...catalog.tools.keys()]).toEqual(['read', 'tool_search', 'tool_load']);
  catalog.discovery!.load(['deferred']);
  expect([...catalog.discovery!.snapshot().keys()]).toEqual(['read', 'deferred', 'tool_search', 'tool_load']);
  for (const name of catalog.discovery!.snapshot().keys()) expect(() => assertScopeToolAllowed(config, name)).not.toThrow();
  expect(warn).not.toHaveBeenCalled();
});

it('keeps an empty dynamic catalogue empty without adding discovery overhead', async () => {
  const catalog = await loadToolCatalog({ workspaceRoot: process.cwd(), discover: true,
    catalogContent: { skills: new Map(), tools: [] } }, () => new Map());
  expect(catalog.tools.size).toBe(0); expect(catalog.discovery).toBeUndefined();
});

it('fills only reached MCP descriptors through the dynamic discovery tools', async () => {
  const descriptor = (serverName: string, toolName: string): McpToolDescriptor => ({
    serverName, toolName, qualifiedName: `mcp__${serverName}__${toolName}`, description: 'Find fixture records.', inputSchema: { type: 'object' },
  });
  const records = descriptor('docs', 'find_records');
  const blocked = descriptor('docs', 'disabled');
  const tickets = descriptor('issues', 'find_tickets');
  const hidden = descriptor('hidden', 'find_secrets');
  const snapshot = vi.fn<ToolMcpGateway['snapshot']>(async (_admission, _signal, filter) => ({ clients: [],
    tools: [records, blocked, tickets, hidden].filter(tool => !filter || filter(tool.serverName)),
  }));
  const workspaceRoot = process.cwd();
  const runtimeConfig = { enableMcpTools: true, disabledTools: [blocked.qualifiedName], hiddenToolPrefixes: ['mcp__hidden__'] } as RuntimeConfig;
  const catalog = await loadToolCatalog({ workspaceRoot, discover: true, runtimeConfig, sdkSkills: new Map(), mcpGateway: { snapshot } });
  const context = { workspaceRoot, taskId: 'dynamic' };
  const load = catalog.tools.get('tool_load')!;
  const search = catalog.tools.get('tool_search')!;
  expect(snapshot).not.toHaveBeenCalled();
  expect(catalog.tools.has(records.qualifiedName)).toBe(false);
  await load.execute({ names: ['read', blocked.qualifiedName] }, context);
  expect(snapshot).not.toHaveBeenCalled();

  const loaded = await load.execute({ names: [records.qualifiedName] }, context);
  expect(JSON.parse(loaded.output!)).toMatchObject({ loaded: [records.qualifiedName], rejected: [] });
  const namedFilter = snapshot.mock.calls[0]![2]!;
  expect(['docs', 'issues', 'hidden'].filter(namedFilter)).toEqual(['docs']);
  expect(catalog.discovery!.snapshot().has(records.qualifiedName)).toBe(true);
  expect(catalog.discovery!.catalog.has(tickets.qualifiedName)).toBe(false);

  await search.execute({ query: 'fixture records' }, context);
  expect(snapshot).toHaveBeenCalledTimes(2);
  const searchFilter = snapshot.mock.calls[1]![2]!;
  expect(['docs', 'issues', 'hidden'].filter(searchFilter)).toEqual(['docs', 'issues']);
  expect(catalog.discovery!.catalog.has(tickets.qualifiedName)).toBe(true);
  expect(catalog.discovery!.snapshot().has(tickets.qualifiedName)).toBe(false);
  expect(catalog.discovery!.catalog.has(blocked.qualifiedName)).toBe(false);
  expect(catalog.discovery!.catalog.has(hidden.qualifiedName)).toBe(false);
});

it('admits late MCP tools for an activated script and discards results after run revocation', async () => {
  const tool: McpToolDescriptor = { serverName: 'docs', toolName: 'read_item', qualifiedName: 'mcp__docs__read_item',
    description: 'Read an item.', inputSchema: { type: 'object' } };
  const workspaceRoot = process.cwd();
  const runtimeConfig = { enableMcpTools: true, disabledTools: [], hiddenToolPrefixes: [] } as unknown as RuntimeConfig;
  const snapshot = vi.fn<ToolMcpGateway['snapshot']>(async () => ({ clients: [], tools: [tool] }));
  const input = { workspaceRoot, discover: true, runtimeConfig, sdkSkills: new Map(), mcpGateway: { snapshot } };
  const catalog = await loadToolCatalog(input);
  const context = { workspaceRoot, taskId: 'script' };
  await catalog.tools.get('tool_load')!.execute({ names: ['codemode'] }, context);
  const script = catalog.discovery!.snapshot().get('codemode')!;
  expect(script.nestedToolCatalog?.().has(tool.qualifiedName)).toBe(true);

  let revoked = false;
  snapshot.mockImplementationOnce(async () => { revoked = true; return { clients: [], tools: [tool] }; });
  const retired = await loadToolCatalog({ ...input, admission: () => revoked ? 'Run admission was revoked.' : undefined });
  await expect(retired.tools.get('tool_search')!.execute({ query: 'read item' }, context)).rejects.toThrow('Run admission was revoked.');
  expect(retired.discovery!.catalog.has(tool.qualifiedName)).toBe(false);
});

it('retains ambiguous qualified-name prefixes until the real servers list tools', () => {
  const config = { enableMcpTools: true, disabledTools: [], hiddenToolPrefixes: [], allowedTools: ['mcp__notes___item'] } as unknown as RuntimeConfig;
  const filter = mcpCatalogFilter(config);
  expect(typeof filter).toBe('function');
  if (!filter) throw new Error('Expected selected MCP servers');
  expect(['notes', 'notes_', 'notes-room'].filter(filter)).toEqual(['notes', 'notes_']);
});

it('limits a fixed child catalogue to the captured descriptor owners', () => {
  const config = { enableMcpTools: true, disabledTools: [], hiddenToolPrefixes: [] } as unknown as RuntimeConfig;
  const descriptor: McpToolDescriptor = { serverName: 'notes_', toolName: 'item', qualifiedName: 'mcp__notes___item', description: '', inputSchema: {} };
  const filter = mcpCatalogFilter(config, 'codemode', [descriptor]);
  expect(['notes', 'notes_'].filter(filter || (() => false))).toEqual(['notes_']);
  expect(mcpCatalogFilter(config, 'codemode', [])).toBe(false);
  expect(mcpCatalogFilter(config, 'codemode')).toBeUndefined();
});

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
