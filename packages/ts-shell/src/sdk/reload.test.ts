import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createAgentSession, type AgentSession} from './agentSession.js';
import {DefaultResourceLoader} from './resourceLoader.js';
import type {ExtensionAPI} from '../extensions/runtime/inProcessLoader.js';
import {catalogContributions} from '../core/catalog/contributions.js';
import {configurationAdmission, initialConfiguration} from '../core/shell/configuration.js';
import {readSessionModel, readSessionModelEdit, writeSessionModel} from '../session/model/state.js';
import {bindExtensionUiFor, extensionHostFor, installExtensionHost} from '../cli/runtime/extensions/host.js';
import {installExtensionRuntime} from '../cli/runtime/extensions.js';
import {HookDispatcher} from '../core/hooks/hookDispatcher.js';
import {createSessionStoreLayout, locateExistingSessionLayout} from '../session/store/sessionFileLayout.js';
import {ExtensionService} from '../extensions/service.js';
import {refreshShellRuntimeConfig} from '../core/shell/runtimeContext.js';
import {getRuntimeConfig} from '../config/runtimeConfig.js';

let root: string;
const sessions: AgentSession[] = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, {recursive:true});
  root = fs.mkdtempSync(path.join(temporary, 'sdk-reload-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
  fs.writeFileSync(path.join(root, 'note.txt'), 'Original workspace');
});
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose().catch(() => {});
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, {recursive:true, force:true});
});
function held() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return {promise, release};
}
async function fixture(factory: (api: ExtensionAPI, generation: number) => unknown, options: Parameters<typeof createAgentSession>[0] = {}, loaderOptions: ConstructorParameters<typeof DefaultResourceLoader>[0] = {}) {
  const apis: ExtensionAPI[] = [];
  const loader = new DefaultResourceLoader({cwd:root, noSkills:true, noThemes:true, ...loaderOptions,
    extensionFactories:[api => { apis.push(api); return factory(api, apis.length); }]});
  await loader.reload();
  const {session} = await createAgentSession({cwd:root, resourceLoader:loader, ...options}); sessions.push(session);
  return {session, loader, apis};
}
function command(api: ExtensionAPI, name: string) {
  api.registerCommand({name, description:name, execute:async () => name});
  api.registerTool({name, description:name, argsSchema:{type:'object'}, execute:async () => ({success:true, output:name})});
}
function customReceiptLoader(factory: (api: ExtensionAPI) => unknown,
  wrap: (receipt: Awaited<ReturnType<ReturnType<DefaultResourceLoader['captureReload']>['reload']>>) => Awaited<ReturnType<ReturnType<DefaultResourceLoader['captureReload']>['reload']>>) {
  const loader = new DefaultResourceLoader({cwd:root, noSkills:true, noThemes:true, extensionFactories:[factory]});
  return {loader, prepare:async () => {
    await loader.reload(); const lease = loader.captureReload(), reload = lease.reload.bind(lease);
    lease.reload = async options => wrap(await reload(options));
    vi.spyOn(loader, 'captureReload').mockReturnValue(lease);
    const {session} = await createAgentSession({cwd:root, resourceLoader:loader, noTools:'all'});
    sessions.push(session); return session;
  }};
}

