import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createAgentSession, type AgentSession} from './agentSession.js';
import {DefaultResourceLoader} from './resourceLoader.js';
import type {ExtensionAPI} from '../extensions/runtime/inProcessLoader.js';
import {createSessionStoreLayout, locateExistingSessionLayout} from '../session/store/sessionFileLayout.js';
import {createCompactLiveCheckpointStore, updateLatestCompactCheckpoint} from '../context/compact/checkpoint/compactLiveCheckpoint.js';
import {createCompactInjectionStateStore} from '../context/compact/injection/compactInjectionState.js';
import {runCompactCommand} from '../context/compact/command/compactCommandRunner.js';
import {profileScope} from '../core/paths/profile/scope.js';
import {messageToText} from '../model-adapters/multimodal.js';
import {registerCatalogContribution} from '../core/catalog/contributions.js';

let root: string;
const sessions: AgentSession[] = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, {recursive:true});
  root = fs.mkdtempSync(path.join(temporary, 'sdk-input-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(async () => {
  for(const session of sessions.splice(0)) await session.dispose().catch(() => {});
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, {recursive:true, force:true});
});
async function fixture(factory: (api: ExtensionAPI) => unknown, options: Partial<Parameters<typeof createAgentSession>[0]> = {}) {
  const loader = new DefaultResourceLoader({cwd:root, noSkills:true, noThemes:true, noContextFiles:true, extensionFactories:[factory]});
  await loader.reload(); const {session} = await createAgentSession({cwd:root, resourceLoader:loader, noTools:'all', ...options}); sessions.push(session);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), session.sessionId);
  const bytes = () => [layout.metadataPath, layout.statePath, layout.transcriptPath].map(file => fs.readFileSync(file));
  return {session, loader, bytes, layout};
}
function held() {let release!: () => void; const promise = new Promise<void>(resolve => {release = resolve;}); return {promise, release};}

it('chains input text transformations before saving the prompt and dispatching the model', async () => {
  const seen: unknown[] = [];
  const {session} = await fixture(api => {
    api.on('input', event => {seen.push(event); return {action:'transform', text:'Effective first'};});
    api.on('input', event => {seen.push(event); return {action:'transform', text:'Effective final'};});
  });
  const metadata = {caller:{request:'original'}};
  const output = await session.prompt('Original user text', {promptMetadata:metadata});
  expect(output).toContain('Effective final'); expect(output).not.toContain('Original user text');
  expect(seen[0]).toMatchObject({type:'input', text:'Original user text', prompt:'Original user text', source:'sdk'});
  expect(seen[1]).toMatchObject({type:'input', text:'Effective first', prompt:'Effective first', source:'sdk'});
  expect(Object.isFrozen(seen[0])).toBe(true);
  const user = session.getState().turns.find(message => message.role === 'user')!;
  expect(user.content).toBe('Effective final'); expect(user.metadata).toMatchObject(metadata);
  expect(session.getState().turns.some(message => message.content === 'Original user text')).toBe(false);
});

it('handles input with an optional report without writing a prompt or a completed answer', async () => {
  const seen: unknown[] = [], later = vi.fn();
  const {session} = await fixture(api => {
    api.on('input', async () => {await api.appendEntry('handled', 'Application handled input'); return {action:'handled'};});
    api.on('input', later);
  });
  session.subscribe(event => {seen.push(event);});
  const barrier = vi.spyOn(session.sessionManager, 'persistUserPromptBarrier'), completed = vi.spyOn(session.sessionManager, 'saveCompleted');
  expect(await session.prompt('Handle locally')).toBe('');
  expect(barrier).not.toHaveBeenCalled(); expect(completed).not.toHaveBeenCalled(); expect(later).not.toHaveBeenCalled();
  expect(session.getState().turns).toEqual([]); expect(session.getState().reports?.some(report => JSON.stringify(report).includes('Application handled input'))).toBe(true);
  expect(session.sessionRuntime.isRunning()).toBe(false); expect(session.sessionRuntime.getState()).toBe('idle');
  expect(seen).toContainEqual(expect.objectContaining({type:'input.handled', sessionId:session.sessionId}));
  expect(seen.some(event => (event as {type:string}).type === 'query.completed')).toBe(false);
});

