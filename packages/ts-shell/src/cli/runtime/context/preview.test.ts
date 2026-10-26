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
import * as revisions from '../../../runtime/execution/read.js';
import * as workspaceFiles from '../../../core/workspace/files.js';
import { promptWithContext } from '../prompt.js';
import { prepareContextInjection } from './injection.js';
import { createProjectMemoryLocalStore } from '../../../memory/projectMemoryLocalStore.js';
import { createProjectMemoryInjectionStateStore } from '../../../memory/projectMemoryInjectionState.js';
import { createCompactLiveCheckpointStore } from '../../../context/compact/checkpoint/compactLiveCheckpoint.js';
import { createCompactInjectionStateStore } from '../../../context/compact/injection/compactInjectionState.js';
import type { ProjectMemoryRecord } from '../../../memory/projectMemoryStoreContract.js';
import { researchCommandFor, researchFor } from '../research.js';
import { researchEntryDescriptors } from '../../../research/run/tools.js';
import { preparePromptRequest } from '../../../core/prompts/request.js';
import { foregroundTools } from '../prompt.js';
import { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import * as endpoints from '../../../provider/endpoints/index.js';
import { toolSchemas } from '../../../turn/tools.js';
import { openingMessage } from '../../../turn/opening.js';
import { readPromptPreview } from '../../../session/context/preview.js';
import { estimateWirePrompt } from '../../../context/request/wire.js';

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
  const load = (draft = '', attachments?: Parameters<typeof previewContext>[4], signal = new AbortController().signal) =>
    previewContext(context, manager, gateway, draft, attachments, 'build', 'ask', signal);
  return { cwd, context, session, layout, target, gateway, load, manager };
};

it('estimates an empty startup through the actual tool projection without provider, MCP or persistence', async () => {
  const { load, layout, gateway } = fixture(); const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = files.map(target => fs.readFileSync(target)); const result = await load(); result.verify();
  expect(result.estimate.source).toBe('estimated'); expect(result.estimate.tokens).toBeGreaterThan(100);
  expect(result.estimate.identity.endpointId).toMatch(/^[a-f0-9]{64}$/);
  expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
  expect(files.map(target => fs.readFileSync(target))).toEqual(before); expect(fs.existsSync(layout.stateLockPath)).toBe(false);
});

