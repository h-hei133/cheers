import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { preparePromptRequest } from './request.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { ToolDefinition } from '../../tools/types.js';
import { requestIdentity } from '../../context/request/identity.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/request-prompt-');
  fs.mkdirSync(path.join(root, '.git'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const tool = (name: string): ToolDefinition => ({ name, description: name, argsSchema: { type: 'object' }, execute: async () => ({ success: true }) });
const catalogContent = { skills: new Map(), tools: [] };

it('counts the first discovery subset and observes later schemas without rebuilding system text', async () => {
  const prepared = await preparePromptRequest({ workspaceRoot: root, catalogContent,
    featureTools: [tool('feature')], runtimeConfig: { toolDiscovery: 'dynamic', disabledTools: [], hiddenToolPrefixes: [] } as unknown as RuntimeConfig },
  () => new Map([['read', tool('read')], ['deferred', tool('deferred')]]));
  const before = requestIdentity(prepared.currentOverhead());
  expect(prepared.currentTools().has('feature')).toBe(true);
  expect(prepared.currentTools().has('deferred')).toBe(false);
  prepared.discovery!.load(['deferred']);
  const after = requestIdentity(prepared.currentOverhead());
  expect(after.schemaDigest).not.toBe(before.schemaDigest);
  expect(after.systemDigest).toBe(before.systemDigest);
});

it('uses allowed and forced selections before building prompt names and refuses a vanished force', async () => {
  const input = { workspaceRoot: root, catalogContent, forcedTool: 'deferred', allowedTools: ['deferred'] };
  const prepared = await preparePromptRequest(input, () => new Map([['read', tool('read')], ['deferred', tool('deferred')]]));
  expect([...prepared.currentTools().keys()]).toEqual(['deferred']);
  expect(prepared.promptContext.toolNames).toEqual(['deferred']);
  expect(prepared.discovery).toBeUndefined();
  await expect(preparePromptRequest(input, () => new Map())).rejects.toThrow('no longer available');
});

it('reports higher-priority, missing and recursively imported instruction dependencies', async () => {
  const agents = path.join(root, 'AGENTS.md'); const nested = path.join(root, 'nested.md'); const missing = path.join(root, 'missing.md');
  fs.writeFileSync(agents, 'root\n@./nested.md'); fs.writeFileSync(nested, 'nested\n@./missing.md');
  const sources = new Set<string>();
  const prepared = await preparePromptRequest({ workspaceRoot: root, catalogContent, onSource: target => sources.add(target) }, () => new Map());
  expect(prepared.promptContext.instructions).toContain('nested');
  expect(sources.has(agents)).toBe(true); expect(sources.has(nested)).toBe(true); expect(sources.has(missing)).toBe(true);
  expect(sources.has(path.join(root, 'AGENTS.override.md'))).toBe(true);
  expect(sources.has(path.join(root, '.git'))).toBe(true);
});

it('does not publish request inputs after cancelled catalog acquisition', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(preparePromptRequest({ workspaceRoot: root, catalogContent, signal: controller.signal }, () => new Map())).rejects.toThrow();
});