it('keeps legacy UserPromptSubmit veto effective when native input reports handled', async () => {
  const {session, bytes} = await fixture(api => {
    api.on('input', () => ({action:'handled'}));
    api.on('UserPromptSubmit', () => ({decision:'block', reason:'Legacy submission refused'}));
  });
  const before = bytes();
  await expect(session.prompt('Must remain blocked')).rejects.toThrow(/refused|block/i);
  expect(bytes()).toEqual(before); expect(session.getState().turns).toEqual([]);
});

it.each(['throw','getter','unknown'] as const)('refuses an unverified legacy submission while native input is handled (%s)', async kind => {
  const effect = vi.fn(() => 'allow');
  const {session, bytes} = await fixture(api => {
    api.on('input', () => ({action:'handled'}));
    api.on('UserPromptSubmit', () => {
      if(kind === 'throw') throw new Error('PRIVATE_SUBMISSION_FAILURE');
      if(kind === 'getter') return Object.defineProperty({}, 'decision', {enumerable:true, get:effect});
      return {decision:'unknown'};
    });
  });
  const before = bytes();
  await expect(session.prompt('Handled locally')).rejects.toThrow(/input|refused/i);
  expect(effect).not.toHaveBeenCalled(); expect(bytes()).toEqual(before);
});

it('dispatches native input and legacy submission once with the effective text', async () => {
  const seen: unknown[] = [];
  const {session} = await fixture(api => {
    api.on('input', event => {seen.push(['input', event]); return {action:'transform', text:'Changed'};});
    api.on('UserPromptSubmit', event => {seen.push(['legacy', event]); return {decision:'allow'};});
  });
  await session.prompt('Original');
  expect(seen).toHaveLength(2);
  expect(seen[1]).toEqual(['legacy', expect.objectContaining({eventName:'UserPromptSubmit', prompt:'Changed'})]);
});

it.each(['accessor','toJSON','blank','invalid-images'] as const)('refuses malformed input results before prompt publication (%s)', async kind => {
  let getters = 0;
  const {session, bytes} = await fixture(api => api.on('input', () => {
    if(kind === 'accessor') return Object.defineProperty({}, 'action', {enumerable:true, get(){getters++; return 'handled';}});
    if(kind === 'toJSON') return {toJSON(){getters++; return {action:'continue'};}, action:'transform', text:'Changed'};
    if(kind === 'blank') return {action:'transform', text:'   '};
    return {action:'transform', text:'Changed', images:[{type:'image', data:'AA==', mimeType:'image/png'}]};
  }));
  const before = bytes();
  await expect(session.prompt('Original')).rejects.toThrow(/input|image|refused/i);
  expect(bytes()).toEqual(before); expect(getters).toBe(0); expect(session.getState().turns).toEqual([]);
});

it('rejects transformation of exact approved provenance without rewriting the original metadata', async () => {
  const {session, bytes} = await fixture(api => api.on('input', () => ({action:'transform', text:'Changed approved prompt'})));
  const before = bytes(), metadata = {collaboration:{acceptanceId:'original-approved'}};
  await expect(session.prompt('Original approved prompt', {promptMetadata:metadata})).rejects.toThrow(/input|provenance|approved/i);
  expect(bytes()).toEqual(before); expect(metadata).toEqual({collaboration:{acceptanceId:'original-approved'}});
});

it('cancels a pending input handler and discards its late text without persisting refusal state', async () => {
  const reached = held(), wait = held();
  const {session, bytes} = await fixture(api => api.on('input', async () => {reached.release(); await wait.promise; return {action:'transform', text:'Late text'};}));
  const before = bytes(), pending = session.prompt('Original'); void pending.catch(() => {});
  await reached.promise; await session.abort();
  try {await expect(pending).rejects.toThrow(); expect(bytes()).toEqual(before);}
  finally {wait.release();}
  expect(session.sessionRuntime.isRunning()).toBe(false);
});

it('rejects an input result whose original loader generation retired during its handler', async () => {
  const reached = held(), wait = held();
  const {session, loader, bytes} = await fixture(api => api.on('input', async () => {reached.release(); await wait.promise; return {action:'transform', text:'Retired text'};}));
  const before = bytes(), pending = session.prompt('Original'); void pending.catch(() => {});
  await reached.promise; loader.captureRetirement()(); wait.release();
  await expect(pending).rejects.toThrow(/input|retired|refused/i); expect(bytes()).toEqual(before);
});

