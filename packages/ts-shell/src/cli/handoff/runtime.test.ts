import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { BUILTIN_PROVIDERS } from '../../core/models/catalog.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { createProviderReadinessCliTerminalEvent } from '../../entrypoints/providerReadinessCliSurface.js';
import { handoffCommandFor, handoffRunFor, settleHandoffPrompt } from '../runtime/handoff.js';
import { HandoffStore } from '../../workflow/handoff/store.js';
import { armedHandoffs, liveHandoffs } from './state.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { sessionRequestStore } from '../../session/store/requests.js';
import { createRequestPolicy } from '../../core/agent/request/policy.js';
import { getSessionUsage, resetSessionUsage, totalTokens } from '../../observability/usageTelemetry.js';
import { approveAllGroups } from '../../test-utils/approval.js';
import type { CompactionSetup } from '../../turn/session.js';

let scratch: string; let root: string; let manager: SessionManager; let context: ShellRuntimeContext;
let runtime: ShellSessionRuntime; let server: http.Server; let baseUrl: string;
let requests: Array<Record<string, any>>; let approvals: string[]; let allowed: boolean;
let reply: (body: Record<string, any>, response: http.ServerResponse) => void;
let hooks: HookDispatcher;
function respond(response: http.ServerResponse, calls: Array<{ id: string; name: string; args: object }> = [], content = 'Done'): void {
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({
    choices: [{ message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls.map(call => ({ id: call.id, type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  }));
}
beforeEach(async () => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/handover-test-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  requests = []; approvals = []; allowed = true; hooks = new HookDispatcher();
  reply = (_body, response) => respond(response);
  server = http.createServer(async (request, response) => {
    let source = ''; for await (const chunk of request) source += chunk;
    const body = JSON.parse(source); requests.push(body); reply(body, response);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  manager = new SessionManager(); context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  const config = { ...getRuntimeConfig(root), provider: 'openai-compatible' as const, maxOutputTokens: 512, reserveTokens: 1024,
    retryEnabled: false, providerRetryMaxRetries: 0, maxTurns: 8, cacheWarming: 'off' as const,
    providerConnections: [{ id: 'fixture', provider: 'openai-compatible' as const, model: 'planner', apiKey: 'synthetic-fixture', baseUrl,
      authType: 'api-key' as const, status: 'connected' as const, thinkingEffort: null, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }],
    activeProviderConnectionId: 'fixture' };
  context.configuration = new ConfigState(config, configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  context.resolveConfigTarget = config => resolveProviderCredential({ runtimeConfig: config, env: {} });
  runtime = { getCurrentRunController: () => null, getAgentMode: () => 'build', getPermissionScope: () => 'ask' } as unknown as ShellSessionRuntime;
});
afterEach(async () => {
  armedHandoffs.delete(context); liveHandoffs.delete(context); resetSessionUsage(context.session.id);
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true });
});
async function command(args: string): Promise<string> {
  const result = await routeSlashCommand('/handover ' + args, { cwd: root, sessionId: context.session.id,
    handoffCommand: handoffCommandFor(context, manager, runtime) });
  if (result?.kind !== 'local') throw new Error('Expected local handoff result.'); return result.output;
}

it.each(['bedrock', 'vertex'] as const)('arms and cancels a handoff on the captured %s signer without a static credential', async provider => {
  const current = context.configuration.current;
  const baseUrl = provider === 'bedrock' ? 'https://bedrock-runtime.us-east-1.amazonaws.com'
    : 'https://us-central1-aiplatform.googleapis.com/v1/projects/synthetic-project/locations/us-central1/publishers/google';
  const config = { ...current.config, provider, providerConnections: [], activeProviderConnectionId: undefined,
    providerCredentials: { [provider]: { model: 'planner', baseUrl, thinkingEffort: null } } };
  context.configuration = new ConfigState(config, current.binding, BUILTIN_PROVIDERS);
  const captured = context.resolveConfigTarget!(config);
  expect(captured).toMatchObject({ provider, model: 'planner', baseUrl }); expect(captured.credential).toBeUndefined();
  const original = context.runtimeConfig;
  expect(await command('arm executor')).toContain('armed for the next turn');
  const row = new HandoffStore(manager, context.session).read().cycles[0]!;
  expect(row).toMatchObject({ phase: 'armed', source: { provider, model: 'planner' }, target: { provider, model: 'executor' } });
  expect(armedHandoffs.get(context)).toBe(row.id); expect(context.runtimeConfig).toBe(original);
  expect(requests).toEqual([]); expect(approvals).toEqual([]);
  expect(await command('off')).toContain('Pending handoff cancelled');
  expect(new HandoffStore(manager, context.session).read().cycles[0]!.phase).toBe('cancelled');
  expect(armedHandoffs.has(context)).toBe(false); expect(context.runtimeConfig).toBe(original); expect(requests).toEqual([]);
});
async function drive(signal = new AbortController().signal, extra: { readonly beforeApproval?: () => void; readonly failPersistence?: boolean } = {}) {
  const publication = context.configuration.current; const resolution = context.resolveConfigTarget!(publication.config);
  const handoff = handoffRunFor(context, manager, runtime, resolution, signal, () => undefined, () => {});
  const bound = readBoundSessionState(manager, context.session);
  const scope = { id: context.session.id, workspacePath: bound.scope.workspace.path, workspaceIdentity: bound.scope.workspace.identity };
  const policy = createRequestPolicy(sessionRequestStore(manager, context.session, scope, () => ({})), scope.id);
  let outcome: 'completed' | 'completed_unproven' | 'failed' | 'cancelled' = 'failed';
  let neutralReason: string | undefined;
  const events = [];
  try {
    const invocation = await runCliRuntimeInvocation({
      stepControl: handoff?.control, sessionId: context.session.id, prompt: 'KEEP_CONSTRAINT: preserve unrelated files and do ordered work',
      historyMessages: manager.getSession(context.session.id)!.turns, workspaceRoot: root, signal, maxTurns: 8,
      providerCredentialResolution: resolution, providerModeEnv: 'real', runtimeConfig: publication.config, providerCatalog: publication.catalog,
      requestPolicy: handoff ? handoff.policy(policy) : policy, admission: handoff?.admission, agentMode: 'build', permissionScope: 'ask',
      escalationPromptHandler: async prompt => { approvals.push(prompt.context.toolName); extra.beforeApproval?.();
        return allowed ? approveAllGroups(prompt) : { promptId: prompt.id, decision: 'deny', respondedAt: Date.now() }; },
      onPromptAccepted: () => { manager.persistUserPromptBarrier(context.session.id, 'KEEP_CONSTRAINT: preserve unrelated files and do ordered work'); handoff?.accept(); },
      onTurnMessage: message => { if (extra.failPersistence && message.role === 'tool') throw new Error('Injected transcript publication failure'); manager.addTurn(context.session.id, message); },
    }, { hooks, checkProviderReadiness: async () => ({ ok: true }), createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent });
    for await (const event of invocation.events) {
      events.push(event);
      if (event.type === 'query.completed') outcome = event.result.terminalReason === 'completed' ? 'completed' : 'failed';
      if (event.type === 'query.completed_unproven') { outcome = 'completed_unproven'; neutralReason = event.reasonCode; }
      if (event.type === 'query.failed') outcome = 'failed';
    }
  } finally {
    if (signal.aborted) outcome = 'cancelled';
    if (outcome === 'completed') manager.saveCompleted(context.session.id);
    else if (outcome === 'completed_unproven') manager.saveCompleted(context.session.id, { terminalClassification: 'completed_unproven', terminalReason: 'completed_unproven', terminalReasonCode: neutralReason });
    else if (outcome === 'cancelled') manager.saveInterrupted(context.session.id, 'turn');
    else manager.saveError(context.session.id, 'Fixture turn stopped');
    settleHandoffPrompt(context, signal, outcome);
  }
  return events;
}
function planningScript(_body: Record<string, any>, response: http.ServerResponse): void {
  if (requests.length === 1) respond(response, [{ id: 'checklist', name: 'todo', args: { action: 'add', task: 'Preserve constraints and write the two files' } }]);
  else if (requests.length === 2) respond(response, [{ id: 'first-write', name: 'write', args: { path: 'first.txt', content: 'source' } }]);
  else if (requests.length === 3) respond(response, [{ id: 'second-write', name: 'write', args: { path: 'second.txt', content: 'target' } }]);
  else respond(response);
}

it.each(['already_blocked_once', 'not_configured'] as const)('persists a neutral %s handoff after native model switching', async reasonCode => {
  reply = planningScript; await command('arm executor');
  hooks.registerInProcessHook({ event: 'Stop', name: 'neutral-stop', handler: payload => {
    const active = (payload as { stop_hook_active: boolean }).stop_hook_active;
    return { contract: { name: 'normproof.completion-gate.stop', version: '0.1.0' },
      decision: reasonCode === 'already_blocked_once' && !active ? 'block' : 'allow',
      reasonCode: reasonCode === 'already_blocked_once' && !active ? 'actionable_gap' : reasonCode,
      proofVerdict: reasonCode === 'already_blocked_once' && !active ? 'not_proven' : 'not_reported' };
  } });
  const events = await drive();
  expect(events.at(-1)).toMatchObject({ type: 'query.completed_unproven', reasonCode, proofVerdict: 'not_reported' });
  expect(events.some(event => event.type === 'query.completed' || event.type === 'query.failed')).toBe(false);
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'completed_unproven', switchedBy: 'first-write' });
  expect(new SessionManager().getRecoverySnapshot(context.session.id)).toMatchObject({ durableStatus: 'completed_unproven', terminalReasonCode: reasonCode });
  expect(liveHandoffs.has(context)).toBe(false);
});
it.each(['account', 'api-key'] as const)('bounds handoff compaction by the actual %s target catalogue', async auth => {
  const current = context.configuration.current;
  const origin = 'https://generativelanguage.googleapis.com';
  const config = { ...current.config, provider: 'google' as const, providerCredentials: {},
    providerConnections: [{ ...current.config.providerConnections[0]!, provider: 'google' as const, baseUrl: undefined, apiKey: undefined,
      ...(auth === 'account' ? { authType: 'account-auth' as const, accountAuth: { google: { type: 'google-gemini-account' as const,
        accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 60000, clientId: 'synthetic-client',
        scopes: ['https://www.googleapis.com/auth/cloud-platform'], quotaProject: 'synthetic-project' } } }
        : { authType: 'api-key' as const, apiKey: 'synthetic-api', baseUrl: origin + '/v1beta/openai' }) }] };
  const catalog = [{ id: 'google', runtime: 'google' as const, label: 'compatible', auth: 'api-key' as const, baseUrl: origin + '/v1beta/openai',
    models: [{ id: 'planner', contextWindow: 32000 }, { id: 'executor', contextWindow: 32000 }] },
  { id: 'native', runtime: 'google' as const, label: 'native', auth: 'account-auth' as const, baseUrl: origin,
    models: [{ id: 'planner', contextWindow: 16000 }, { id: 'executor', contextWindow: 8000 }] }];
  context.configuration = new ConfigState(config, current.binding, catalog);
  expect(await command('arm executor')).toContain('armed');
  const resolution = context.resolveConfigTarget!(config);
  const signal = new AbortController().signal;
  const run = handoffRunFor(context, manager, runtime, resolution, signal, () => undefined, () => {})!;
  const compaction = { policy: { contextWindow: 64000, reserveTokens: 1024 } } as CompactionSetup;
  const before = context.runtimeConfig;
  expect(run.resources({ compaction }).compaction!.policy.contextWindow).toBe(auth === 'account' ? 8000 : 32000);
  expect(compaction.policy.contextWindow).toBe(64000); expect(context.runtimeConfig).toBe(before); expect(requests).toEqual([]);
  const sourcePreference = { ...config, sessionContextWindow: { provider: 'google', model: 'planner', connectionId: 'fixture', value: 96000 } };
  context.configuration = new ConfigState(sourcePreference, current.binding, catalog);
  expect(run.resources({ compaction }).compaction!.policy.contextWindow).toBe(auth === 'account' ? 8000 : 32000);
  const ordinary = { ...sourcePreference, contextWindow: 24000 };
  context.configuration = new ConfigState(ordinary, current.binding, catalog);
  expect(run.resources({ compaction }).compaction!.policy.contextWindow).toBe(24000);
  expect(run.resources({ compaction: { ...compaction, policy: { ...compaction.policy, contextWindow: 6000 } } }).compaction!.policy.contextWindow).toBe(6000);
  context.configuration = new ConfigState({ ...ordinary, sessionContextWindow: { ...sourcePreference.sessionContextWindow, model: 'executor', value: 12000 } }, current.binding, catalog);
  expect(run.resources({ compaction }).compaction!.policy.contextWindow).toBe(12000);
  context.configuration = new ConfigState({ ...ordinary, sessionContextWindow: { ...sourcePreference.sessionContextWindow, model: 'executor', connectionId: 'sibling', value: 12000 } }, current.binding, catalog);
  expect(run.resources({ compaction }).compaction!.policy.contextWindow).toBe(24000);
  expect(compaction.policy).toEqual({ contextWindow: 64000, reserveTokens: 1024 }); expect(requests).toEqual([]);
  settleHandoffPrompt(context, signal, 'cancelled');
});
it('hands off only after persisted checklist and approved mutation, preserving order, usage and session model', async () => {
  reply = planningScript; expect(await command('arm executor --effort low')).toContain('armed');
  const events = await drive();
  expect(events.filter(event => event.type === 'query.failed' || event.type === 'lifecycle.error')).toEqual([]);
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner', 'executor', 'executor']);
  expect(requests[2]!.reasoning_effort).toBe('low');
  expect(requests[2]!.messages.some((message: any) => message.role === 'tool' && message.tool_call_id === 'first-write')).toBe(true);
  expect(JSON.stringify(requests[2]!.messages)).toContain('KEEP_CONSTRAINT');
  expect(approvals).toEqual(['write', 'write']);
  expect(fs.readFileSync(path.join(root, 'first.txt'), 'utf8')).toBe('source');
  expect(fs.readFileSync(path.join(root, 'second.txt'), 'utf8')).toBe('target');
  const row = new HandoffStore(manager, context.session).read().cycles[0]!;
  expect(row).toMatchObject({ phase: 'completed', switchedBy: 'first-write', target: { model: 'executor', thinkingEffort: 'low' } });
  expect(row.runId).toBeTruthy(); expect(row.promptEntryId).toBeTruthy();
  expect(manager.getSession(context.session.id)!.turns.filter(message => message.role === 'assistant').map(message => message.origin?.model))
    .toEqual(['planner', 'planner', 'executor', 'executor']);
  expect(totalTokens(getSessionUsage(context.session.id))).toBe(440);
  expect(context.resolveConfigTarget!(context.runtimeConfig).model).toBe('planner');
  const ledger = readBoundSessionState(manager, context.session).state.requestLedger as any;
  expect(ledger.scopes[context.session.id]).toMatchObject({ inputTokens: 400, outputTokens: 40, historyUnknown: true, pending: {} });
  reply = (_body, response) => respond(response); await drive(); expect(requests.at(-1)!.model).toBe('planner');
  expect(new HandoffStore(manager, context.session).read().cycles).toHaveLength(1);
});
it('keeps refusal and a mutation before its checklist on the original model', async () => {
  reply = planningScript; allowed = false; await command('arm executor'); await drive();
  expect(requests.every(body => body.model === 'planner')).toBe(true);
  expect(new HandoffStore(manager, context.session).read().cycles[0]!.switchedBy).toBeUndefined();
  expect(fs.existsSync(path.join(root, 'first.txt'))).toBe(false);
  allowed = true; requests = []; await command('arm executor');
  reply = (_body, response) => {
    if (requests.length === 1) respond(response, [{ id: 'early-write', name: 'write', args: { path: 'early.txt', content: 'original' } }]);
    else if (requests.length === 2) respond(response, [{ id: 'late-list', name: 'todo', args: { action: 'add', task: 'Too late to authorize a trigger' } }]);
    else respond(response);
  };
  await drive(); expect(requests.every(body => body.model === 'planner')).toBe(true);
  expect(new HandoffStore(manager, context.session).read().cycles.at(-1)!.switchedBy).toBeUndefined();
});
it('refuses durable switch failure and hook rejection after native effects without model fallback or replay', async () => {
  reply = planningScript; await command('arm executor');
  const change = HandoffStore.prototype.change;
  vi.spyOn(HandoffStore.prototype, 'change').mockImplementation(function (this: HandoffStore, row, update) {
    if (update.phase === 'switched') throw new Error('Injected switch persistence failure'); return change.call(this, row, update);
  });
  await drive();
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner']);
  expect(fs.readFileSync(path.join(root, 'first.txt'), 'utf8')).toBe('source');
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'unknown' });
  expect(() => handoffRunFor(context, manager, runtime, context.resolveConfigTarget!(context.runtimeConfig), new AbortController().signal, () => undefined, () => {})).toThrow('no adoptable');
  expect(await command('off')).toContain('remains unknown'); expect(await command('arm executor')).toContain('armed');
  vi.restoreAllMocks(); requests = []; fs.unlinkSync(path.join(root, 'first.txt'));
  const dispatch = hooks.dispatch.bind(hooks);
  vi.spyOn(hooks, 'dispatch').mockImplementation(event => event.eventName === 'PreModelSwitch' ? Promise.resolve({ decision: 'block', reason: 'fixture' }) : dispatch(event));
  await drive(); expect(requests.map(body => body.model)).toEqual(['planner', 'planner']);
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'unknown', retired: true });
});
it('refuses turn publication failure before the first model request and preserves source preferences', async () => {
  await command('arm executor'); const change = HandoffStore.prototype.change;
  vi.spyOn(HandoffStore.prototype, 'change').mockImplementation(function (this: HandoffStore, row, update) {
    if (update.phase === 'running') throw new Error('Injected run fence failure'); return change.call(this, row, update);
  });
  await drive(); expect(requests).toHaveLength(0);
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'failed' });
  expect(context.resolveConfigTarget!(context.runtimeConfig).model).toBe('planner'); expect(liveHandoffs.has(context)).toBe(false);
});
it('preserves unknown after a native mutation loses transcript publication', async () => {
  reply = planningScript; await command('arm executor');
  // Publish the checklist, then lose the first file tool result after its native effect.
  const addTurn = manager.addTurn.bind(manager);
  vi.spyOn(manager, 'addTurn').mockImplementation((id, message) => {
    if (message.role === 'tool' && message.tool_call_id === 'first-write') throw new Error('Injected mutation transcript failure');
    addTurn(id, message);
  });
  await drive();
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner']);
  expect(fs.readFileSync(path.join(root, 'first.txt'), 'utf8')).toBe('source');
  expect(new HandoffStore(manager, context.session).read().cycles[0]!.phase).toBe('unknown');
});
it('preserves native operation receipt uncertainty without switching or reporting completion', async () => {
  reply = planningScript; await command('arm executor');
  const rename = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (/^op-.*\.json$/.test(path.basename(String(to))) && fs.existsSync(path.join(root, 'first.txt'))) throw new Error('Injected receipt publication failure');
    rename(from, to);
  });
  await drive();
  expect(fs.readFileSync(path.join(root, 'first.txt'), 'utf8')).toBe('source');
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner']);
  expect(fs.existsSync(path.join(root, 'second.txt'))).toBe(false);
  expect(manager.getSession(context.session.id)!.turns.find(message => message.tool_call_id === 'first-write')?.metadata)
    .toMatchObject({ status: 'unknown', operationId: expect.stringMatching(/^op-/) });
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'unknown' });
});
it('keeps unchanged writes on the source and switches only after a recorded edit', async () => {
  fs.writeFileSync(path.join(root, 'first.txt'), 'source'); await command('arm executor');
  reply = (_body, response) => {
    if (requests.length === 1) respond(response, [{ id: 'list', name: 'todo', args: { action: 'add', task: 'Make a real change' } }]);
    else if (requests.length === 2) respond(response, [{ id: 'unchanged', name: 'write', args: { path: 'first.txt', content: 'source' } }]);
    else if (requests.length === 3) respond(response, [{ id: 'recorded-edit', name: 'edit', args: { path: 'first.txt', oldText: 'source', newText: 'edited' } }]);
    else respond(response);
  };
  await drive();
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner', 'planner', 'executor']);
  expect(fs.readFileSync(path.join(root, 'first.txt'), 'utf8')).toBe('edited');
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'completed', switchedBy: 'recorded-edit' });
});
it('requires a committed patch and refuses a fresh owner or fork adopting a pending selection', async () => {
  fs.writeFileSync(path.join(root, 'same.txt'), 'same\n');
  await command('arm executor');
  const resolution = context.resolveConfigTarget!(context.runtimeConfig);
  const fresh = { ...context, runtimeConfig: context.runtimeConfig };
  expect(() => handoffRunFor(fresh, manager, runtime, resolution, new AbortController().signal, () => undefined, () => {})).toThrow('no adoptable');
  const fork = manager.fork(context.session.id, root, { activate: false });
  expect(new HandoffStore(manager, fork).read().cycles).toEqual([]);
  expect(new HandoffStore(manager, context.session).read().cycles[0]!.phase).toBe('armed');
  reply = (_body, response) => {
    if (requests.length === 1) respond(response, [{ id: 'list', name: 'todo', args: { action: 'add', task: 'Change the source file' } }]);
    else if (requests.length === 2) respond(response, [{ id: 'no-op', name: 'apply_patch', args: { input: '*** Begin Patch\n*** Update File: same.txt\n@@\n-same\n+same\n*** End Patch' } }]);
    else if (requests.length === 3) respond(response, [{ id: 'actual-patch', name: 'apply_patch', args: { input: '*** Begin Patch\n*** Update File: same.txt\n@@\n-same\n+changed\n*** End Patch' } }]);
    else respond(response);
  };
  await drive();
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner', 'planner', 'executor']);
  expect(fs.readFileSync(path.join(root, 'same.txt'), 'utf8')).toBe('changed\n');
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'completed', switchedBy: 'actual-patch' });
});
it('retains the active connection for an opaque model ID despite a provider-name connection collision', async () => {
  const config = context.runtimeConfig;
  context.configuration = new ConfigState({ ...config, providerConnections: [...config.providerConnections,
    { ...config.providerConnections[0]!, id: 'openai-compatible', baseUrl: 'http://127.0.0.1:9/unrelated' }] }, configurationBinding(context));
  expect(await command('arm openai-compatible/vendor/executor --effort low')).toContain('armed');
  reply = planningScript; await drive();
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner', 'vendor/executor', 'vendor/executor']);
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'completed',
    target: { connectionId: 'fixture', model: 'vendor/executor' } });
});
it('checks live directory identity again after approval and denies a late effect', async () => {
  reply = planningScript; await command('arm executor'); let changed = false;
  await drive(undefined, { beforeApproval: () => {
    if (changed) return; changed = true; const previous = root + '-previous'; fs.renameSync(root, previous); fs.mkdirSync(root);
  } });
  expect(fs.existsSync(path.join(root, 'first.txt'))).toBe(false);
  expect(fs.existsSync(path.join(root + '-previous', 'first.txt'))).toBe(false);
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner']);
  expect(liveHandoffs.has(context)).toBe(false);
});
it('cancels the exact target request and restores ordinary next-turn model selection', async () => {
  let targetStarted!: () => void; const target = new Promise<void>(resolve => { targetStarted = resolve; });
  reply = (body, response) => { if (body.model === 'executor') { targetStarted(); return; } planningScript(body, response); };
  await command('arm executor'); const controller = new AbortController(); const work = drive(controller.signal);
  await target; controller.abort(); await work;
  expect(requests.map(body => body.model)).toEqual(['planner', 'planner', 'executor']);
  expect(new HandoffStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'cancelled', switchedBy: 'first-write' });
  expect(liveHandoffs.has(context)).toBe(false); expect(context.resolveConfigTarget!(context.runtimeConfig).model).toBe('planner');
  reply = (_body, response) => respond(response); await drive(); expect(requests.at(-1)!.model).toBe('planner');
});