it('reloads the exact SDK resources after shutdown, preserves custom tools and binds UI before successor start', async () => {
  const events: string[] = [], observations: unknown[] = [];
  const confirm = vi.fn(async () => true);
  const custom = {name:'caller_tool', description:'Caller', argsSchema:{type:'object'}, execute:async () => ({success:true, output:'Caller'})};
  const {session, apis} = await fixture((api, generation) => {
    command(api, 'loaded_' + generation);
    api.on('session_shutdown', event => { events.push('shutdown:' + generation + ':' + event.reason); });
    api.on('session_start', async event => {
      events.push('start:' + generation + ':' + event.reason);
      if (event.reason === 'reload') observations.push({confirmed:await api.ui.confirm('Reload', 'Bound'),
        commands:await api.getCommands(), tools:await api.getActiveTools(), text:await api.readWorkspaceFile('note.txt')});
    });
  }, {noTools:'builtin', customTools:[custom], ui:{confirm}});
  const original = session.runtimeContext.session, oldHost = extensionHostFor(session.runtimeContext);
  writeSessionModel(session.sessionId, {provider:'openai', model:'caller-model', connectionScope:'provider'}, readSessionModelEdit(session.sessionId));
  const selected = readSessionModel(session.sessionId);
  const result = await session.reload();
  expect(result).toMatchObject({status:'reloaded', diagnostics:[]});
  expect(events).toEqual(['start:1:startup', 'shutdown:1:reload', 'start:2:reload']);
  expect(observations).toEqual([{confirmed:true, commands:expect.arrayContaining(['loaded_2']), tools:['caller_tool','loaded_2'], text:'Original workspace'}]);
  expect(confirm).toHaveBeenCalledOnce(); expect(session.runtimeContext.session).toBe(original);
  expect(session.sessionId).toBe(original.id); expect(readSessionModel(session.sessionId)).toEqual(selected);
  expect(extensionHostFor(session.runtimeContext)).not.toBe(oldHost);
  expect(await apis[1]!.getCommands()).not.toContain('loaded_1');
  expect(() => apis[0]!.getCommands()).toThrow(/retired/);
  expect(catalogContributions(root, session.sessionId).flatMap(entry => entry.tools).map(tool => tool.name)).toEqual(['caller_tool','loaded_2']);
});

it.each(['all', 'builtin', 'selection'] as const)('retains caller tool restrictions across reload (%s)', async mode => {
  const {session, apis} = await fixture((api, generation) => {command(api, 'loaded_' + generation); command(api, 'excluded');},
    {noTools:mode === 'selection' ? undefined : mode, tools:mode === 'selection' ? ['loaded_1','loaded_2','excluded'] : undefined, excludeTools:['excluded']});
  expect((await session.reload()).status).toBe('reloaded');
  expect(await apis[1]!.getActiveTools()).toEqual(mode === 'all' ? [] : ['loaded_2']);
});

it('adopts empty prompt and skill resources and invalidates estimates without reacquiring mutable getters', async () => {
  let empty = false;
  const {session, loader} = await fixture(() => {}, {noTools:'all'}, {
    systemPromptOverride:() => empty ? undefined : 'Old system', appendSystemPromptOverride:() => empty ? [] : ['Old appendix'],
    skillsOverride:() => ({skills:empty ? [] : [{name:'old_skill', description:'Old', body:'Old rule', filePath:path.join(root,'SKILL.md'), source:'cli', disableModelInvocation:false, unhonouredFields:[]}], diagnostics:[]})});
  expect(session.runtimeContext.sdkSkills?.has('old_skill')).toBe(true); empty = true;
  session.runtimeContext.promptIdentity = {} as never;
  vi.spyOn(loader, 'getSkills').mockImplementation(() => {throw new Error('Ambient getters must not be used');});
  vi.spyOn(loader, 'getSystemPrompt').mockImplementation(() => {throw new Error('Ambient getters must not be used');});
  expect((await session.reload()).status).toBe('reloaded');
  expect(session.runtimeContext.systemPrompt).toBeUndefined(); expect(session.runtimeContext.appendSystemPrompt).toEqual([]);
  expect(session.runtimeContext.sdkSkills?.size).toBe(0); expect(session.runtimeContext.promptIdentity).toBeUndefined();
});

it('uses a new captured lease for each successful reload', async () => {
  const {session, apis} = await fixture((api, generation) => command(api, 'loaded_' + generation), {noTools:'builtin'});
  expect((await session.reload()).status).toBe('reloaded'); expect((await session.reload()).status).toBe('reloaded');
  expect(await apis[2]!.getActiveTools()).toEqual(['loaded_3']); expect(() => apis[1]!.getCommands()).toThrow(/retired/);
});

