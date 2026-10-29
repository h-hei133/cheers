import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { previewContext } from './preview.js';
import { projectSessionFileLayout } from '../../../session/store/sessionFileLayout.js';
import { writeSessionRecord } from '../../../session/store/sessionStore.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import type { SessionMessage } from '../../../session/schema/sessionMessage.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { getRuntimeConfig, type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { ConfigState } from '../../../config/state.js';
import { configurationBinding } from '../../../core/shell/configuration.js';
import { buildPromptWithFutureTurnInjections } from '../../../core/shell/sessionFutureTurnProjection.js';
import type { CliMcpGateway } from '../../../entrypoints/cliMcpModule.js';
import { readContextEntry } from '../../../context/attachment/entry.js';
import { installCommandGate } from '../../data/access.js';
import { appendTranscriptEvent } from '../../../session/transcript/sessionTranscript.js';
import { createMessageTranscriptEvent } from '../../../session/sessionEventCodec.js';
import { requestIdentity } from '../../../context/request/identity.js';
import { capturePromptSources } from '../../../context/request/sources.js';
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
import { gitCommandFor, gitWorkbenchFor, installGitRuntime } from '../git.js';
import { gitFixture, gitGate, stubGitEnvironment } from '../../../test-utils/git.js';
import { createStepFunction } from '../../../turn/step.js';
import { runTurn } from '../../../turn/session.js';
import { getSessionUsage, resetSessionUsage } from '../../../observability/usageTelemetry.js';
import type { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { configuredOutputLimit } from '../../../provider/request/output.js';
import type { ToolDefinition } from '../../../tools/types.js';
import { buildSystemPrompt } from '../../../turn/prompt.js';
import { providerRequestTarget } from '../../provider/requestTarget.js';
import { createProviderStep } from '../../provider/step.js';
import { resolveCliCredential } from '../../provider/cliProviderRuntimeBridge.js';
import { credentialIdentityFor, selectPooledConnection } from '../../../core/auth/account/pool.js';
import { noteCredentialRateLimit, resetCredentialBackoffForTests } from '../../../core/auth/account/backoff.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import { BUILTIN_PROVIDERS } from '../../../core/models/catalog.js';

let root: string;
let repositories: ReturnType<typeof gitFixture>[] = [];
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/runtime-preview-');
  const home = path.join(root, 'home'); fs.mkdirSync(home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('USERPROFILE', home);
  repositories = [];
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
  for (const repository of repositories) repository.cleanup();
});
const fixture = (options: {
  readonly git?: boolean;
  readonly toolCalling?: boolean;
  readonly credential?: boolean;
  readonly endpoint?: 'openai-responses';
  /** Two extra aliases claiming the same endpoint, so the address is ambiguous. */
  readonly ambiguous?: boolean;
} = {}) => {
  const cwd = options.git ? (() => {
    const repository = gitFixture(true); repositories.push(repository); stubGitEnvironment(repository.home); return repository.root;
  })() : path.join(root, 'workspace');
  if (!options.git) { fs.mkdirSync(cwd); fs.mkdirSync(path.join(cwd, '.git')); }
  const session: Session = { id: 'sess_preview', projectRoot: cwd, status: 'active', rootMode: 'direct', turns: [],
    createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
  const layout = projectSessionFileLayout({ sessionsDir: path.join(root, 'sessions'), sessionId: session.id }); writeSessionRecord({ session, layout });
  const manager = { getSessionDirPath: () => layout.sessionDir, getSession: () => session } as unknown as SessionManager;
  const config = { ...getRuntimeConfig(cwd), enableMcpTools: false, toolDiscovery: 'dynamic' as const };
  const target = { provider: 'openai', model: 'fixture', baseUrl: 'https://fixture.invalid/v1', expectedEnvVarName: 'FIXTURE', thinkingEffort: null,
    ...(options.credential ? { credential: { provider: 'openai', authMode: 'api-key', apiKey: 'synthetic-preview-target',
      model: 'fixture', baseUrl: 'https://fixture.invalid/v1', source: 'config', envVarName: 'FIXTURE' } } : {}) };
  const context = { cwd, projectRoot: cwd, session, skillOptions: { noSkills: true }, runtimeConfig: config,
    resolveConfigTarget: () => target } as unknown as ShellRuntimeContext;
  const base = target.baseUrl.replace(/\/+$/, '');
  const providers = [
    { id: 'openai', name: 'Fixture', baseUrl: target.baseUrl,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      models: [{ id: 'fixture', name: 'Fixture', vision: false,
        ...(options.toolCalling !== undefined ? { toolCalling: options.toolCalling } : {}) }] },
    ...(options.ambiguous ? [
      { id: 'alias-a', name: 'Alias A', runtime: 'openai' as const, baseUrl: `${base}/`,
        models: [{ id: 'fixture', name: 'Fixture', vision: false }] },
      { id: 'alias-b', name: 'Alias B', runtime: 'openai' as const, baseUrl: `${base}//`,
        models: [{ id: 'fixture', name: 'Fixture', vision: false }] },
    ] : []),
  ];
  Object.assign(context, { configuration: new ConfigState(config, configurationBinding(context), providers) });
  if (options.git) installGitRuntime(context, manager, new ShellSessionRuntime({} as never), () => gitGate(cwd));
  context.preparePromptContext = async (prompt, signal) => {
    const prepared = await buildPromptWithFutureTurnInjections({ deps: {}, sessionId: session.id, prompt });
    return { prompt: prepared.prompt, isCurrent: () => !signal.aborted && prepared.isCurrent() };
  };
  installCommandGate(context, () => ({ permissionScope: 'ask' }));
  const gateway: CliMcpGateway = { snapshot: vi.fn(() => { throw new Error('No connection permitted'); }), refresh: vi.fn() };
  const load = (draft = '', attachments?: Parameters<typeof previewContext>[4], signal = new AbortController().signal,
    agentMode: 'plan' | 'build' = 'build') =>
    previewContext(context, manager, gateway, draft, attachments, agentMode, 'ask', signal);
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

it.each(['review', 'audit', 'check'])('previews the exact composed %s prompt through the native Git owner without dispatch or writes', async name => {
  const { cwd, context, load, layout, session } = fixture({ git: true });
  const paths = ['review-a', 'review-b'].map(skillName => {
    const file = path.join(cwd, `${skillName}.md`);
    fs.writeFileSync(file, `---\nname: ${skillName}\ndescription: ${skillName}\n---\nMETHOD ${skillName}`);
    return file;
  });
  context.skillOptions = { noSkills: true, skillPaths: paths };
  const input = `检查证据 /brainstorm /${name} /skill:review-a /skill:review-b`;
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  const workbench = gitWorkbenchFor(context)!;
  const execute = vi.spyOn(workbench, 'execute');
  const command = vi.spyOn(workbench, 'command');
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath], before = files.map(file => fs.readFileSync(file));
  const status = workbench.git().text(['status', '--short']);
  const preview = await load(input); preview.verify();
  expect(command).not.toHaveBeenCalled();
  const actual = await routeSlashCommand(input, { cwd, sessionId: session.id, skillOptions: context.skillOptions,
    gitCommand: gitCommandFor(context) });
  if (actual?.kind !== 'prompt') throw new Error('Expected the native review prompt.');
  expect(prepare).toHaveBeenCalledWith(actual.prompt, expect.any(AbortSignal));
  expect(actual.prompt).toContain('<skill name="review-a">');
  expect(actual.prompt).toContain('<skill name="review-b">');
  expect(actual.prompt).toContain('<method name="brainstorm">');
  expect(actual.prompt).toContain('检查证据');
  expect(preview.estimate).toEqual((await load(actual.prompt, undefined, undefined, 'plan')).estimate);
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
  expect(await status).toBe(await workbench.git().text(['status', '--short']));
});

it('refuses a composed review dispatch when a selected skill changes after preview', async () => {
  const { cwd, context, load, session } = fixture({ git: true });
  const file = path.join(cwd, 'review-method.md');
  fs.writeFileSync(file, `---\nname: review-method\ndescription: review method\n---\nOLD REVIEW METHOD`);
  context.skillOptions = { noSkills: true, skillPaths: [file] };
  const input = '检查证据 /brainstorm /review /skill:review-method';
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const review = vi.spyOn(workbench, 'review');
  await load(input);
  fs.writeFileSync(file, `---\nname: review-method\ndescription: review method\n---\nNEW REVIEW METHOD`);
  expect(await routeSlashCommand(input, { cwd, sessionId: session.id, skillOptions: context.skillOptions,
    gitCommand: gitCommandFor(context) })).toMatchObject({
    kind: 'local', retryDraft: input, output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(review).toHaveBeenCalledTimes(1);
  expect(await routeSlashCommand(input, { cwd, sessionId: session.id, skillOptions: context.skillOptions,
    gitCommand: gitCommandFor(context) })).toMatchObject({
    kind: 'local', retryDraft: input, output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
  await load(input);
  expect(await routeSlashCommand(input, { cwd, sessionId: session.id, skillOptions: context.skillOptions,
    gitCommand: gitCommandFor(context) })).toMatchObject({ kind: 'prompt' });
  expect(snapshot).toHaveBeenCalledTimes(2);
  expect(review).toHaveBeenCalledTimes(3);
});

it('previews a standalone review focus with the same native prompt as dispatch', async () => {
  const { cwd, context, gateway, load, manager, session } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'new.txt'), 'standalone evidence\n');
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  const preview = await load('/review inspect this');
  preview.verify();
  const plan = await previewContext(context, manager, gateway, '/review inspect this', undefined, 'plan', 'ask', new AbortController().signal);
  expect(plan.estimate).toEqual(preview.estimate);
  const actual = await routeSlashCommand('/review inspect this', { cwd, sessionId: session.id, gitCommand: gitCommandFor(context) });
  if (actual?.kind !== 'prompt') throw new Error('Expected the native review prompt.');
  expect(prepare).toHaveBeenCalledWith(actual.prompt, expect.any(AbortSignal));
  expect(actual.prompt).toContain('User focus: inspect this');
  expect(preview.estimate).toEqual((await load(actual.prompt, undefined, undefined, 'plan')).estimate);
});

it('invalidates a review preview when the native Git snapshot changes', async () => {
  const { cwd, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'first.txt'), 'first evidence\n');
  const preview = await load('检查证据 /review');
  preview.verify();
  fs.writeFileSync(path.join(cwd, 'first.txt'), 'second evidence\n');
  await expect(preview.verifyContent(new AbortController().signal)).rejects.toThrow('GIT_STATE_CHANGED');
});

it('refuses dispatch when the reserved review snapshot changed after preview', async () => {
  const { cwd, context, load, session } = fixture({ git: true });
  const file = path.join(cwd, 'reserved.txt'); fs.writeFileSync(file, 'before reservation\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review reservation');
  fs.writeFileSync(file, 'after reservation\n');
  const actual = await routeSlashCommand('/review reservation', { cwd, sessionId: session.id, gitCommand: gitCommandFor(context) });
  expect(actual).toMatchObject({ kind: 'local', output: expect.stringContaining('GIT_STATE_CHANGED') });
  expect(await routeSlashCommand('/review reservation', { cwd, sessionId: session.id, gitCommand: gitCommandFor(context) }))
    .toMatchObject({ kind: 'local', output: expect.stringContaining('Review preparation changed') });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('consumes a review reservation once and refreshes on a later dispatch', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'once.txt'), 'one use\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review one use');
  const command = gitCommandFor(context);
  expect(await command(['review', 'one use'], { cwd })).toMatchObject({ kind: 'prompt' });
  expect(snapshot).toHaveBeenCalledTimes(1);
  expect(await command(['review', 'one use'], { cwd })).toMatchObject({ kind: 'prompt' });
  expect(snapshot).toHaveBeenCalledTimes(2);
});

it('refuses an expired review reservation without taking a fresh snapshot', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'expiry.txt'), 'expiry bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review expiry');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_001);
  expect(await gitCommandFor(context)(['review', 'expiry'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation expired'),
  });
  expect(await gitCommandFor(context)(['review', 'expiry'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation expired'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('does not reuse a review reservation after configuration replacement', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'config.txt'), 'configuration bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review configuration');
  Object.assign(context, { configuration: new ConfigState(context.runtimeConfig, configurationBinding(context), context.configuration.current.catalog) });
  expect(await gitCommandFor(context)(['review', 'configuration'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(await gitCommandFor(context)(['review', 'configuration'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('detects an in-place context-selection change before consuming a review reservation', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'selection.txt'), 'selection bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review selection');
  context.session.contextSelection = { version: 1, revision: 1, entries: [] };
  expect(await gitCommandFor(context)(['review', 'selection'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('drops a review reservation when a different draft starts previewing', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'draft.txt'), 'draft bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review draft');
  await load('ordinary prompt');
  expect(await gitCommandFor(context)(['review', 'draft'], { cwd })).toMatchObject({ kind: 'prompt' });
  expect(snapshot).toHaveBeenCalledTimes(2);
});

it('keeps a stale review marker when another preview source fails verification', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const preview = await load('/review source');
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), 'changed instructions');
  await expect(preview.verifyContent(new AbortController().signal)).rejects.toThrow();
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('keeps a stale review marker when generic verification fails', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const preview = await load('/review source');
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), 'changed instructions');
  expect(() => preview.verify()).toThrow();
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('does not retire a review reservation when a suspended preview check is aborted', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const preview = await load('/review source');
  preview.suspend?.();
  const controller = new AbortController(); controller.abort();
  await expect(preview.verifyContent!(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  preview.resume?.();
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({ kind: 'prompt' });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('keeps a stale review marker when a replacement preview fails before publication', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review source');
  const original = context.preparePromptContext!;
  context.preparePromptContext = async () => { throw new Error('replacement preview failed'); };
  await expect(load('ordinary prompt')).rejects.toThrow('replacement preview failed');
  context.preparePromptContext = original;
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(1);
});

it('keeps a stale review marker when a replacement review focus fails before publication', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await load('/review first');
  const original = context.preparePromptContext!;
  context.preparePromptContext = async (prompt, signal) => {
    if (prompt.includes('User focus: second')) throw new Error('replacement review failed');
    return original(prompt, signal);
  };
  await expect(load('/review second')).rejects.toThrow('replacement review failed');
  context.preparePromptContext = original;
  expect(await gitCommandFor(context)(['review', 'second'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(await gitCommandFor(context)(['review', 'second'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Review preparation changed'),
  });
  expect(snapshot).toHaveBeenCalledTimes(2);
});

it('runs the full preview guard before consuming a review reservation', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const guardFile = path.join(root, 'guard.txt');
  fs.writeFileSync(guardFile, 'guard bound\n');
  const sources = capturePromptSources();
  sources.track(guardFile);
  const original = context.preparePromptContext!;
  context.preparePromptContext = async (prompt, signal) => {
    const prepared = await original(prompt, signal);
    return { ...prepared, verifyContent: (checkingSignal: AbortSignal) => sources.verifyContent(checkingSignal) };
  };
  await load('/review source');
  fs.writeFileSync(guardFile, 'changed instructions');
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({
    kind: 'local', output: expect.stringContaining('Prompt source changed'),
  });
});

it('binds a review reservation to the image attachments beside the draft', async () => {
  const { cwd, context, load, session } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'image.txt'), 'image bound\n');
  const image = (data: string) => ({ type: 'image' as const, mimeType: 'image/png', data });
  await load('/review image', { images: [image('first-image')] });
  const actual = await routeSlashCommand('/review image', {
    cwd, sessionId: session.id, attachments: { images: [image('second-image')] }, gitCommand: gitCommandFor(context),
  });
  expect(actual).toMatchObject({ kind: 'local', output: expect.stringContaining('Review preparation changed') });
});

it('disposes a published review reservation through the preview owner', async () => {
  const { cwd, context, load } = fixture({ git: true });
  fs.writeFileSync(path.join(cwd, 'source.txt'), 'source bound\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const preview = await load('/review source');
  preview.dispose?.();
  expect(await gitCommandFor(context)(['review', 'source'], { cwd })).toMatchObject({ kind: 'prompt' });
  expect(snapshot).toHaveBeenCalledTimes(2);
});

it('keeps review unknown when the native Git owner is unavailable or the tree is clean', async () => {
  const unavailable = fixture();
  const prepare = vi.fn(unavailable.context.preparePromptContext!); unavailable.context.preparePromptContext = prepare;
  await expect(unavailable.load('检查证据 /review')).rejects.toThrow('Review request preparation is unavailable');
  expect(prepare).not.toHaveBeenCalled();
  const clean = fixture({ git: true });
  const cleanPrepare = vi.fn(clean.context.preparePromptContext!); clean.context.preparePromptContext = cleanPrepare;
  await expect(clean.load('检查证据 /review')).rejects.toThrow('Working tree clean');
  expect(cleanPrepare).not.toHaveBeenCalled();
});

it('does not inspect Git for an already-cancelled review preview', async () => {
  const { load, context } = fixture({ git: true });
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  const controller = new AbortController(); controller.abort();
  await expect(load('/review', undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(snapshot).not.toHaveBeenCalled();
});

it('does not prepare a review prompt when Git snapshot acquisition is cancelled', async () => {
  const { load, context } = fixture({ git: true });
  fs.writeFileSync(path.join(context.cwd, 'cancelled.txt'), 'evidence\n');
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = workbench.snapshot.bind(workbench);
  const controller = new AbortController();
  vi.spyOn(workbench, 'snapshot').mockImplementation(async signal => {
    const value = await snapshot(signal);
    controller.abort();
    return value;
  });
  const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
  await expect(load('/review', undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(prepare).not.toHaveBeenCalled();
});

it('rejects a second composed driver before the review owner takes a snapshot', async () => {
  const { load, context } = fixture({ git: true });
  const workbench = gitWorkbenchFor(context)!;
  const snapshot = vi.spyOn(workbench, 'snapshot');
  await expect(load('检查证据 /deep-research /review')).rejects.toThrow('Only one workflow driver');
  expect(snapshot).not.toHaveBeenCalled();
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
  'Compare papers /deep-research --mode="paper" --depth="deep" --brief="brief with spaces.md" /skill:one /skill:two',
  "Compare papers /deep --mode='paper' --depth='deep' --brief='brief with spaces.md' /skill:one /skill:two",
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
  if (input.includes('--mode=')) {
    expect(admitted.request).toMatchObject({ mode: 'paper', depth: 'deep', briefPath: 'brief with spaces.md' });
    expect(admitted.request.question.trim()).toBe('Compare papers');
  }
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

it('refuses a published research entry after attached source bytes change without creating state', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const file = path.join(cwd, 'research-context.txt'); fs.writeFileSync(file, 'before attachment');
  context.contextAttachments = [readContextEntry({ root: cwd, target: file })];
  const before = fs.readFileSync(layout.statePath);
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const preview = await load('/deep-research question'); preview.verify();
  fs.writeFileSync(file, 'after attachment');
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('changed'),
  });
  expect(create).not.toHaveBeenCalled();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it.each(['--mode="unknown"', '--mode="paper" --mode software', '--brief="unfinished', '--brief "unfinished'])(
  'rejects invalid quoted research previews without state or request preparation: %s', async option => {
    const { context, layout, manager, load, gateway } = fixture();
    const files = [layout.metadataPath, layout.statePath, layout.transcriptPath], before = files.map(file => fs.readFileSync(file));
    const runtime = researchFor(context, manager, { renderLine: vi.fn() });
    const create = vi.spyOn(runtime, 'create'), arm = vi.spyOn(runtime, 'arm'), execute = vi.spyOn(runtime, 'run');
    const prepare = vi.fn(context.preparePromptContext!); context.preparePromptContext = prepare;
    await expect(load(`Question /deep-research ${option}`)).rejects.toThrow();
    expect(files.map(file => fs.readFileSync(file))).toEqual(before); expect(fs.existsSync(layout.stateLockPath)).toBe(false);
    expect(create).not.toHaveBeenCalled(); expect(arm).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled(); expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
  });

it('refuses an expired published research entry instead of starting a fresh run', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const before = fs.readFileSync(layout.statePath);
  await load('/deep-research question');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20_001);
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('expired'),
  });
  expect(create).not.toHaveBeenCalled();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('refuses a discarded research preview instead of starting a fresh run', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const before = fs.readFileSync(layout.statePath);
  const preview = await load('/deep-research question'); preview.dispose?.();
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('expired'),
  });
  expect(create).not.toHaveBeenCalled();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('refuses a changed research request while an old preview is published', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const before = fs.readFileSync(layout.statePath);
  await load('/deep-research question');
  expect(await routeSlashCommand('/deep-research different', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research different', output: expect.stringContaining('request changed'),
  });
  expect(await routeSlashCommand('/deep-research another', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research another', output: expect.stringContaining('expired'),
  });
  expect(create).not.toHaveBeenCalled();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('binds a published research entry to image attachments', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const image = (data: string) => ({ type: 'image' as const, mimeType: 'image/png', data });
  const before = fs.readFileSync(layout.statePath);
  await load('/deep-research question', { images: [image('first-image')] });
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    researchCommand: command, attachments: { images: [image('second-image')] } })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('changed'),
  });
  expect(create).not.toHaveBeenCalled();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('keeps a stale tombstone when reservation consumption fails to create a run', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const before = fs.readFileSync(layout.statePath);
  await load('/deep-research question');
  create.mockImplementationOnce(() => { throw new Error('Research has a pending owner.'); });
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('pending owner'),
  });
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id, researchCommand: command })).toMatchObject({
    kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('expired'),
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
});

it('propagates cancellation while verifying a published research entry and consumes it', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const file = path.join(cwd, 'research-cancel.txt'); fs.writeFileSync(file, 'attached facts');
  context.contextAttachments = [readContextEntry({ root: cwd, target: file })];
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  await load('/deep-research question');
  const controller = new AbortController();
  const original = workspaceFiles.inspectWorkspaceFileAsync;
  vi.spyOn(workspaceFiles, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    const result = await original(...args); controller.abort(); return result;
  });
  const before = fs.readFileSync(layout.statePath);
  await expect(command(['question'], { cwd, projectRoot: cwd, sessionId: session.id, signal: controller.signal }))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(create).not.toHaveBeenCalled();
  expect(fs.readFileSync(layout.statePath)).toEqual(before);
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    researchCommand: command })).toMatchObject({ kind: 'local', retryDraft: '/deep-research question',
    output: expect.stringContaining('expired') });
  expect(create).not.toHaveBeenCalled();
  vi.mocked(workspaceFiles.inspectWorkspaceFileAsync).mockRestore();
  await load('/deep-research question');
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    researchCommand: command })).toMatchObject({ kind: 'prompt' });
  expect(create).toHaveBeenCalledTimes(1);
});