it('withdraws an actual runtime estimate after raw memory changes while retaining its pending generation and session bytes', async () => {
  const { cwd, context, load, layout, gateway } = fixture();
  const store = createProjectMemoryLocalStore({ ref: { mode: 'test-only', root: cwd } });
  const record: ProjectMemoryRecord = { id: 'fact', version: 1, createdAt: '2026-10-26', candidateId: 'fact',
    candidateKind: 'project-fact', retentionClass: 'project-scoped-candidate', approvedAt: '2026-10-26', approvedBySourceCommand: '/memory',
    memoryText: 'Project uses strict validation.', evidence: ['preview:fixture'], source: 'system-derived', routeReferences: [], safety: 'safe', redactions: [] };
  fs.writeFileSync(store.ref.recordsFile!, JSON.stringify(record) + '\n');
  const states = createProjectMemoryInjectionStateStore();
  const pending = states.markPending({ sessionScopeId: 'session:sess_preview', mode: 'recall', sourceCommand: '/memory use', query: 'validation', recordIds: ['fact'] });
  const deps = { projectMemoryInjectionStateStore: states, compactCheckpointStore: createCompactLiveCheckpointStore(), compactInjectionStateStore: createCompactInjectionStateStore() };
  context.preparePromptContext = (prompt, signal) => prepareContextInjection(context, store, prompt, signal, deps);
  vi.spyOn(revisions, 'readRevision').mockReturnValue('stable');
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath], before = files.map(file => fs.readFileSync(file));
  const preview = await load('question'); preview.verify(); await preview.verifyContent(new AbortController().signal);
  const injected = await context.preparePromptContext('question', new AbortController().signal);
  expect(injected.prompt).toContain(record.memoryText);
  fs.writeFileSync(store.ref.recordsFile!, fs.readFileSync(store.ref.recordsFile!, 'utf8').replace('strict', 'looser'));
  expect(() => preview.verify()).not.toThrow();
  await expect(preview.verifyContent(new AbortController().signal)).rejects.toThrow('bytes changed');
  expect(states.get(pending.sessionScopeId)).toBe(pending);
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
  expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
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

it('previews the same two-skill payload after a fenced example without preparing its literal driver or missing skill', async () => {
  const { cwd, context, load, layout, gateway } = fixture();
  const files = ['one', 'two'].map(name => {
    const file = path.join(cwd, `${name}.md`); fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${name}\n---\nMETHOD ${name}`); return file;
  });
  context.skillOptions = { noSkills: true, skillPaths: files };
  const example = '~~~~text\nexample ~~~~ /skill:missing\n/deep-research\n~~~~ trailing\n~~~~~';
  const input = `检查示例\n${example}\n/skill:one /skill:two`;
  const submitted = await routeSlashCommand(input, { cwd, skillOptions: context.skillOptions });
  if (submitted?.kind !== 'prompt') throw new Error('Fixture composition was not prepared.');
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  const persisted = [layout.metadataPath, layout.statePath, layout.transcriptPath], before = persisted.map(file => fs.readFileSync(file));
  const preview = await load(input); preview.verify();
  expect(prepare).toHaveBeenCalledWith(submitted.prompt, expect.any(AbortSignal));
  expect(submitted.prompt).toContain(example); expect(submitted.prompt).toContain('METHOD one'); expect(submitted.prompt).toContain('METHOD two');
  expect(submitted.promptMetadata?.skills).toMatchObject([{ name: 'one' }, { name: 'two' }]);
  const actual = await load(submitted.prompt); expect(preview.estimate).toEqual(actual.estimate);
  expect(persisted.map(file => fs.readFileSync(file))).toEqual(before); expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
});

it('withdraws a multi-skill preview on raw manifest edits even when metadata stays equal', async () => {
  const { cwd, context, load, layout, gateway } = fixture();
  const files = ['one', 'two'].map(name => { const file = path.join(cwd, `${name}.md`);
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: first\n---\nfirst body`); return file; });
  context.skillOptions = { noSkills: true, skillPaths: files };
  const stat = fs.statSync.bind(fs); const lstat = fs.lstatSync.bind(fs);
  const metadata = new Map<string, fs.BigIntStats>(); const entries = new Map<string, fs.BigIntStats>();
  vi.spyOn(fs, 'statSync').mockImplementation(((target, options) => options?.bigint && metadata.has(String(target)) ? metadata.get(String(target))! : stat(target, options)) as typeof fs.statSync);
  vi.spyOn(fs, 'lstatSync').mockImplementation(((target, options) => options?.bigint && entries.has(String(target)) ? entries.get(String(target))! : lstat(target, options)) as typeof fs.lstatSync);
  const persisted = [layout.metadataPath, layout.statePath, layout.transcriptPath]; const before = persisted.map(file => fs.readFileSync(file));
  for (const file of files) {
    for (const target of files) { metadata.set(target, stat(target, { bigint: true })); entries.set(target, lstat(target, { bigint: true })); }
    const result = await load('question /skill:one /skill:two'); await result.verifyContent(new AbortController().signal);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('first', 'other'));
    expect(() => result.verify()).not.toThrow(); await expect(result.verifyContent(new AbortController().signal)).rejects.toThrow('bytes changed');
  }
  expect(persisted.map(file => fs.readFileSync(file))).toEqual(before); expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
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

it('does not load the template graph for ordinary prose or a body path', async () => {
  const { cwd, load } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  const unrelated = path.join(directory, 'unrelated.md');
  fs.writeFileSync(unrelated, 'This body must not be read by a path preview.');
  const read = vi.spyOn(fs, 'readFileSync');
  await load('question');
  await load('Inspect /home');
  expect(read.mock.calls.some(([target]) => target === unrelated)).toBe(false);
});

it('does not start template discovery for an already-cancelled preview', async () => {
  const { cwd, load } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'ordinary.md'); fs.writeFileSync(file, 'Ordinary body.');
  const read = vi.spyOn(fs, 'readFileSync');
  const controller = new AbortController(); controller.abort();
  await expect(load('/ordinary', undefined, controller.signal)).rejects.toThrow();
  expect(read.mock.calls.some(([target]) => target === file)).toBe(false);
});

