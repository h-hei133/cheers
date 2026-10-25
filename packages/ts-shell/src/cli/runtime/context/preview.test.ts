import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { previewContext } from './preview.js';
import { projectSessionFileLayout } from '../../../session/store/sessionFileLayout.js';
import { writeSessionRecord } from '../../../session/store/sessionStore.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { ConfigState } from '../../../config/state.js';
import { configurationBinding } from '../../../core/shell/configuration.js';
import { buildPromptWithFutureTurnInjections } from '../../../core/shell/sessionFutureTurnProjection.js';
import type { CliMcpGateway } from '../../../entrypoints/cliMcpModule.js';
import { readContextEntry } from '../../../context/attachment/entry.js';
import { installCommandGate } from '../../data/access.js';
import { appendTranscriptEvent } from '../../../session/transcript/sessionTranscript.js';
import { createMessageTranscriptEvent } from '../../../session/sessionEventCodec.js';
import { requestIdentity } from '../../../context/request/identity.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/runtime-preview-');
  const home = path.join(root, 'home'); fs.mkdirSync(home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const fixture = () => {
  const cwd = path.join(root, 'workspace'); fs.mkdirSync(cwd); fs.mkdirSync(path.join(cwd, '.git'));
  const session: Session = { id: 'sess_preview', projectRoot: cwd, status: 'active', rootMode: 'direct', turns: [],
    createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
  const layout = projectSessionFileLayout({ sessionsDir: path.join(root, 'sessions'), sessionId: session.id }); writeSessionRecord({ session, layout });
  const manager = { getSessionDirPath: () => layout.sessionDir } as unknown as SessionManager;
  const config = { ...getRuntimeConfig(cwd), enableMcpTools: false, toolDiscovery: 'dynamic' as const };
  const target = { provider: 'openai', model: 'fixture', baseUrl: 'https://fixture.invalid/v1', expectedEnvVarName: 'FIXTURE', thinkingEffort: null };
  const context = { cwd, projectRoot: cwd, session, skillOptions: { noSkills: true }, runtimeConfig: config,
    resolveConfigTarget: () => target } as unknown as ShellRuntimeContext;
  Object.assign(context, { configuration: new ConfigState(config, configurationBinding(context), [{ id: 'openai', name: 'Fixture', baseUrl: target.baseUrl,
    models: [{ id: 'fixture', name: 'Fixture', vision: false }] }]) });
  context.preparePromptContext = async (prompt, signal) => {
    const prepared = await buildPromptWithFutureTurnInjections({ deps: {}, sessionId: session.id, prompt });
    return { prompt: prepared.prompt, isCurrent: () => !signal.aborted && prepared.isCurrent() };
  };
  installCommandGate(context, () => ({ permissionScope: 'ask' }));
  const gateway: CliMcpGateway = { snapshot: vi.fn(() => { throw new Error('No connection permitted'); }), refresh: vi.fn() };
  const load = (draft = '', attachments?: Parameters<typeof previewContext>[4]) => previewContext(context, manager, gateway, draft, attachments, 'build', 'ask', new AbortController().signal);
  return { cwd, context, session, layout, target, gateway, load };
};

it('estimates an empty startup through the actual tool projection without provider, MCP or persistence', async () => {
  const { load, layout, gateway } = fixture(); const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = files.map(target => fs.readFileSync(target)); const result = await load(); result.verify();
  expect(result.estimate.source).toBe('estimated'); expect(result.estimate.tokens).toBeGreaterThan(100);
  expect(result.estimate.identity.endpointId).toMatch(/^[a-f0-9]{64}$/);
  expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
  expect(files.map(target => fs.readFileSync(target))).toEqual(before); expect(fs.existsSync(layout.stateLockPath)).toBe(false);
});

it('includes all explicit skills and invalidates their manifests and target changes', async () => {
  const { cwd, context, load, target } = fixture();
  const files = ['one', 'two'].map(name => { const file = path.join(cwd, `${name}.md`); fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${name}\n---\n${name.repeat(1000)}`); return file; });
  context.skillOptions = { noSkills: true, skillPaths: files };
  const plain = await load('question'); const expanded = await load('question /skill:one /skill:two');
  expect(expanded.estimate.tokens).toBeGreaterThan(plain.estimate.tokens + 1500);
  expanded.verify(); fs.writeFileSync(files[1]!, 'changed'); expect(() => expanded.verify()).toThrow();
  const beforeTarget = await load('question'); target.baseUrl = 'https://other.invalid/v1'; expect(() => beforeTarget.verify()).toThrow('target changed');
  await expect(load('question /skill:missing')).rejects.toThrow('unavailable');
});

it('counts non-command paths and vision fallback, but does not start workflow commands', async () => {
  const { load } = fixture(); const text = await load('Inspect /home');
  const image = await load('Inspect /home', { images: [{ type: 'image', mimeType: 'image/png', data: 'AA==', description: 'diagram' }] });
  expect(image.estimate.tokens).toBeLessThan(text.estimate.tokens + 100);
  await expect(load('question /deep-research')).rejects.toThrow('preparation');
  await expect(load('/model')).rejects.toThrow('preparation');
});

it('uses the closing request schema identity when no tool steps are allowed', async () => {
  const { context, load } = fixture();
  const config = { ...context.configuration.current.config, maxTurns: 0 };
  Object.assign(context, { configuration: new ConfigState(config, configurationBinding(context), context.configuration.current.catalog) });
  const result = await load('question'); result.verify();
  expect(result.estimate.identity.schemaDigest).toBe(requestIdentity({ tools: [] }).schemaDigest);
});

it('refuses unavailable MCP without connection and invalidates revoked attachment access', async () => {
  const { cwd, context, gateway, load } = fixture();
  const file = path.join(cwd, 'context.txt'); fs.writeFileSync(file, 'attached facts');
  context.contextAttachments = [readContextEntry({ root: cwd, target: file })];
  const result = await load('question'); result.verify();
  installCommandGate(context, () => ({ permissionScope: 'ask', admission: () => 'revoked' }));
  expect(() => result.verify()).toThrow('stale');
  const config = { ...context.configuration.current.config, enableMcpTools: true };
  Object.assign(context, { configuration: new ConfigState(config, configurationBinding(context), context.configuration.current.catalog) });
  await expect(load()).rejects.toThrow('MCP catalogue'); expect(gateway.snapshot).not.toHaveBeenCalled();
});

it('invalidates imported instruction changes and creation of a higher priority source', async () => {
  const { cwd, load } = fixture(); const imported = path.join(cwd, 'nested.md');
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), '@./nested.md'); fs.writeFileSync(imported, 'first rules');
  const before = await load('question'); before.verify();
  fs.writeFileSync(imported, 'other rules'); fs.utimesSync(imported, new Date(0), new Date(1000));
  expect(() => before.verify()).toThrow('changed');
  const next = await load('question'); fs.writeFileSync(path.join(cwd, 'AGENTS.override.md'), 'override');
  expect(() => next.verify()).toThrow('changed');
});

it('does not turn opaque saved reasoning or malformed workflow state into an estimate', async () => {
  const { layout, load, session } = fixture();
  const message = { role: 'assistant' as const, content: 'answer',
    reasoning: { text: 'thought', signature: 'opaque' }, timestamp: '2026-10-26T00:00:00.000Z' };
  session.turns.push(message);
  appendTranscriptEvent(layout.transcriptPath, createMessageTranscriptEvent(message));
  await expect(load('question')).rejects.toThrow('Opaque');
  const state = JSON.parse(fs.readFileSync(layout.statePath, 'utf8')); state.handoffs = { version: 1, cycles: 'damaged' };
  fs.writeFileSync(layout.statePath, JSON.stringify(state)); await expect(load('question')).rejects.toThrow();
});