it('runs standalone research source verification under the session command owner', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const file = path.join(cwd, 'research-route-cancel.txt'); fs.writeFileSync(file, 'attached facts');
  context.contextAttachments = [readContextEntry({ root: cwd, target: file })];
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const host = new ShellSessionRuntime({} as never);
  const command = researchCommandFor(context, manager, host, { renderLine: vi.fn() });
  await load('/deep-research question');
  const parent = new AbortController();
  let entered = false;
  vi.spyOn(workspaceFiles, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    entered = true;
    const signal = args.find(value => value instanceof AbortSignal);
    await new Promise<void>((_, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
    return undefined as never;
  });
  const before = fs.readFileSync(layout.statePath);
  const pending = routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    signal: parent.signal, researchCommand: command, runCancellable: operation => host.commands.run(operation) });
  try {
    await vi.waitFor(() => expect(entered).toBe(true));
    expect(host.commands.current).toBeDefined();
    parent.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(create).not.toHaveBeenCalled();
    expect(fs.readFileSync(layout.statePath)).toEqual(before);
  } finally {
    host.commands.current?.controller.abort();
    await pending.catch(() => {});
  }
});

it('preserves local busy refusal when another command owns the session', async () => {
  const { cwd, context, session, manager } = fixture();
  const host = new ShellSessionRuntime({} as never);
  const command = researchCommandFor(context, manager, host, { renderLine: vi.fn() });
  let release!: () => void;
  const pending = host.commands.run(() => new Promise<void>(resolve => { release = resolve; }));
  const result = await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    researchCommand: command, runCancellable: operation => host.commands.run(operation) });
  expect(result).toMatchObject({ kind: 'local', retryDraft: '/deep-research question', output: expect.stringContaining('active turn') });
  release();
  await pending;
});