it('bounds template discovery before reading an oversized candidate', async () => {
  const { cwd, load } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'ordinary.md'), 'x'.repeat(512 * 1024 + 1));
  await expect(load('/ordinary')).rejects.toThrow('byte budget');
});

it('counts non-command paths and vision fallback, but does not run functional commands', async () => {
  const { load } = fixture(); const text = await load('Inspect /home');
  const image = await load('Inspect /home', { images: [{ type: 'image', mimeType: 'image/png', data: 'AA==', description: 'diagram' }] });
  expect(image.estimate.tokens).toBeLessThan(text.estimate.tokens + 100);
  const research = await load('question /deep-research'); research.verify(); expect(research.estimate.tokens).toBeGreaterThan(text.estimate.tokens);
  await expect(load('/model')).rejects.toThrow('preparation');
});

it.each([
  '/deep-research --mode software question /skill:one /skill:two',
  'question /deep /skill:one /skill:two\nInspect counterexamples',
  '/research --save "Question with /home and quoted /model"',
])('previews and submits one exact native research entry without early state or network effects: %s', async input => {
  const { cwd, context, session, layout, load, manager, gateway } = fixture();
  const paths = ['one', 'two'].map(name => { const file = path.join(cwd, `${name}.md`); fs.writeFileSync(file, `---\nname: ${name}\ndescription: method\n---\nMETHOD ${name}`); return file; });
  context.skillOptions = { noSkills: true, skillPaths: paths };
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath], before = files.map(file => fs.readFileSync(file));
  const renderer = { renderLine: vi.fn() };
  const runtime = researchFor(context, manager, renderer);
  const created = vi.spyOn(runtime, 'create'), arm = vi.spyOn(runtime, 'arm'), execute = vi.spyOn(runtime, 'run');
  const injection = vi.fn(context.preparePromptContext!); context.preparePromptContext = injection;
  const wire = vi.spyOn(endpoints, 'endpointTurnBody');
  const preview = await load(input); preview.verify(); await preview.verifyContent(new AbortController().signal);
  const [endpoint, wireInput] = wire.mock.calls.at(-1)!;
  const expectedPrompt = injection.mock.calls.at(-1)![0];
  const prospectiveId = /native research run ([a-f0-9-]+)/.exec(expectedPrompt)![1]!;
  const capturedSession = await readPromptPreview(manager, session, cwd, expectedPrompt);
  expect(files.map(file => fs.readFileSync(file))).toEqual(before); expect(fs.existsSync(layout.stateLockPath)).toBe(false);
  expect(created).not.toHaveBeenCalled(); expect(arm).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  expect(runtime.selected(prospectiveId)).toBeUndefined(); expect(renderer.renderLine).not.toHaveBeenCalled();
  const host = new ShellSessionRuntime({} as never);
  const researchCommand = researchCommandFor(context, manager, host, renderer);
  const result = await routeSlashCommand(input, { cwd, projectRoot: cwd, sessionId: session.id, skillOptions: context.skillOptions,
    researchCommand, runCancellable: operation => host.commands.run(operation) });
  expect(result).toMatchObject({ kind: 'prompt', prompt: expectedPrompt, promptMetadata: { researchRunId: prospectiveId } });
  const admitted = runtime.selected(prospectiveId)!;
  expect(admitted.id).toBe(prospectiveId); expect(created).toHaveBeenCalledTimes(1); expect(arm).toHaveBeenCalledTimes(1);
  const descriptors = researchEntryDescriptors(admitted);
  const tools = descriptors.map(descriptor => ({ ...descriptor, execute: vi.fn(async () => ({ success: false })) }));
  const actual = await preparePromptRequest({ workspaceRoot: cwd, sessionId: session.id, runtimeConfig: context.runtimeConfig,
    skillOptions: context.skillOptions, agentMode: 'build', featureTools: foregroundTools(context, tools) });
  expect(preview.estimate.identity.schemaDigest).toBe(requestIdentity(actual.currentOverhead()).schemaDigest);
  expect(preview.estimate.identity.systemDigest).toBe(requestIdentity(actual.currentOverhead()).systemDigest);
  const actualMessages = [openingMessage({ workspaceRoot: cwd, permissionScope: 'ask', prompt: expectedPrompt,
    continuityContext: capturedSession.continuityContextFor(expectedPrompt), goalObjective: capturedSession.goalObjective })];
  const actualBody = endpoints.endpointTurnBody(endpoint, { ...wireInput, messages: actualMessages,
    systemPrompt: actual.currentOverhead().systemPrompt!, tools: toolSchemas(actual.currentTools()) });
  expect(preview.estimate.tokens).toBe(estimateWirePrompt(actualBody, endpoints.endpointShape(endpoint).contextFields));
  if (input.includes('/skill:')) expect(admitted.request.methods?.skills.map(skill => skill.name)).toEqual(['one', 'two']);
  expect(descriptors.some(tool => tool.name === 'research_save')).toBe(input.includes('--save'));
  expect(execute).not.toHaveBeenCalled(); expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
  expect(() => preview.verify()).toThrow();
});

