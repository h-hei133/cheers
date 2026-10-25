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
import { routeSlashCommand } from '../../../core/commands/slashRouter.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/runtime-preview-');
  const home = path.join(root, 'home'); fs.mkdirSync(home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
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
  await expect(load('question /skill:missing')).rejects.toThrow('Unknown skill: missing');
});

it('previews the exact submitted modifier, template and skill prompt without command dispatch or writes', async () => {
  const { cwd, context, load, layout, gateway } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'evidence.md'), '---\ncomposable: true\n---\nCheck counterexamples for $@');
  const file = path.join(cwd, 'method.md'); fs.writeFileSync(file, '---\nname: method\ndescription: method\n---\nCheck sources.');
  context.skillOptions = { noSkills: true, skillPaths: [file] };
  const input = 'Compare approaches /brainstorm /evidence\n/skill:method';
  const submitted = await routeSlashCommand(input, { cwd, skillOptions: context.skillOptions });
  if (submitted?.kind !== 'prompt') throw new Error('Fixture composition was not prepared.');
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = files.map(target => fs.readFileSync(target));
  const preview = await load(input); preview.verify();
  expect(prepare).toHaveBeenCalledWith(submitted.prompt, expect.any(AbortSignal));
  expect(submitted.prompt).toContain('Design exploration');
  expect(submitted.prompt).toContain('Check counterexamples for Compare approaches');
  expect(submitted.prompt).toContain('<skill name="method">');
  const actual = await load(submitted.prompt);
  expect(preview.estimate).toEqual(actual.estimate);
  expect(files.map(target => fs.readFileSync(target))).toEqual(before);
  expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
});

it('invalidates selected template edits, higher-priority overrides and newly discovered command collisions', async () => {
  const { cwd, load } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'evidence.md');
  fs.writeFileSync(file, '---\ncomposable: true\n---\nCheck $@');
  const first = await load('question /evidence'); first.verify();
  fs.writeFileSync(file, '---\ncomposable: true\n---\nOther $@');
  expect(() => first.verify()).toThrow('source changed');
  const second = await load('question /evidence');
  fs.writeFileSync(path.join(directory, 'home.md'), '---\ncomposable: true\n---\nDirectory method $@');
  expect(() => second.verify()).toThrow('source changed');
  const pathText = await load('question /unknown-path');
  fs.writeFileSync(path.join(directory, 'unknown-path.md'), '---\ncomposable: true\n---\nNow a method $@');
  expect(() => pathText.verify()).toThrow('source changed');
  const nested = path.join(cwd, 'nested'); fs.mkdirSync(nested); // Same project, nearer template wins.
  const { TemplateLoader } = await import('../../../core/prompts/templateLoader.js');
  const { capturePromptSources } = await import('../../../context/request/sources.js');
  const sources = capturePromptSources();
  expect(new TemplateLoader(nested, sources.track).load().get('evidence')?.content).toBe('Other $@');
  const nearer = path.join(nested, '.agents', 'prompts'); fs.mkdirSync(nearer, { recursive: true });
  fs.writeFileSync(path.join(nearer, 'evidence.md'), '---\ncomposable: true\n---\nNearer $@');
  expect(() => sources.verify()).toThrow('source changed');
});