it('refuses a concurrent research dispatch while the first verification is in flight', async () => {
  const { cwd, context, session, layout, manager, load } = fixture();
  const file = path.join(cwd, 'research-concurrent.txt'); fs.writeFileSync(file, 'attached facts');
  context.contextAttachments = [readContextEntry({ root: cwd, target: file })];
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const host = new ShellSessionRuntime({} as never);
  const firstCommand = researchCommandFor(context, manager, host, { renderLine: vi.fn() });
  const secondCommand = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  await load('/deep-research question');
  const before = fs.readFileSync(layout.statePath);
  let entered = false, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = workspaceFiles.inspectWorkspaceFileAsync;
  vi.spyOn(workspaceFiles, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    entered = true; await gate; return original(...args);
  });
  const first = routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    researchCommand: firstCommand, runCancellable: operation => host.commands.run(operation) });
  await vi.waitFor(() => expect(entered).toBe(true));
  expect(await routeSlashCommand('/deep-research question', { cwd, projectRoot: cwd, sessionId: session.id,
    researchCommand: secondCommand })).toMatchObject({ kind: 'local', retryDraft: '/deep-research question',
    output: expect.stringContaining('expired') });
  release();
  await expect(first).resolves.toMatchObject({ kind: 'prompt' });
  expect(create).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(layout.statePath)).not.toEqual(before);
});