it('joins duplicate reloads and waits for original shutdown before replacing resources', async () => {
  const reached = held(), wait = held(), events: string[] = [];
  const {session} = await fixture((api, generation) => {
    api.on('session_shutdown', async () => {events.push('shutdown:' + generation); reached.release(); await wait.promise;});
    api.on('session_start', event => {if(event.reason === 'reload') events.push('start:' + generation);});
  }, {noTools:'all'});
  const first = session.reload(); await reached.promise; const second = session.reload();
  try {expect(events).toEqual(['shutdown:1']); expect(session.sessionRuntime.isRunning()).toBe(true);}
  finally {wait.release();}
  expect((await first).status).toBe('reloaded'); expect((await second).status).toBe('reloaded');
  expect(events).toEqual(['shutdown:1','start:2']);
});

it('refuses busy or already cancelled reloads before shutdown and leaves original APIs usable', async () => {
  const shutdown = vi.fn(); const {session, apis} = await fixture(api => api.on('session_shutdown', shutdown), {noTools:'all'});
  const wait = held(); const busy = session.sessionRuntime.commands.run(() => wait.promise);
  expect((await session.reload()).status).toBe('refused'); wait.release(); await busy;
  const controller = new AbortController(); controller.abort();
  expect((await session.reload({signal:controller.signal})).status).toBe('refused');
  expect(shutdown).not.toHaveBeenCalled(); expect(await apis[0]!.readWorkspaceFile('note.txt')).toBe('Original workspace');
});

it.each(['before', 'scheduled'] as const)('refuses external loader replacement without adopting or disposing its successor (%s)', async timing => {
  const shutdown = vi.fn(); const {session, loader, apis} = await fixture(api => api.on('session_shutdown', shutdown), {noTools:'all'});
  let result: ReturnType<AgentSession['reload']>;
  if (timing === 'before') {await loader.reload(); result = session.reload();}
  else {result = session.reload(); await loader.reload();}
  expect((await result).status).toBe('refused'); expect(shutdown).not.toHaveBeenCalled();
  await session.dispose(); expect(await apis[1]!.readWorkspaceFile('note.txt')).toBe('Original workspace');
});

it('keeps an external successor alive when the loader changes during original shutdown', async () => {
  const reached = held(), wait = held();
  const {session, loader, apis} = await fixture((api, generation) => {
    if (generation === 1) api.on('session_shutdown', async () => {reached.release(); await wait.promise;});
  }, {noTools:'all'});
  const pending = session.reload(); await reached.promise; await loader.reload(); wait.release();
  expect((await pending).status).toBe('unknown'); await session.dispose();
  expect(await apis[1]!.readWorkspaceFile('note.txt')).toBe('Original workspace');
});

it('rejects a replaced loader while its captured successor is loading and never adopts later getters', async () => {
  const reached = held(), wait = held();
  const {session, loader, apis} = await fixture(async (_api, generation) => {
    if (generation === 2) {reached.release(); await wait.promise;}
  }, {noTools:'all'});
  const pending = session.reload(); await reached.promise; await loader.reload(); wait.release();
  expect((await pending).status).toBe('unknown'); await session.dispose();
  expect(await apis[2]!.readWorkspaceFile('note.txt')).toBe('Original workspace');
});

it('cancels a pending initializer without granting reload success or permitting session reentry', async () => {
  const reached = held(), wait = held();
  const {session, apis} = await fixture(async (_api, generation) => {if(generation === 2) {reached.release(); await wait.promise;}}, {noTools:'all'});
  const controller = new AbortController(), pending = session.reload({signal:controller.signal});
  await reached.promise; controller.abort();
  try {
    expect((await pending).status).toBe('unknown'); expect(configurationAdmission(session.runtimeContext)()).toContain('not verified');
    await expect(session.prompt('Must remain blocked')).rejects.toThrow(/not verified/);
    expect(() => apis[1]!.getCommands()).toThrow(/retired/);
  } finally {wait.release();}
});