it('rejects a replaced session after input callbacks and leaves the replacement untouched', async () => {
  const reached = held(), wait = held();
  const {session, bytes} = await fixture(api => api.on('input', async () => {reached.release(); await wait.promise; return {action:'transform', text:'Late text'};}));
  const before = bytes(), pending = session.prompt('Original'); void pending.catch(() => {});
  await reached.promise; const replacement = session.sessionManager.createNew(root); session.runtimeContext.session = replacement; wait.release();
  await expect(pending).rejects.toThrow(/input|session|refused/i); expect(bytes()).toEqual(before);
  expect(session.runtimeContext.session).toBe(replacement); expect(session.sessionManager.getSession(replacement.id)?.turns).toEqual([]);
});

it('rejects saved conversation changes while input processing is pending', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture(api => api.on('input', async () => {reached.release(); await wait.promise; return {action:'transform', text:'Stale text'};}));
  const pending = session.prompt('Original'); void pending.catch(() => {}); await reached.promise;
  session.sessionManager.addTurn(session.sessionId, {role:'user', content:'Competing saved message'}); wait.release();
  await expect(pending).rejects.toThrow(/input|session|refused/i);
  expect(session.getState().turns.map(message => message.content)).toEqual(['Competing saved message']);
});

it('accepts two ordinary prompts while capturing the current saved session at each submission', async () => {
  const seen: string[] = [];
  const {session} = await fixture(api => api.on('input', event => {seen.push(event.text); return {action:'transform', text:`Effective ${event.text}`};}));
  expect(await session.prompt('first')).toContain('Effective first');
  expect(await session.prompt('second')).toContain('Effective second');
  expect(seen).toEqual(['first', 'second']);
  expect(session.getState().turns.filter(message => message.role === 'user').map(message => message.content))
    .toEqual(['Effective first', 'Effective second']);
});

it('uses the original metadata snapshot after an asynchronous input callback', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture(api => api.on('input', async () => {reached.release(); await wait.promise; return {action:'continue'};}));
  const metadata = {caller:{request:'original'}}, pending = session.prompt('Original', {promptMetadata:metadata});
  await reached.promise; metadata.caller.request = 'replacement'; wait.release(); await pending;
  expect(session.getState().turns.find(message => message.role === 'user')?.metadata)
    .toEqual({caller:{request:'original'}});
  expect(metadata.caller.request).toBe('replacement');
});

it('retains exact provenance when its caller removes the metadata during input preparation', async () => {
  const reached = held(), wait = held();
  const {session, bytes} = await fixture(api => api.on('input', async () => {reached.release(); await wait.promise; return {action:'transform', text:'Changed'};}));
  const metadata: Record<string, unknown> = {collaboration:{acceptanceId:'original-approved'}};
  const before = bytes(), pending = session.prompt('Original approved', {promptMetadata:metadata}); void pending.catch(() => {});
  await reached.promise; delete metadata.collaboration; wait.release();
  await expect(pending).rejects.toThrow(/input|provenance|refused/i); expect(bytes()).toEqual(before);
});

it.each(['accessor','toJSON'] as const)('refuses unsafe metadata before calling input handlers or writing session files (%s)', async kind => {
  const handler = vi.fn(() => ({action:'continue' as const})), effect = vi.fn(() => 'unsafe');
  const {session, bytes} = await fixture(api => api.on('input', handler));
  const metadata: Record<string, unknown> = {};
  if(kind === 'accessor') Object.defineProperty(metadata, 'collaboration', {enumerable:true, get:effect});
  else metadata.toJSON = effect;
  const before = bytes();
  await expect(session.prompt('Original', {promptMetadata:metadata})).rejects.toThrow(/input|metadata|refused/i);
  expect(handler).not.toHaveBeenCalled(); expect(effect).not.toHaveBeenCalled(); expect(bytes()).toEqual(before);
});