it('rejects malformed research and control actions before publishing an entry identity', async () => {
  const { load, layout } = fixture(), before = fs.readFileSync(layout.statePath);
  for (const input of ['/deep-research status', '/deep-research resume', '/deep-research --depth invalid question',
    'question /deep-research --save', 'question /deep-research /research']) await expect(load(input)).rejects.toThrow();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('refuses an exact published research entry after configuration replacement without creating state', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const input = '/deep-research question'; const preview = await load(input);
  Object.assign(context, { configuration: new ConfigState(context.runtimeConfig, configurationBinding(context), context.configuration.current.catalog) });
  expect(() => preview.verify()).toThrow('expired or changed');
  const before = fs.readFileSync(layout.statePath), renderer = { renderLine: vi.fn() };
  const researchCommand = researchCommandFor(context, manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, renderer);
  const result = await routeSlashCommand(input, { cwd, projectRoot: cwd, sessionId: session.id, researchCommand });
  expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('configuration or session changed') });
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('does not publish a cancelled research preparation and later admits a fresh current entry', async () => {
  const { cwd, context, session, layout, manager, gateway, load } = fixture();
  const original = context.preparePromptContext!; const cancelled = new AbortController();
  context.preparePromptContext = async (prompt, signal) => { const prepared = await original(prompt, signal); cancelled.abort(); return prepared; };
  await expect(previewContext(context, manager, gateway, '/deep-research question', undefined, 'build', 'ask', cancelled.signal)).rejects.toThrow();
  const before = fs.readFileSync(layout.statePath); context.preparePromptContext = original;
  const preview = await load('/deep-research question'); preview.verify();
  const renderer = { renderLine: vi.fn() }, researchCommand = researchCommandFor(context, manager,
    { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, renderer);
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand })).toMatchObject({ kind: 'prompt' });
});