it('joins reload cancellation before disposal and never waits on its own command', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture(async (_api, generation) => {if(generation === 2) {reached.release(); await wait.promise;}}, {noTools:'all'});
  const pending = session.reload(); await reached.promise; const disposing = session.dispose();
  try {expect((await pending).status).toBe('unknown'); await disposing;}
  finally {wait.release();}
  expect(session.sessionRuntime.isRunning()).toBe(false);
  await expect(session.prompt('Disposed')).rejects.toThrow(/disposed/);
});

it('queues successor startup messages until successful reload settlement without busy failures', async () => {
  const events: string[] = [];
  const {session} = await fixture((api, generation) => {
    api.on('session_start', async event => {
      if (event.reason === 'reload') {events.push('start:' + generation); await api.sendMessage('Reload startup prompt'); events.push('queued');}
    });
    api.on('input', () => {events.push('input');});
  }, {noTools:'all'});
  expect((await session.reload()).status).toBe('reloaded'); await session.waitForIdle();
  expect(events).toEqual(['start:2','queued','input']);
  expect(session.getState().turns.some(message => message.content === 'Reload startup prompt')).toBe(true);
});

it('never resurrects a caller UI binding released during successor startup', async () => {
  const reached = held(), wait = held(), answers: boolean[] = [], confirm = vi.fn(async () => true);
  const {session, apis} = await fixture((api, generation) => {
    if (generation === 2) api.on('session_start', async () => {reached.release(); await wait.promise; answers.push(await api.ui.confirm('Released', 'Stay released'));});
  }, {noTools:'all'});
  const release = session.bindUi({confirm}), pending = session.reload(); await reached.promise; release(); wait.release();
  expect((await pending).status).toBe('reloaded'); expect(answers).toEqual([false]); expect(confirm).not.toHaveBeenCalled();
  expect(await apis[1]!.ui.confirm('Still released', 'Continue')).toBe(false);
});

it('reports partial resource diagnostics and preserves available contributions', async () => {
  const {session, apis} = await fixture((api, generation) => {
    command(api, 'loaded_' + generation);
  }, {noTools:'builtin'}, {extensionsOverride:base => ({...base, errors:[{path:'optional.ts', error:'Optional resource failed'}]})});
  const result = await session.reload(); expect(result).toMatchObject({status:'partial', diagnostics:expect.arrayContaining([expect.objectContaining({kind:'error', message:'Optional resource failed'})])});
  expect(await apis[1]!.getActiveTools()).toEqual(['loaded_2']);
});

it('refuses a loader without guarded reload capability before quiescing its shared host', async () => {
  const shutdown = vi.fn();
  const {session, loader, apis} = await fixture(api => api.on('session_shutdown', shutdown), {noTools:'all'});
  Object.defineProperty(loader, 'captureReload', {value:undefined});
  expect((await session.reload()).status).toBe('refused'); expect(shutdown).not.toHaveBeenCalled();
  expect(await apis[0]!.readWorkspaceFile('note.txt')).toBe('Original workspace');
});

it('keeps installed cleanup failure unknown and never starts new SDK resources', async () => {
  const {session, apis} = await fixture(api => command(api, 'loaded'), {noTools:'all'});
  vi.spyOn(ExtensionService.prototype, 'close').mockRejectedValueOnce(new Error('Cleanup remains unknown'));
  expect((await session.reload()).status).toBe('unknown'); expect(apis).toHaveLength(1);
  expect(configurationAdmission(session.runtimeContext)()).toContain('not verified');
});