it('sends transformed input once when a pending compact context frames the request', async () => {
  const seen: (readonly import('../core/agent/state.js').AgentMessage[])[] = [];
  const {session} = await fixture(api => api.on('input', () => ({action:'transform', text:'Effective requested task'})), {
    convertToLlm:messages => {seen.push(messages.slice()); return messages.map(message => ({role:message.role === 'custom' ? 'user' as const : message.role, content:message.content}));},
  });
  const checkpointStore = createCompactLiveCheckpointStore(), injectionStateStore = createCompactInjectionStateStore();
  const sessionScopeId = profileScope(`session:${session.sessionId}`);
  const checkpoint = updateLatestCompactCheckpoint(checkpointStore, {sessionScopeId, sourceCommand:'/compact', result:runCompactCommand({
    mode:'render', source:'route', generatedAt:'2026-11-19T00:00:00.000Z', taskGoal:{objective:'Saved compact context'},
    routeInfo:{name:'Input framing', nextAction:'Use the effective request.'},
  })});
  injectionStateStore.markPending({sessionScopeId, sourceCommand:'/compact', checkpointId:checkpoint.checkpointId});
  const dependencies = (session.sessionRuntime as unknown as {deps:{compactCheckpointStore:typeof checkpointStore; compactInjectionStateStore:typeof injectionStateStore}}).deps;
  dependencies.compactCheckpointStore = checkpointStore; dependencies.compactInjectionStateStore = injectionStateStore;
  const output = await session.prompt('Original requested task');
  expect(output).toContain('Effective requested task');
  expect(seen).not.toHaveLength(0);
  for(const messages of seen) expect(messages.filter(message => message.role === 'user').map(message => messageToText(message.content)))
    .toEqual([expect.stringContaining('<compact_v2_injected_context>')]);
  expect(session.getState().turns.filter(message => message.role === 'user').map(message => messageToText(message.content)))
    .toEqual(['Effective requested task']);
});

