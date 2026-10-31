import { afterEach, expect, it, vi } from 'vitest';
import { loadToolCatalog } from './catalog.js';
import type { McpToolDescriptor } from '../mcp/types.js';
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