it('discards a source configuration change while original shutdown waits', async () => {
  const reached = held(), wait = held();
  const {session, apis} = await fixture((api, generation) => {
    if (generation === 1) api.on('session_shutdown', async () => {reached.release(); await wait.promise;});
  }, {noTools:'all'});
  const pending = session.reload(); await reached.promise;
  session.runtimeContext.configuration = initialConfiguration(session.runtimeContext); wait.release();
  expect((await pending).status).toBe('unknown'); expect(apis).toHaveLength(1);
  expect(configurationAdmission(session.runtimeContext)()).toContain('not verified');
});

it('revokes successor startup messages when caller cancellation reaches a held UI request', async () => {
  const reached = held(); const prompts = vi.fn();
  const {session} = await fixture((api, generation) => {
    if (generation === 2) api.on('session_start', async () => {
      await api.sendMessage('Never accepted startup');
      await api.ui.confirm('Hold', 'Waiting');
    });
    api.on('input', prompts);
  }, {noTools:'all', ui:{confirm:async () => {reached.release(); await new Promise(() => {}); return true;}}});
  const controller = new AbortController(), pending = session.reload({signal:controller.signal});
  await reached.promise; controller.abort(); expect((await pending).status).toBe('unknown');
  await session.waitForIdle(); expect(prompts).not.toHaveBeenCalled();
  expect(session.getState().turns.some(message => message.content === 'Never accepted startup')).toBe(false);
});

it('keeps a synchronous successor host alive when SDK cancellation reenters host installation', async () => {
  const reached = held(); let dialogSignal: AbortSignal | undefined;
  const {session} = await fixture((api, generation) => {
    if (generation === 2) api.on('session_start', async () => {await api.ui.confirm('Reload', 'Wait');});
  }, {noTools:'all', ui:{confirm:async (_title, _text, options) => {dialogSignal = options?.signal; reached.release(); await new Promise(() => {}); return true;}}});
  const controller = new AbortController(), pending = session.reload({signal:controller.signal});
  await reached.promise;
  let successor: ReturnType<typeof extensionHostFor>;
  dialogSignal!.addEventListener('abort', () => {successor = installExtensionHost(session.runtimeContext, session.sessionRuntime, session.sessionManager);}, {once:true});
  controller.abort(); expect((await pending).status).toBe('unknown');
  expect(extensionHostFor(session.runtimeContext)).toBe(successor);
});

it('keeps restrictive caller configuration when recomputing builtin-only extension names', async () => {
  const {session, apis} = await fixture((api, generation) => command(api, 'loaded_' + generation),
    {noTools:'builtin', runtimeConfigOverrides:{allowedTools:['loaded_1']}});
  expect(await apis[0]!.getActiveTools()).toEqual(['loaded_1']);
  expect((await session.reload()).status).toBe('reloaded'); expect(await apis[1]!.getActiveTools()).toEqual([]);
});

it('preserves file-supplied tool restrictions independently from SDK generated names', async () => {
  fs.mkdirSync(path.join(root, '.cheers'), {recursive:true});
  fs.writeFileSync(path.join(root, '.cheers', 'config.json'), JSON.stringify({allowedTools:['loaded_1']}));
  const {session, apis} = await fixture((api, generation) => command(api, 'loaded_' + generation), {noTools:'builtin'});
  expect(await apis[0]!.getActiveTools()).toEqual(['loaded_1']);
  expect((await session.reload()).status).toBe('reloaded'); expect(await apis[1]!.getActiveTools()).toEqual([]);
});

it('preserves successor generated tool choices when ordinary configuration refresh follows reload', async () => {
  const {session, apis} = await fixture((api, generation) => command(api, 'loaded_' + generation), {noTools:'builtin'});
  expect((await session.reload()).status).toBe('reloaded');
  expect(refreshShellRuntimeConfig(session.runtimeContext).status).toBe('applied');
  expect(await apis[1]!.getActiveTools()).toEqual(['loaded_2']);
});