it.each(['retain','replace','remove'] as const)('uses one image snapshot for saved and dispatched transformed input (%s)', async mode => {
  const image = {type:'image' as const, mimeType:'image/png', data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='};
  const replacement = {...image, data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1cAAAAASUVORK5CYII='};
  const reached = held(), wait = held(), seen: (readonly import('../core/agent/state.js').AgentMessage[])[] = [];
  const {session} = await fixture(api => api.on('input', async event => {
    expect(event.images).toEqual([image]); reached.release(); await wait.promise;
    return {action:'transform', text:mode === 'replace' ? '' : 'Effective image question',
      ...(mode === 'remove' ? {images:[]} : mode === 'replace' ? {images:[replacement]} : {})};
  }), {convertToLlm:messages => {seen.push(messages.slice()); return messages.map(message => ({role:message.role === 'custom' ? 'user' as const : message.role, content:message.content}));}});
  const original = {...image}, attachments = {images:[original]}, pending = session.prompt('Original image question', {attachments});
  await reached.promise; original.data = 'invalid-caller-change'; attachments.images = []; wait.release(); await pending;
  const expected = mode === 'remove' ? [] : mode === 'replace' ? [replacement] : [image];
  const saved = session.getState().turns.find(message => message.role === 'user')!.content;
  expect(Array.isArray(saved) ? saved.filter(block => block.type === 'image') : []).toEqual(expected);
  expect(seen).not.toHaveLength(0);
  for(const messages of seen) {
    const opening = messages.find(message => message.role === 'user')!.content;
    expect(Array.isArray(opening) ? opening.filter(block => block.type === 'image') : []).toEqual(expected);
  }
});

it('captures raw contribution input results before Promise assimilation', async () => {
  const {session, bytes} = await fixture(() => {}), effect = vi.fn(() => undefined);
  const remove = registerCatalogContribution({root, sessionId:session.sessionId, commands:[], tools:[], skills:() => [],
    onEvent:(_name => Object.defineProperty({action:'transform', text:'Unsafe'}, 'then', {enumerable:true, get:effect})) as never});
  const before = bytes();
  try {
    await expect(session.prompt('Original')).rejects.toThrow(/input|refused/i);
    expect(effect).not.toHaveBeenCalled(); expect(bytes()).toEqual(before);
  } finally {remove();}
});

it('refuses saved history changes after the prompt barrier while startup hooks wait', async () => {
  const reached = held(), wait = held();
  const {session} = await fixture(api => api.on('SessionStart', async () => {reached.release(); await wait.promise; return {decision:'allow'};}));
  const pending = session.prompt('Original admitted input'); void pending.catch(() => {}); await reached.promise;
  session.sessionManager.addTurn(session.sessionId, {role:'user', content:'Competing saved input'}); wait.release();
  await expect(pending).rejects.toThrow(/input|saved|history|changed|refused/i);
  expect(session.getState().turns.filter(message => message.role === 'assistant')).toEqual([]);
});

it('leaves a competing saved state untouched when startup is cancelled before query events exist', async () => {
  const reached = held(), wait = held();
  const {session, bytes} = await fixture(api => api.on('SessionStart', async () => {reached.release(); await wait.promise; return {decision:'allow'};}));
  const pending = session.prompt('Admitted pending input'); void pending.catch(() => {}); await reached.promise;
  session.sessionManager.addTurn(session.sessionId, {role:'user', content:'Competing saved input'});
  const before = bytes(), cancelled = session.abort(); wait.release(); await cancelled;
  await expect(pending).rejects.toThrow(); expect(bytes()).toEqual(before);
  expect(session.getState().turns.map(message => messageToText(message.content))).toEqual(['Admitted pending input','Competing saved input']);
});

it('does not coerce a malformed in-process submission decision into an allow', async () => {
  const {session, bytes} = await fixture(api => api.on('input', () => ({action:'handled'})));
  const {defaultHookDispatcher} = await import('../core/hooks/hookDispatcher.js');
  defaultHookDispatcher.registerInProcessHook({event:'UserPromptSubmit', handler:() => ({decision:['block']} as never)});
  const before = bytes();
  try {await expect(session.prompt('Must refuse')).rejects.toThrow(/input|refused/i); expect(bytes()).toEqual(before);}
  finally {defaultHookDispatcher.clear();}
});

it.each(['UserPromptSubmit','SessionStart'] as const)('preserves native declared-hook approval audit during %s admission', async event => {
  fs.mkdirSync(path.join(root,'.agents'), {recursive:true});
  fs.writeFileSync(path.join(root,'.agents/hooks.json'), JSON.stringify({hooks:{[event]:[{hooks:[{type:'command',command:"printf '%s' '{\"decision\":\"allow\"}'"}]}]}}));
  const {session} = await fixture(api => api.on('input', () => ({action:'transform', text:'Effective approved input'})), {nonInteractiveApproval:'allow-once'});
  const {createCliApprovalEscalationBridge} = await import('../cli/approval/cliApprovalEscalationBridge.js');
  const approval = vi.fn(async () => 'allow-once' as const), native = createCliApprovalEscalationBridge;
  vi.spyOn(await import('../cli/approval/cliApprovalEscalationBridge.js'), 'createCliApprovalEscalationBridge').mockImplementation(input => native({...input, promptInteractiveApproval:approval}));
  expect(await session.prompt('Original')).toContain('Effective approved input');
  expect(approval).toHaveBeenCalledTimes(1);
  const state = JSON.parse(fs.readFileSync(locateExistingSessionLayout(createSessionStoreLayout(),session.sessionId).statePath,'utf8'));
  expect(state.workingMemory.approvalAudit.decision).toBe('allow-once');
  expect(state.workingMemory.approvalAuditHistory).toHaveLength(1);
});

it('settles an attempted provenance admission when its following source check refuses', async () => {
  const {session} = await fixture(() => {});
  const dependencies = (session.sessionRuntime as unknown as {deps:{admitPrompt?:()=>Promise<void>; promptSettled?: (...args:unknown[])=>Promise<void>}}).deps;
  const reached = held(), wait = held(), settle = vi.fn(async () => {});
  dependencies.admitPrompt = async () => {reached.release(); await wait.promise;}; dependencies.promptSettled = settle;
  const pending = session.prompt('Admitted provenance'); void pending.catch(() => {}); await reached.promise;
  session.sessionManager.addTurn(session.sessionId, {role:'user',content:'Competing source'}); wait.release();
  await expect(pending).rejects.toThrow(/input|changed|refused/i);
  expect(settle).toHaveBeenCalledTimes(1); expect(settle.mock.calls[0]?.at(-1)).toBe('failed');
});
