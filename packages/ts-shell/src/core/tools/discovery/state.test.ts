import { expect, it } from 'vitest';
import type { ToolDefinition } from '../../../tools/types.js';
import { createToolDiscovery, DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL, PINNED_TOOL_NAMES } from './state.js';
import { discoveryTools } from './tools.js';

function tool(name: string, description = `${name} tool`): ToolDefinition {
  return { name, description, argsSchema: { type: 'object', properties: {} }, execute: async () => ({ success: true, output: 'ok' }) };
}

function catalog(): Map<string, ToolDefinition> {
  return new Map(['read', 'bash', 'write', 'browser', 'web_search', 'lsp', 'mcp__server__search'].map(name => [name, tool(name)]));
}

function discovery() {
  const value = createToolDiscovery({ catalog: catalog() });
  value.attachMeta(discoveryTools(value));
  return value;
}

it('starts from pinned tools plus the discovery entry points', () => {
  const value = discovery();
  expect([...value.snapshot().keys()]).toEqual([...PINNED_TOOL_NAMES.filter(name => catalog().has(name)), DISCOVERY_SEARCH_TOOL, DISCOVERY_LOAD_TOOL]);
  expect(value.snapshot().has('browser')).toBe(false);
});

it('searches names and descriptions without returning schemas', () => {
  const value = discovery();
  expect(value.search('brow')).toEqual([{ name: 'browser', summary: 'browser tool', loaded: false, pinned: false }]);
  expect(value.search('SEARCH').map(match => match.name)).toContain('mcp__server__search');
  expect(value.search('tool').length).toBeGreaterThan(0);
  expect(value.search('nothing-matches')).toEqual([]);
  expect(value.search('read')).toEqual([{ name: 'read', summary: 'read tool', loaded: false, pinned: true }]);
});

it('loads a tool for the next request and refuses unknown names', () => {
  const value = discovery();
  expect(value.load(['browser', 'missing', DISCOVERY_LOAD_TOOL])).toEqual({ loaded: ['browser'], rejected: ['missing', DISCOVERY_LOAD_TOOL] });
  expect(value.snapshot().has('browser')).toBe(true);
  expect(value.load(['browser'])).toEqual({ loaded: ['browser'], rejected: [] });
});

it('bounds the loaded set and keeps pinned tools out of the budget', () => {
  const many = new Map<string, ToolDefinition>([...catalog(), ...Array.from({ length: 40 }, (_, index) => [`extra_${index}`, tool(`extra_${index}`)] as const)]);
  const value = createToolDiscovery({ catalog: many });
  value.attachMeta(discoveryTools(value));
  expect(value.load(Array.from({ length: 40 }, (_, index) => `extra_${index}`)).loaded).toHaveLength(32);
  expect(value.load(['extra_32']).rejected).toEqual(['extra_32']);
  expect(value.load(['read']).loaded).toEqual(['read']);
});

it('uses a stable generation for the same visible catalogue and a different one for a changed schema', () => {
  expect(createToolDiscovery({ catalog: catalog() }).generation).toBe(createToolDiscovery({ catalog: catalog() }).generation);
  const changed = catalog(); changed.set('read', { ...tool('read'), argsSchema: { type: 'object', properties: { path: { type: 'string' } } } });
  expect(createToolDiscovery({ catalog: changed }).generation).not.toBe(createToolDiscovery({ catalog: catalog() }).generation);
});

it('executes search and load through their declared argument shapes', async () => {
  const value = discovery();
  const [search, load] = discoveryTools(value);
  const found = await search!.execute({ query: 'web' }, {} as never);
  expect(found.success).toBe(true);
  expect(JSON.parse(found.output!)).toMatchObject({ matches: [{ name: 'web_search', loaded: false }] });
  const loaded = await load!.execute({ names: ['web_search'] }, {} as never);
  expect(loaded.success).toBe(true);
  expect(JSON.parse(loaded.output!)).toMatchObject({ loaded: ['web_search'], rejected: [] });
  expect(value.snapshot().has('web_search')).toBe(true);
});