it('waits for every successor startup message including one that begins after the first pending promise', async () => {
  const reached = held(), wait = held(), prompts: string[] = [];
  const {session} = await fixture(api => api.on('session_start', async event => {
    if(event.reason === 'reload') {await api.sendMessage('First'); await api.sendMessage('Second'); await api.sendMessage('Third');}
  }), {noTools:'all'});
  vi.spyOn(session.sessionRuntime, 'executePrompt').mockImplementation(async (_id, text) => {
    prompts.push(text); if (text === 'Third') {reached.release(); await wait.promise;} return text;
  });
  const reload = session.reload(); let idle = false;
  const settled = session.waitForIdle().then(() => {idle = true;});
  await reload; await reached.promise;
  try {await new Promise<void>(resolve => setImmediate(resolve)); expect(idle).toBe(false);}
  finally {wait.release(); await settled;}
  expect(prompts).toEqual(['First','Second','Third']);
});

it('reports a queued startup prompt failure to idle waiters instead of clean settlement', async () => {
  const {session} = await fixture(api => api.on('session_start', async event => {
    if(event.reason === 'reload') await api.sendMessage('Failed startup prompt');
  }), {noTools:'all'});
  vi.spyOn(session.sessionRuntime, 'executePrompt').mockRejectedValue(new Error('Owned startup prompt failed'));
  const reload = session.reload(); const idle = session.waitForIdle();
  void idle.catch(() => {});
  expect((await reload).status).toBe('reloaded'); await expect(idle).rejects.toThrow('Owned startup prompt failed');
});

it('retains a failed earlier startup submission after a later queued prompt succeeds', async () => {
  const prompts: string[] = [];
  const {session} = await fixture(api => api.on('session_start', async event => {
    if(event.reason === 'reload') {await api.sendMessage('Failed first'); await api.sendMessage('Successful second');}
  }), {noTools:'all'});
  vi.spyOn(session.sessionRuntime, 'executePrompt').mockImplementation(async (_id, text) => {
    prompts.push(text); if(text === 'Failed first') throw new Error('Original queued failure'); return text;
  });
  expect((await session.reload()).status).toBe('reloaded');
  await vi.waitFor(() => expect(prompts).toEqual(['Failed first','Successful second']));
  await new Promise<void>(resolve => setImmediate(resolve));
  await expect(session.waitForIdle()).rejects.toThrow('Original queued failure');
});

it('restores the original context-file budget when successor resources enable context files', async () => {
  const options = {cwd:root, noContextFiles:true, noSkills:true, noThemes:true};
  const loader = new DefaultResourceLoader(options); await loader.reload();
  const {session} = await createAgentSession({cwd:root, resourceLoader:loader, noTools:'all', runtimeConfigOverrides:{instructionBudgetBytes:4096}});
  sessions.push(session);
  expect(session.runtimeContext.runtimeConfig.instructionBudgetBytes).toBe(0);
  options.noContextFiles = false;
  expect((await session.reload()).status).toBe('reloaded');
  expect(session.runtimeContext.runtimeConfig.instructionBudgetBytes).toBe(4096);
  expect(session.runtimeContext.runtimeConfigOverrides?.instructionBudgetBytes).toBe(4096);
});

it('intersects explicit supplied-config and override tool restrictions through reload', async () => {
  const runtimeConfig = getRuntimeConfig(root);
  const {session, apis} = await fixture((api, generation) => command(api, 'loaded_' + generation), {
    noTools:'builtin', runtimeConfig:{...runtimeConfig, allowedTools:['loaded_1']},
    runtimeConfigOverrides:{allowedTools:['loaded_1','loaded_2']},
  });
  expect(await apis[0]!.getActiveTools()).toEqual(['loaded_1']);
  expect((await session.reload()).status).toBe('reloaded'); expect(await apis[1]!.getActiveTools()).toEqual([]);
});