it('keeps another local command busy and rejects cancelled owned research dispatch', async () => {
  const { cwd, context, session, layout, manager } = fixture(), renderer = { renderLine: vi.fn() };
  const host = new ShellSessionRuntime({} as never), researchCommand = researchCommandFor(context, manager, host, renderer);
  const before = fs.readFileSync(layout.statePath);
  await host.commands.run(async signal => {
    const result = await researchCommand(['question'], { cwd, projectRoot: cwd, sessionId: session.id });
    expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('active turn') });
    host.commands.current!.controller.abort();
    await expect(researchCommand(['question'], { cwd, projectRoot: cwd, sessionId: session.id, signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  expect(fs.readFileSync(layout.statePath)).toEqual(before); expect(host.getCurrentRunController()).toBeNull();
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

it('estimates the exact attached snapshot with asynchronous content checks and no synchronous attachment read', async () => {
  const { cwd, context, load, layout, gateway } = fixture(); const file = path.join(cwd, 'context.txt');
  fs.writeFileSync(file, '\uFEFFattached\r\n中文 ' + 'facts '.repeat(100));
  const entry = readContextEntry({ root: cwd, target: file }); context.contextAttachments = [entry];
  const sync = vi.spyOn(workspaceFiles, 'inspectWorkspaceFile'); const asyncRead = vi.spyOn(workspaceFiles, 'inspectWorkspaceFileAsync');
  const persisted = [layout.metadataPath, layout.statePath, layout.transcriptPath]; const before = persisted.map(target => fs.readFileSync(target));
  const result = await load('question'); expect(result.estimate.tokens).toBeGreaterThan(100);
  context.contextAttachments = undefined;
  const assembled = await load(promptWithContext('question', [entry])); expect(assembled.estimate).toEqual(result.estimate);
  context.contextAttachments = [entry];
  expect(asyncRead).toHaveBeenCalledTimes(1); expect(sync).not.toHaveBeenCalled();
  for (let i = 0; i < 20; i++) result.verify(); expect(asyncRead).toHaveBeenCalledTimes(1); expect(sync).not.toHaveBeenCalled();
  await result.verifyContent(new AbortController().signal); expect(asyncRead).toHaveBeenCalledTimes(2);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('facts', 'other'));
  await expect(result.verifyContent(new AbortController().signal)).rejects.toThrow();
  expect(persisted.map(target => fs.readFileSync(target))).toEqual(before); expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
});

it('rejects attachment revocation during asynchronous acquisition and cancelled byte verification', async () => {
  const { cwd, context, load } = fixture(); const file = path.join(cwd, 'context.txt'); fs.writeFileSync(file, 'attached facts');
  context.contextAttachments = [readContextEntry({ root: cwd, target: file })];
  const result = await load('question'); const checking = new AbortController(); checking.abort();
  const read = vi.spyOn(workspaceFiles, 'inspectWorkspaceFileAsync');
  await expect(result.verifyContent(checking.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(read).not.toHaveBeenCalled();
  const original = workspaceFiles.inspectWorkspaceFileAsync; read.mockRestore();
  vi.spyOn(workspaceFiles, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    const fileState = await original(...args); installCommandGate(context, () => ({ permissionScope: 'ask', admission: () => 'revoked' })); return fileState;
  });
  await expect(result.verifyContent(new AbortController().signal)).rejects.toThrow('revoked');
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

it('invalidates actual instruction, import, append and template bytes with unchanged metadata', async () => {
  const { cwd, load, layout, gateway } = fixture();
  const directory = path.join(cwd, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  const files = [path.join(cwd, 'AGENTS.md'), path.join(cwd, 'nested.md'), path.join(cwd, 'APPEND_SYSTEM.md'), path.join(directory, 'ordinary.md')];
  fs.writeFileSync(files[0]!, '@./nested.md\nfirst rules'); fs.writeFileSync(files[1]!, 'first nested');
  fs.writeFileSync(files[2]!, 'first append'); fs.writeFileSync(files[3]!, 'first template $@');
  vi.spyOn(revisions, 'readRevision').mockReturnValue('stable');
  const persisted = [layout.metadataPath, layout.statePath, layout.transcriptPath]; const before = persisted.map(file => fs.readFileSync(file));
  for (const file of files) {
    const result = await load('/ordinary question'); await result.verifyContent(new AbortController().signal);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('first', 'other'));
    expect(() => result.verify()).not.toThrow();
    await expect(result.verifyContent(new AbortController().signal)).rejects.toThrow('bytes changed');
  }
  expect(persisted.map(file => fs.readFileSync(file))).toEqual(before);
  expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
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
