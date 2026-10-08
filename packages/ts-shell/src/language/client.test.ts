import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createDefaultExecutionService } from '../runtime/execution/service.js';
import { createLspToolDefinition } from '../core/tools/lsp.js';
import { LanguageClient } from './client.js';

const fixture = fileURLToPath(new URL('./fixtures/server.mjs', import.meta.url));
const roots: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const stop of cleanup.splice(0)) await stop(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function setup(mode = 'normal', outside?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'language-client-')); roots.push(root);
  fs.writeFileSync(path.join(root, 'one.ts'), 'export const alpha = 1;\n');
  const log = path.join(root, 'frames.jsonl');
  const server = { command: fs.realpathSync(process.execPath), args: [fixture, mode, log, ...(outside ? [outside] : [])] };
  const context = { workspaceRoot: root, taskId: 'language', sessionId: 'language-session' };
  const tool = createLspToolDefinition(createDefaultExecutionService());
  const execute = (args: Record<string, unknown>) => tool.execute({ backend: 'server', server, filePath: 'one.ts', line: 0, character: 14, ...args }, context);
  cleanup.push(() => execute({ operation: 'shutdown' }));
  return { root, log, server, context, execute };
}

it('initializes before initialized, synchronizes versioned incremental changes, and refuses server applyEdit', async () => {
  const test = setup();
  expect((await test.execute({ operation: 'hover' })).output).toContain('alpha');
  fs.writeFileSync(path.join(test.root, 'one.ts'), 'export const bravo = "🌍";\n');
  const changed = await test.execute({ operation: 'hover' });
  expect(changed.success).toBe(true); expect(changed.metadata?.documentVersion).toBe(2); expect(changed.output).toContain('bravo');
  await test.execute({ operation: 'shutdown' });
  const messages = fs.readFileSync(test.log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const initialize = messages.find(value => value.method === 'initialize');
  expect(initialize.params.capabilities.workspace.applyEdit).toBe(false);
  expect(initialize.params.initializationOptions.disableAutomaticTypingAcquisition).toBe(true);
  expect(messages.findIndex(value => value.method === 'initialize')).toBeLessThan(messages.findIndex(value => value.method === 'initialized'));
  const change = messages.find(value => value.method === 'textDocument/didChange');
  expect(change.params.contentChanges[0].range).toEqual({ start: { line: 0, character: 0 }, end: { line: 1, character: 0 } });
  expect(messages.find(value => value.id === 900 && value.result)?.result.applied).toBe(false);
  expect(fs.readFileSync(path.join(test.root, 'one.ts'), 'utf8')).not.toContain('BAD_WRITE');
  expect(messages.some(value => value.method === 'shutdown')).toBe(true);
  expect(messages.some(value => value.method === 'exit')).toBe(true);
});

it('respects full synchronization instead of sending incremental ranges', async () => {
  const test = setup('full'); await test.execute({ operation: 'hover' });
  fs.writeFileSync(path.join(test.root, 'one.ts'), 'export const alpha = 2;\n');
  await test.execute({ operation: 'hover' });
  const messages = fs.readFileSync(test.log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(messages.find(value => value.method === 'textDocument/didChange').params.contentChanges[0]).not.toHaveProperty('range');
});

it.each([['normal', 'version-verified'], ['unversioned', 'unversioned-currency-unverified'], ['stale-diagnostics', 'unavailable']])('reports %s diagnostics without upgrading their currency', async (mode, currency) => {
  const test = setup(mode); const result = await test.execute({ operation: 'diagnostics' });
  expect(result.success).toBe(true); expect(result.metadata?.currency).toBe(currency); expect(result.metadata?.rejectedStale).toBe(1);
  expect(result.output).not.toContain('STALE DIAGNOSTIC');
  if (mode === 'stale-diagnostics') expect(result.metadata?.diagnostics).toBe(null);
  else expect(result.output).toContain('héllo diagnostic');
});

it.each(['definition', 'references', 'documentSymbol', 'workspaceSymbol'])('returns actual server %s data', async operation => {
  const result = await setup().execute({ operation, symbol: 'alpha' });
  expect(result.success).toBe(true); expect(result.metadata?.backend).toBe('server'); expect(result.output).toMatch(/alpha|one.ts/);
});

it.each(['unsupported', 'no-sync', 'closed-sync', 'utf8'])('reports %s server capability limits explicitly', async mode => {
  const result = await setup(mode).execute({ operation: 'hover' });
  expect(result.success).toBe(false); expect(result.metadata?.status).toBe('unsupported');
});

it.each(['error', 'malformed', 'stderr'])('keeps %s server errors safe and rejects the request', async mode => {
  const result = await setup(mode).execute({ operation: 'hover' });
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

it('retains crash state until an explicit restart and initializes the replacement process', async () => {
  const test = setup('crash');
  expect((await test.execute({ operation: 'hover' })).success).toBe(false);
  expect((await test.execute({ operation: 'status' })).metadata?.status).toBe('crashed');
  expect((await test.execute({ operation: 'hover' })).success).toBe(false);
  expect((await test.execute({ operation: 'restart' })).metadata?.status).toBe('ready');
  expect((await test.execute({ operation: 'hover' })).success).toBe(true);
});

it('sends cancellation for in-flight requests and preserves a usable client', async () => {
  const test = setup(); const client = new LanguageClient(createDefaultExecutionService(), test.server, test.context); cleanup.push(() => client.stop());
  await client.initialize();
  const controller = new AbortController(); const request = client.request('test/stall', {}, controller.signal);
  controller.abort(); await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
  await expect(client.request('test/stall', {}, undefined, 10)).rejects.toMatchObject({ kind: 'timeout' });
  expect(client.status).toBe('ready');
  await client.stop(); expect(fs.readFileSync(test.log, 'utf8')).toContain('$/cancelRequest');
});

it('reports no selected server explicitly and never substitutes scanner results', async () => {
  const test = setup(); const tool = createLspToolDefinition(createDefaultExecutionService());
  const unavailable = await tool.execute({ operation: 'documentSymbol', filePath: 'one.ts' }, test.context);
  expect(unavailable).toMatchObject({ success: false, metadata: { backend: 'server', status: 'unavailable' } });
  expect(unavailable.output).toBeUndefined();
  fs.writeFileSync(path.join(test.root, 'one.ts'), 'export function scannerOnly() {}\n');
  expect((await tool.execute({ backend: 'scanner', operation: 'documentSymbol', filePath: 'one.ts' }, test.context)).output).toContain('scannerOnly');
});

it('serializes concurrent restarts so a replacement stays tracked and can be shut down', async () => {
  const test = setup(); await test.execute({ operation: 'hover' });
  const results = await Promise.all([test.execute({ operation: 'restart' }), test.execute({ operation: 'restart' })]);
  expect(results.filter(result => result.success)).toHaveLength(1);
  expect(results.find(result => !result.success)?.metadata?.status).toBe('unavailable');
  expect((await test.execute({ operation: 'status' })).metadata?.status).toBe('ready');
  expect((await test.execute({ operation: 'hover' })).success).toBe(true);
  expect((await test.execute({ operation: 'shutdown' })).metadata?.status).toBe('stopped');
  const starts = fs.readFileSync(test.log, 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(value => value.started);
  expect(starts).toHaveLength(2);
});

it('filters provider secrets and loader variables from the supplied command environment', async () => {
  const test = setup();
  const client = new LanguageClient(createDefaultExecutionService(), test.server, { ...test.context, commandEnv: {
    PATH: '/usr/bin:/bin', HOME: test.root, TMPDIR: test.root, LANG: 'C.UTF-8',
    OPENAI_API_KEY: 'synthetic-key', NODE_OPTIONS: '--invalid-synthetic-option', LD_PRELOAD: '/synthetic/loader',
  } });
  cleanup.push(() => client.stop()); await client.initialize(); await client.stop();
  const start = JSON.parse(fs.readFileSync(test.log, 'utf8').split('\n')[0]!);
  expect(start.environmentKeys).not.toEqual(expect.arrayContaining(['OPENAI_API_KEY', 'NODE_OPTIONS', 'LD_PRELOAD']));
  for (const key of ['OPENAI_API_KEY', 'NODE_OPTIONS', 'LD_PRELOAD']) expect(start.environmentKeys).not.toContain(key);
  expect(start.runtimeHome).toBe(test.root); expect(start.runtimeTmp).toBe(test.root);
});