it('reports resource projection failure as unknown and retires initialized successor capabilities', async () => {
  let fail = false;
  const {session, apis} = await fixture(() => {}, {noTools:'all'}, {systemPromptOverride:() => {
    if (fail) throw new Error('token=PRIVATE_RESOURCE_ERROR projection failed');
    return 'System';
  }});
  fail = true; const result = await session.reload();
  expect(result.status).toBe('unknown'); expect(JSON.stringify(result)).not.toContain('PRIVATE_RESOURCE_ERROR');
  expect(() => apis[1]!.getCommands()).toThrow(/retired/);
});

it('refuses success after saved conversation changes during resource initialization', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture(async (_api, generation) => {
    if(generation === 2) {reached.release(); await wait.promise;}
  }, {noTools:'all'});
  const pending = session.reload(); await reached.promise;
  session.sessionManager.addTurn(session.sessionId, {role:'user', content:'Competing saved history'});
  wait.release(); expect((await pending).status).toBe('unknown');
});

it('refuses success after same-ID persistent model selection changes during shutdown', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture(api => api.on('session_shutdown', async () => {reached.release(); await wait.promise;}), {noTools:'all'});
  const pending = session.reload(); await reached.promise;
  writeSessionModel(session.sessionId, {provider:'openai', model:'new-selection', connectionScope:'provider'}, readSessionModelEdit(session.sessionId));
  wait.release(); expect((await pending).status).toBe('unknown');
});

it('refuses success after saved transcript prefix replacement during successor startup', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture((api, generation) => {if(generation === 2) api.on('session_start', async () => {reached.release(); await wait.promise;});}, {noTools:'all'});
  const pending = session.reload(); await reached.promise;
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.sessionId);
  fs.writeFileSync(layout.transcriptPath, fs.readFileSync(layout.transcriptPath, 'utf8').replace('"type":"session"', '"type":"tampered"'));
  wait.release(); expect((await pending).status).toBe('unknown');
});

it('keeps diagnostics safe when a custom reload capability returns unredacted errors', async () => {
  const loader = new DefaultResourceLoader({cwd:root, noSkills:true, noThemes:true}); await loader.reload();
  const capture = loader.captureReload.bind(loader);
  const originalLease = capture();
  const reload = originalLease.reload.bind(originalLease);
  originalLease.reload = async options => {
    const receipt = await reload(options);
    return {...receipt, snapshot:{...receipt.snapshot, extensions:{...receipt.snapshot.extensions,
      errors:[{path:'token=PRIVATE_PATH', error:'token=PRIVATE_RESOURCE_ERROR'}]}},
      bind:receipt.bind.bind(receipt), assertCurrent:receipt.assertCurrent.bind(receipt), retire:receipt.retire.bind(receipt), captureReload:receipt.captureReload.bind(receipt)};
  };
  vi.spyOn(loader, 'captureReload').mockReturnValue(originalLease);
  const {session:custom} = await createAgentSession({cwd:root, resourceLoader:loader, noTools:'all'});
  sessions.push(custom);
  const result = await custom.reload();
  expect(result.status).toBe('partial'); expect(JSON.stringify(result)).not.toContain('PRIVATE_RESOURCE_ERROR'); expect(JSON.stringify(result)).not.toContain('PRIVATE_PATH');
});

it('keeps a later accepted file tool restriction when SDK resources reload', async () => {
  const {session, apis} = await fixture((api, generation) => command(api, 'loaded_' + generation), {noTools:'builtin'});
  fs.mkdirSync(path.join(root, '.cheers'), {recursive:true});
  fs.writeFileSync(path.join(root, '.cheers', 'config.json'), JSON.stringify({allowedTools:[]}));
  expect(refreshShellRuntimeConfig(session.runtimeContext).status).toBe('applied');
  expect(await apis[0]!.getActiveTools()).toEqual([]);
  expect((await session.reload()).status).toBe('reloaded'); expect(await apis[1]!.getActiveTools()).toEqual([]);
});