it('does not create a research run when the command signal is already aborted', async () => {
  const { cwd, context, session, manager } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const create = vi.spyOn(runtime, 'create');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const aborted = new AbortController(); aborted.abort();
  await expect(command(['question'], { cwd, projectRoot: cwd, sessionId: session.id,
    runCancellable: async operation => operation(aborted.signal) })).rejects.toMatchObject({ name: 'AbortError' });
  expect(create).not.toHaveBeenCalled();
});

it.each(['pause', 'reconcile'])('does not execute an aborted %s research action', async action => {
  const { cwd, context, session, manager } = fixture();
  const runtime = researchFor(context, manager, { renderLine: vi.fn() });
  const pause = vi.spyOn(runtime, 'pause');
  const discard = vi.spyOn(runtime, 'discard');
  const command = researchCommandFor(context, manager, { getCurrentRunController: () => null } as never, { renderLine: vi.fn() });
  const aborted = new AbortController(); aborted.abort();
  await expect(command(action === 'reconcile' ? [action, 'discard'] : [action], { cwd, projectRoot: cwd, sessionId: session.id,
    runCancellable: async operation => operation(aborted.signal) })).rejects.toMatchObject({ name: 'AbortError' });
  expect(pause).not.toHaveBeenCalled();
  expect(discard).not.toHaveBeenCalled();
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

it('refuses to preview an endpoint two catalogue entries claim', async () => {
  // Dispatch refuses an ambiguous address, and the shape lookup would fall back
  // to a capable default there. A preview that cannot be sent must say so rather
  // than describe a request the run will never build.
  const { context, load } = fixture({ ambiguous: true });
  await expect(load('question')).rejects.toThrow('multiple entries for this endpoint');
});

it('uses the closing request schema identity when no tool steps are allowed', async () => {
  const { context, load } = fixture();
  const config = { ...context.configuration.current.config, maxTurns: 0 };
  Object.assign(context, { configuration: new ConfigState(config, configurationBinding(context), context.configuration.current.catalog) });
  const result = await load('question'); result.verify();
  expect(result.estimate.identity.schemaDigest).toBe(requestIdentity({ tools: [] }).schemaDigest);
});

it('omits tool schemas for a model that cannot call tools', async () => {
  const { context, load } = fixture({ toolCalling: false });
  const config = { ...context.configuration.current.config, maxTurns: 2, toolDiscovery: 'dynamic' };
  Object.assign(context, { runtimeConfig: config, configuration: new ConfigState(config, configurationBinding(context), context.configuration.current.catalog) });
  const wire = vi.spyOn(endpoints, 'endpointTurnBody');
  const result = await load('question'); result.verify();
  const body = JSON.parse(JSON.stringify(wire.mock.results.at(-1)!.value));
  expect(body.tools).toBeUndefined();
  expect(body.tool_choice).toBeUndefined();
  const messages = body.messages as Array<{ readonly role: string; readonly content?: string }>;
  expect(messages[0]?.content).not.toContain('equipped with real tools');
  expect(messages[0]?.content).not.toContain('`read`');
  expect(JSON.stringify(messages)).not.toContain('You have reached the limit of steps');
  expect(result.estimate.identity.schemaDigest).toBe(requestIdentity({ tools: [] }).schemaDigest);
});

it('uses the full provider replay identity for a Responses preview', async () => {
  const { context, cwd, load } = fixture({ credential: true, endpoint: 'openai-responses' });
  const result = await load('question');
  const resolution = context.resolveConfigTarget!(context.runtimeConfig)!;
  const expected = providerRequestTarget({
    workspaceRoot: cwd,
    resolution,
    baseUrl: resolution.baseUrl!,
    endpoint: 'openai-responses',
  });

  expect(result.estimate.identity.replayBinding).toBe(expected.replayBinding);
  expect(result.estimate.identity.wireHistoryDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(result.estimate.identity.wireMessageCount).toBe(1);
});

it.each([
  { thinkingEffort: undefined, account: false }, { thinkingEffort: null, account: false },
  { thinkingEffort: undefined, account: true }, { thinkingEffort: null, account: true },
] as const)('keeps summary-only preview and dispatch identical with automatic effort $thinkingEffort and account $account', async ({ thinkingEffort, account }) => {
  const { context, cwd, session, load, layout } = fixture({ credential: true });
  const baseUrl = account ? 'https://chatgpt.com/backend-api' : 'https://api.openai.com/v1';
  const target = { provider: 'openai' as const, model: 'o4-mini', baseUrl,
    expectedEnvVarName: 'OPENAI_API_KEY', thinkingEffort, credential: account ? {
      provider: 'openai' as const, authMode: 'account-auth' as const, source: 'config' as const, envVarName: 'OPENAI_API_KEY',
      accountAuth: { type: 'openai-chatgpt-account' as const, accessToken: 'synthetic-preview-target', refreshToken: 'synthetic',
        expiresAt: 1, accountId: 'synthetic-account' },
    } : { provider: 'openai' as const, authMode: 'api-key' as const,
      apiKey: 'synthetic-preview-target', model: 'o4-mini', baseUrl, source: 'config' as const, envVarName: 'OPENAI_API_KEY' } };
  Object.assign(context, { resolveConfigTarget: () => target,
    configuration: new ConfigState(context.runtimeConfig, configurationBinding(context), BUILTIN_PROVIDERS) });
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = files.map(file => fs.readFileSync(file));
  const wire = vi.spyOn(endpoints, 'endpointTurnBody');
  const preview = await load('question'); preview.verify();
  const [endpoint, input] = wire.mock.calls.at(-1)!;
  const body = JSON.parse(JSON.stringify(wire.mock.results.at(-1)!.value));
  expect(endpoint).toBe(account ? 'openai-account-responses' : 'openai-responses');
  expect(body.reasoning).toEqual({ summary: 'auto' });
  if (account) expect(body).not.toHaveProperty('max_output_tokens');
  let dispatched: Record<string, unknown> | undefined;
  const output = [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'answer' }] }];
  const step = createStepFunction({ workspaceRoot: cwd, sessionId: session.id, catalog: BUILTIN_PROVIDERS,
    ...captureThinkingPreference(cwd, thinkingEffort), provider: { provider: 'openai', model: target.model, baseUrl: target.baseUrl,
      endpoint, replayBinding: input.replayBinding }, systemPrompt: input.systemPrompt, tools: input.tools,
    temperature: input.temperature, topP: input.topP, maxOutputTokens: input.maxOutputTokens,
    fetchImpl: async (_url, init) => {
      dispatched = JSON.parse(String(init?.body));
      if (!account) return Response.json({ status: 'completed', output });
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: output[0] },
        { type: 'response.output_item.done', output_index: 0, item: output[0] },
        { type: 'response.done', response: { id: 'r', status: 'completed', output } },
      ];
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  expect((await step(input.messages, undefined, {}, { allowTools: input.allowTools })).text).toBe('answer');
  expect(dispatched).toEqual(body);
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
});

it.each([
  { provider: 'google-ai', endpoint: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com', thinkingEffort: undefined },
  { provider: 'google-ai', endpoint: 'google-generative-ai', baseUrl: 'https://generativelanguage.googleapis.com', thinkingEffort: null },
  { provider: 'vertex', endpoint: 'google-vertex', baseUrl: 'https://aiplatform.googleapis.com/v1/projects/synthetic/locations/global/publishers/google/models', thinkingEffort: undefined },
  { provider: 'vertex', endpoint: 'google-vertex', baseUrl: 'https://aiplatform.googleapis.com/v1/projects/synthetic/locations/global/publishers/google/models', thinkingEffort: null },
] as const)('keeps automatic Google thought-summary preview identical to dispatch for $provider/$thinkingEffort', async target => {
  const { context, cwd, session, load, layout } = fixture({ credential: true });
  const model = 'gemini-2.5-pro';
  const resolution = { provider: target.provider, model, baseUrl: target.baseUrl, thinkingEffort: target.thinkingEffort,
    expectedEnvVarName: 'SYNTHETIC_GOOGLE', credential: { provider: target.provider, authMode: 'api-key' as const,
      apiKey: 'synthetic-preview-target', model, baseUrl: target.baseUrl, source: 'config' as const, envVarName: 'SYNTHETIC_GOOGLE' } };
  Object.assign(context, { resolveConfigTarget: () => resolution,
    configuration: new ConfigState(context.runtimeConfig, configurationBinding(context), BUILTIN_PROVIDERS) });
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath];
  const before = files.map(file => fs.readFileSync(file));
  const wire = vi.spyOn(endpoints, 'endpointTurnBody');
  const preview = await load('question'); preview.verify();
  const [endpoint, input] = wire.mock.calls.at(-1)!;
  const body = JSON.parse(JSON.stringify(wire.mock.results.at(-1)!.value));
  expect(endpoint).toBe(target.endpoint);
  expect(body.generationConfig.thinkingConfig).toEqual({ includeThoughts: true });
  let dispatched: Record<string, unknown> | undefined;
  const step = createStepFunction({ workspaceRoot: cwd, sessionId: session.id, catalog: BUILTIN_PROVIDERS,
    ...captureThinkingPreference(cwd, target.thinkingEffort), provider: { provider: target.provider, model,
      baseUrl: target.baseUrl, endpoint, replayBinding: input.replayBinding }, systemPrompt: input.systemPrompt, tools: input.tools,
    temperature: input.temperature, topP: input.topP, maxOutputTokens: input.maxOutputTokens,
    fetchImpl: async (_url, init) => {
      dispatched = JSON.parse(String(init?.body));
      const frame = { candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }] };
      return new Response(`data: ${JSON.stringify(frame)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    },
  });
  expect((await step(input.messages, undefined, {}, { allowTools: input.allowTools })).text).toBe('answer');
  expect(dispatched).toEqual(body);
  expect(files.map(file => fs.readFileSync(file))).toEqual(before);
});

it('keeps preview and dispatch on the session-affine account-pool member', async () => {
  const { cwd, context, session, manager, load } = fixture();
  const requests: Record<string, unknown>[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
    }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing account-pool server address');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const connection = (id: string) => ({
      id, provider: 'openai' as const, authType: 'api-key' as const, apiKey: `synthetic-${id}`,
      baseUrl, model: 'fixture', status: 'connected' as const,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    });
    const config: RuntimeConfig = {
      ...context.runtimeConfig,
      provider: 'openai',
      activeProviderConnectionId: undefined,
      providerConnections: [connection('first'), connection('second')],
      accountPool: { openai: { connections: ['first', 'second'] } },
      enableMcpTools: false,
      toolDiscovery: 'dynamic',
      maxOutputTokens: 32,
      reserveTokens: 0,
      retryEnabled: false,
      retryMaxRetries: 0,
      providerRetryMaxRetries: 0,
      providerConnectTimeoutMs: 3_000,
      providerHeadersTimeoutMs: 3_000,
      providerBodyTimeoutMs: 3_000,
    };
    const catalog = context.configuration.current.catalog.map(provider => ({
      ...provider,
      baseUrl,
      models: [{ id: 'fixture', name: 'Fixture', vision: false, contextWindow: 100_000, maxTokens: 32 }],
    }));
    const resolveTarget = vi.fn((candidate: RuntimeConfig, sessionId?: string) =>
      resolveCliCredential(candidate, {}, {}, sessionId));
    Object.assign(context, {
      runtimeConfig: config,
      resolveConfigTarget: resolveTarget,
      configuration: new ConfigState(config, configurationBinding(context), catalog),
    });
    expect(selectPooledConnection({
      config, provider: 'openai', connectionId: 'second', sessionId: session.id,
    })).toMatchObject({ connection: { id: 'second' } });

    const wire = vi.spyOn(endpoints, 'endpointTurnBody');
    const preview = await load('question');
    preview.verify();
    const previewBody = JSON.parse(JSON.stringify(wire.mock.results.at(-1)!.value));
    expect(resolveTarget).toHaveBeenCalledWith(config, session.id);

    const tools = foregroundTools(context);
    const prepared = await preparePromptRequest({
      workspaceRoot: cwd,
      sessionId: session.id,
      runtimeConfig: config,
      skillOptions: context.skillOptions,
      agentMode: 'build',
      featureTools: tools,
    });
    const signal = new AbortController().signal;
    const injected = await context.preparePromptContext!('question', signal);
    const captured = await readPromptPreview(manager, session, cwd, 'question');
    const resolution = resolveTarget(config, session.id);
    expect(resolution.credential?.connectionId).toBe('second');
    const step = createProviderStep({
      providerMode: 'real',
      providerCredentialResolution: resolution,
      runtimeConfig: config,
      providerCatalog: catalog,
      agentMode: 'build',
      workspaceRoot: cwd,
      sessionId: session.id,
      ...captureThinkingPreference(cwd, resolution.thinkingEffort),
    }, prepared.currentTools(), prepared.promptContext);
    let acceptedPromptIdentity: unknown;
    const result = await step([openingMessage({
      workspaceRoot: cwd,
      workspaceRoots: session.workspaceRoots,
      permissionScope: 'ask',
      goalObjective: captured.goalObjective,
      continuityContext: captured.continuityContextFor('question'),
      prompt: injected.prompt,
    })], signal, {}, { allowTools: true, onRequestSent: sent => { acceptedPromptIdentity = sent.promptIdentity; } });

    expect(result.stopReason).toBe('stop');
    expect(requests).toEqual([previewBody]);
    const identity = getSessionUsage(session.id).lastPromptIdentity;
    expect(identity).toMatchObject({
      schemaDigest: preview.estimate.identity.schemaDigest,
      systemDigest: preview.estimate.identity.systemDigest,
      historyDigest: preview.estimate.identity.historyDigest,
      wireHistoryDigest: preview.estimate.identity.wireHistoryDigest,
      wireMessageCount: preview.estimate.identity.wireMessageCount,
      replayBinding: preview.estimate.identity.replayBinding,
    });
    expect(acceptedPromptIdentity).toMatchObject({
      provider: resolution.provider,
      model: resolution.model,
      schemaDigest: preview.estimate.identity.schemaDigest,
      systemDigest: preview.estimate.identity.systemDigest,
      historyDigest: preview.estimate.identity.historyDigest,
      wireHistoryDigest: preview.estimate.identity.wireHistoryDigest,
      wireMessageCount: preview.estimate.identity.wireMessageCount,
      replayBinding: preview.estimate.identity.replayBinding,
    });
    const selectedCredential = credentialIdentityFor(resolution.provider, resolution.credential)!;
    noteCredentialRateLimit(selectedCredential, 30_000);
    expect(() => preview.verify()).toThrow('target changed');
  } finally {
    resetCredentialBackoffForTests();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

it('rejects tool history for a model that cannot call tools before request construction', async () => {
  const { layout, load, session } = fixture({ toolCalling: false });
  const history: SessionMessage[] = [
    { role: 'user', content: 'read the file', timestamp: '2026-10-26T00:00:00.000Z' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'read-1', type: 'function',
      function: { name: 'read', arguments: '{"path":"boundary.txt"}' } }], timestamp: '2026-10-26T00:00:01.000Z' },
    { role: 'tool', content: 'boundary contents', tool_call_id: 'read-1', timestamp: '2026-10-26T00:00:02.000Z' },
  ];
  session.turns.push(...history);
  for (const message of history) appendTranscriptEvent(layout.transcriptPath, createMessageTranscriptEvent(message));
  const wire = vi.spyOn(endpoints, 'endpointTurnBody');

  await expect(load('continue')).rejects.toThrow('does not support tool history');
  expect(wire).not.toHaveBeenCalled();
});

const previewDispatchCases = [
  ...(['dynamic', 'full'] as const).flatMap(toolDiscovery => [1, 2].flatMap(maxTurns => [
    { capability: 'unknown', toolCalling: undefined, toolDiscovery, maxTurns, agentMode: 'build' as const },
    { capability: 'no-tools', toolCalling: false, toolDiscovery, maxTurns, agentMode: 'build' as const },
  ])),
  { capability: 'no-tools-plan', toolCalling: false, toolDiscovery: 'dynamic' as const, maxTurns: 2, agentMode: 'plan' as const },
];
it.each(previewDispatchCases)(
  'matches preview and closing policy for $capability capability with $toolDiscovery tools and $maxTurns steps',
  async ({ toolCalling, toolDiscovery, maxTurns, agentMode }) => {
    const { cwd, context, session, manager, load, layout, gateway, target } = fixture({ toolCalling });
    const config = { ...context.configuration.current.config, maxTurns, toolDiscovery, allowedTools: ['read'] };
    Object.assign(context, { runtimeConfig: config, configuration: new ConfigState(config, configurationBinding(context), context.configuration.current.catalog) });
    const files = [layout.metadataPath, layout.statePath, layout.transcriptPath], before = files.map(file => fs.readFileSync(file));
    const prompt = 'Inspect the boundary 中文 🙂.';
    const wire = vi.spyOn(endpoints, 'endpointTurnBody');
    const preview = await load(prompt, undefined, undefined, agentMode); preview.verify();
    const previewBody = JSON.parse(JSON.stringify(wire.mock.results.at(-1)!.value));
    const prepared = await preparePromptRequest({ workspaceRoot: cwd, sessionId: session.id, runtimeConfig: config,
      skillOptions: context.skillOptions, agentMode, featureTools: foregroundTools(context) });
    const captured = await readPromptPreview(manager, session, cwd, prompt);
    const bodies: Record<string, unknown>[] = [];
    let firstIdentity: ReturnType<typeof getSessionUsage>['lastPromptIdentity'];
    let firstContext: ReturnType<typeof getSessionUsage>['requestContext'];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const callsTool = toolCalling !== false && maxTurns > 1 && bodies.length === 1;
      return new Response(JSON.stringify({ choices: [{
        message: callsTool
          ? { content: '', tool_calls: [{ id: 'read-1', type: 'function',
            function: { name: 'read', arguments: '{"path":"boundary.txt"}' } }] }
          : { content: 'done' },
        finish_reason: callsTool ? 'tool_calls' : 'stop',
      }],
        usage: { prompt_tokens: 123, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
    });
    const readTool: ToolDefinition = {
      name: 'read',
      description: 'Read a fixture file.',
      argsSchema: { type: 'object', properties: {} },
      execute: async () => ({ success: true, output: 'boundary contents' }),
    };
    const baseStep = createStepFunction({ provider: { ...target, headers: {} }, workspaceRoot: cwd, sessionId: session.id,
      systemPrompt: prepared.system.text, systemPromptSources: prepared.system.sources,
      systemPromptFor: (requestAgentMode, toolNames, toolsAvailable = true) =>
        buildSystemPrompt(requestAgentMode ?? agentMode, { ...prepared.promptContext, toolNames }, toolsAvailable),
      tools: toolSchemas(prepared.tools), toolSnapshot: () => toolSchemas(prepared.currentTools()),
      catalog: context.configuration.current.catalog, temperature: config.temperature, topP: config.topP,
      maxOutputTokens: configuredOutputLimit(config, endpoints.DEFAULT_ENDPOINT_KIND), fetchImpl });
    const step: typeof baseStep = async (...args) => {
      const result = await baseStep(...args);
      if (firstIdentity === undefined) {
        const first = getSessionUsage(session.id);
        firstIdentity = first.lastPromptIdentity;
        firstContext = first.requestContext;
      }
      return result;
    };
    try {
      const run = runTurn({ sessionId: session.id, workspaceRoot: cwd, history: [], prompt, agentMode, permissionScope: 'ask',
        continuityContext: captured.continuityContextFor(prompt), goalObjective: captured.goalObjective,
        step, tools: new Map([['read', readTool]]), maxSteps: maxTurns, onMessage: vi.fn(), signal: new AbortController().signal,
        hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher });
      for await (const _event of run.events) { /* Drain the real step lifecycle. */ }
      expect(fetchImpl).toHaveBeenCalledTimes(toolCalling !== false && maxTurns > 1 ? 2 : 1);
      const usage = getSessionUsage(session.id);
      expect(usage.turnsCount).toBe(toolCalling !== false && maxTurns > 1 ? 2 : 1);
      expect(bodies[0]).toEqual(previewBody);
      expect(bodies[0]?.tools !== undefined).toBe(toolCalling !== false && maxTurns > 1);
      expect(JSON.stringify(bodies[0]?.messages).includes('You have reached the limit of steps'))
        .toBe(toolCalling !== false && maxTurns === 1);
      const closing = bodies.at(-1);
      expect(closing?.tools).toBeUndefined();
      expect(JSON.stringify(closing?.messages).includes('You have reached the limit of steps')).toBe(toolCalling !== false);
      expect(preview.estimate.identity.schemaDigest).toBe(firstIdentity?.schemaDigest);
      expect(preview.estimate.identity.systemDigest).toBe(firstIdentity?.systemDigest);
      expect(preview.estimate.identity.historyDigest).toBe(firstIdentity?.historyDigest);
      expect(preview.estimate.tokens).toBe(firstContext?.localEstimate?.tokens);
      expect(usage.requestContext?.promptTokens).toBe(123);
      expect(files.map(file => fs.readFileSync(file))).toEqual(before);
      expect(gateway.snapshot).not.toHaveBeenCalled(); expect(gateway.refresh).not.toHaveBeenCalled();
    } finally { resetSessionUsage(session.id); }
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