it('previews ordinary standalone templates with exact dispatch arguments and no handler execution', async () => {
  const { cwd, context, load, layout, gateway } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'ordinary.md');
  fs.writeFileSync(file, 'Compare $1 | ${@:2} | ${3:-fallback}\nLiteral /model');
  const inputs = ['/ordinary "two words" tail\r\n中文', '/ordinary unfinished\'s prose', '/ordinary', '/ ordinary  padded\nbody'];
  const submitted = await Promise.all(inputs.map(input => routeSlashCommand(input, { cwd })));
  const registry = await import('../../../core/commands/registry.js');
  const create = registry.createCommandRegistry;
  const execute = vi.fn(() => { throw new Error('Preview executed a command handler.'); });
  vi.spyOn(registry, 'createCommandRegistry').mockImplementation((...args) => new Map([...create(...args)]
    .map(([name, command]) => [name, { ...command, execute }])));
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath]; const before = files.map(target => fs.readFileSync(target));
  for (const [index, input] of inputs.entries()) {
    const actual = submitted[index]; if (actual?.kind !== 'prompt') throw new Error('Fixture template did not dispatch.');
    const preview = await load(input); preview.verify();
    expect(prepare).toHaveBeenLastCalledWith(actual.prompt, expect.any(AbortSignal));
    expect(preview.estimate).toEqual((await load(actual.prompt)).estimate);
    expect(actual.prompt).toContain('Literal /model');
  }
  fs.writeFileSync(path.join(directory, 'literal.md'), 'Literal /skill:absent /settings /deep-research');
  const literal = await load('/literal'); literal.verify();
  expect(prepare).toHaveBeenLastCalledWith('Literal /skill:absent /settings /deep-research', expect.any(AbortSignal));
  expect(execute).not.toHaveBeenCalled(); expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
  expect(files.map(target => fs.readFileSync(target))).toEqual(before);
  const captured = await load('/ordinary value');
  fs.writeFileSync(file, 'Changed $@'); expect(() => captured.verify()).toThrow('source changed');
});

it('keeps template discovery distinct from builtin commands and inline composition permission', async () => {
  const { cwd, load, context } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'settings.md'), 'Do not replace the builtin.');
  fs.writeFileSync(path.join(directory, 'ordinary.md'), 'Inspect $@');
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  await expect(load('/settings')).rejects.toThrow('preparation');
  await expect(load('question /brainstorm /ordinary')).rejects.toThrow('cannot be composed');
  expect(prepare).not.toHaveBeenCalled();
  const input = 'question /ordinary'; const preview = await load(input); preview.verify();
  expect(prepare).toHaveBeenLastCalledWith(input, expect.any(AbortSignal));
  expect(await routeSlashCommand(input, { cwd })).toBeNull();
});

it('keeps inline functional names as prose while opening commands and composed controls remain unavailable', async () => {
  const { load, context } = fixture();
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  for (const input of [' /settings', '\n/model', 'question /model', 'quote `/brainstorm` /home']) {
    const preview = await load(input); preview.verify();
    expect(prepare).toHaveBeenLastCalledWith(input, expect.any(AbortSignal));
  }
  for (const input of ['/unknown-command', '/settings /skill:missing', 'question /brainstorm /settings',
    'question /brainstorm --save', 'question /deep-research /skill:missing']) {
    const calls = prepare.mock.calls.length;
    await expect(load(input)).rejects.toThrow();
    expect(prepare).toHaveBeenCalledTimes(calls);
  }
});

it('applies the submission budget before previewing partial skills or modifiers', async () => {
  const { cwd, context, load } = fixture();
  const file = path.join(cwd, 'large.md');
  fs.writeFileSync(file, `---\nname: large\ndescription: large\n---\n${'x'.repeat(65537)}`);
  context.skillOptions = { noSkills: true, skillPaths: [file] };
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  await expect(load('question /skill:large')).rejects.toThrow('budget');
  await expect(load(`${'q'.repeat(32769)} /brainstorm`)).rejects.toThrow('budget');
  expect(prepare).not.toHaveBeenCalled();
});

it('invalidates a newly created personal template candidate without changing legacy precedence', async () => {
  const { load } = fixture();
  const { userDataSearchDirs } = await import('../../../core/paths/userHome.js');
  const directories = userDataSearchDirs().map(directory => path.join(directory, 'prompts'));
  if (directories.length < 2) throw new Error('Fixture requires the default profile candidate roots.');
  fs.mkdirSync(directories[1]!, { recursive: true });
  fs.writeFileSync(path.join(directories[1]!, 'evidence.md'), '---\ncomposable: true\n---\nLegacy evidence $@');
  const before = await load('question /evidence'); before.verify();
  fs.mkdirSync(directories[0]!, { recursive: true });
  fs.writeFileSync(path.join(directories[0]!, 'new-method.md'), '---\ncomposable: true\n---\nNew method $@');
  expect(() => before.verify()).toThrow('source changed');
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