it('retires one captured custom receipt once when cancellation overtakes successor startup', async () => {
  const reached = held(); let count = 0;
  const wrapped = customReceiptLoader(api => api.on('session_start', async event => {
    if(event.reason === 'reload') {reached.release(); await new Promise(() => {});}
  }), receipt => ({snapshot:receipt.snapshot, bind:receipt.bind.bind(receipt), assertCurrent:receipt.assertCurrent.bind(receipt),
    captureReload:receipt.captureReload.bind(receipt), retire:() => {count++; receipt.retire();}}));
  const session = await wrapped.prepare(); const controller = new AbortController(), pending = session.reload({signal:controller.signal});
  await reached.promise; controller.abort(); expect((await pending).status).toBe('unknown');
  await session.dispose(); expect(count).toBe(1);
});

it('returns structured refusal when custom lease admission starts a competing command', async () => {
  const loader = new DefaultResourceLoader({cwd:root, noSkills:true, noThemes:true}); await loader.reload();
  const lease = loader.captureReload(), original = lease.assertCurrent.bind(lease); let session: AgentSession | undefined;
  const wait = held(); let busy: Promise<void> | undefined;
  lease.assertCurrent = (...args) => {original(...args); if (session && !busy) busy = session.sessionRuntime.commands.run(() => wait.promise);};
  vi.spyOn(loader, 'captureReload').mockReturnValue(lease);
  session = (await createAgentSession({cwd:root, resourceLoader:loader, noTools:'all'})).session; sessions.push(session);
  try {await expect(session.reload()).resolves.toMatchObject({status:'refused'});}
  finally {wait.release(); await busy;}
});

it('refuses a source replaced synchronously by custom lease capture before scheduling reload', async () => {
  const shutdown = vi.fn();
  const loader = new DefaultResourceLoader({cwd:root, noSkills:true, noThemes:true, extensionFactories:[api => api.on('session_shutdown', shutdown)]});
  await loader.reload(); const lease = loader.captureReload(), original = lease.assertCurrent.bind(lease);
  let session: AgentSession | undefined, replaced = false;
  lease.assertCurrent = (...args) => {
    original(...args);
    if(session && !replaced) {replaced = true; session.runtimeContext.session = session.sessionManager.createNew(root);}
  };
  vi.spyOn(loader, 'captureReload').mockReturnValue(lease);
  session = (await createAgentSession({cwd:root, resourceLoader:loader, noTools:'all'})).session; sessions.push(session);
  const result = await session.reload(); expect(result.status).toBe('refused'); expect(shutdown).not.toHaveBeenCalled();
});

it('disposes only its original extension owner when reload cancellation installs an outer successor', async () => {
  const reached = held(); let dialogSignal: AbortSignal | undefined;
  const {session} = await fixture((api, generation) => {
    if (generation === 2) api.on('session_start', async () => {await api.ui.confirm('Reload', 'Wait');});
  }, {noTools:'all', ui:{confirm:async (_title, _text, options) => {dialogSignal = options?.signal; reached.release(); await new Promise(() => {}); return true;}}});
  const pending = session.reload(); await reached.promise;
  let successor: ReturnType<typeof extensionHostFor>;
  dialogSignal!.addEventListener('abort', () => {
    installExtensionRuntime(session.runtimeContext, session.sessionRuntime, () => ({sessionId:session.sessionId, workspaceRoot:root,
      hooks:new HookDispatcher(), emit(){}, permissionScope:'ask'}), session.sessionManager);
    successor = extensionHostFor(session.runtimeContext);
    bindExtensionUiFor(session.runtimeContext, {confirm:async () => true});
  }, {once:true});
  const disposed = session.dispose(); expect((await pending).status).toBe('unknown'); await disposed;
  expect(extensionHostFor(session.runtimeContext)).toBe(successor);
  const issue = session.runtimeContext.workspaceIssue; session.runtimeContext.workspaceIssue = undefined;
  try {expect(await successor!.ui!.confirm!('Survives', 'Current')).toBe(true);}
  finally {session.runtimeContext.workspaceIssue = issue;}
});
