import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getProjectConfigPath, getRuntimeConfig } from '../../config/runtimeConfig.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import { bootstrapShellRuntime } from '../../core/shell/bootstrap.js';
import * as outputGuard from '../../core/shell/outputGuard.js';
import { getWorkflowGitContext } from '../../workflow/gitContext.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { SessionManager } from '../../session/SessionManager.js';
import { convertMessages } from '../../core/agent/messages.js';
import { createCliSessionRuntime } from '../runtime/cliSessionRuntimeFactory.js';
import { closeExtensionsFor } from '../runtime/extensions.js';
import { runPromptInputStream } from '../runtime/inputStream.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import { handleRpcCommand } from './rpcServer.js';
import type { RpcResponse } from './protocol.js';

let directory: string;
const fixtures: ReturnType<typeof fixture>[] = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporary, 'rpc-shell-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', directory); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(home, 'extensions.json'));
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(home, 'sources.json'));
});
afterEach(async () => {
  for (const test of fixtures.splice(0)) { await test.runtime.cancelAndWait(); await closeExtensionsFor(test.context); }
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(options: { allow?: boolean; disabled?: boolean } = {}) {
  const root = path.join(directory, 'work'); fs.mkdirSync(root, { recursive: true });
  const manager = new SessionManager(), renderer = new StreamingRenderer();
  vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
  if (options.disabled) {
    const file = getProjectConfigPath(root); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ disabledTools: ['bash'] }));
  }
  const config = getRuntimeConfig(root);
  if (options.disabled) expect(config.disabledTools).toContain('bash');
  const context = bootstrapShellRuntime({ cwd: root, runtimeConfig: config,
    gitContext: getWorkflowGitContext(root), sessionManager: manager, renderer, emitLifecycleMessages: false }).context;
  const runtime = createCliSessionRuntime({ runtimeContext: context, sessionManager: manager, renderer,
    options: { nonInteractiveApproval: options.allow === false ? 'deny' : 'allow-once' },
    approvalTrustPolicy: new ApprovalTrustPolicy(), getReadline: () => null, isStdinTty: () => false,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => ({ provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' }),
      providerModeEnv: () => 'synthetic', realProviderSmokeOptIn: () => false } });
  runtime.setAgentMode('build');
  const queue = new SubmissionQueue(() => context.session, () => {});
  const host = { ...createRuntimeRpcHost({ runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    queue, isStreaming: () => false, enqueuePrompt: prompt => { queue.push(prompt); } }), emitResponse: () => {} };
  const test = { root, manager, renderer, context, runtime, host }; fixtures.push(test); return test;
}

it('runs the production shell RPC through the native gate and persists its result for the next request', async () => {
  const test = fixture();
  const result = await handleRpcCommand({ type: 'bash', command: "printf 'RPC_STDOUT'; printf 'RPC_STDERR' >&2" }, test.host);
  expect(result).toMatchObject({ success: true, data: { status: 'completed', exitCode: 0,
    cancelled: false, truncated: false, isError: false, historySaved: 'saved' } });
  expect(result.data?.output).toContain('RPC_STDOUT'); expect(result.data?.output).toContain('RPC_STDERR');
  const loaded = new SessionManager().getSession(test.context.session.id)!;
  expect(loaded.turns).toHaveLength(1);
  expect(loaded.turns[0]).toMatchObject({ role: 'custom', customType: 'shell', display: true });
  const projected = await convertMessages(loaded.turns);
  expect(JSON.stringify(projected.messages)).toContain('RPC_STDERR');
  const events = test.manager.getTranscriptEvents(loaded.id);
  expect(events.some(event => event.type === 'query-event' && event.event.type === 'approval.resolved'
    && event.event.outcome === 'approved')).toBe(true);
  expect(events.some(event => event.type === 'query-event' && event.event.type === 'tool.result'
    && event.event.success === true)).toBe(true);
});

it('retains excluded output as a branch report without adding it to model history, including after reopen and fork', async () => {
  const test = fixture();
  const result = await handleRpcCommand({ type: 'bash', command: 'printf RPC_EXCLUDED', excludeFromContext: true }, test.host);
  expect(result).toMatchObject({ success: true, data: { output: 'RPC_EXCLUDED', historySaved: 'saved' } });
  const loaded = new SessionManager().getSession(test.context.session.id)!;
  expect(loaded.turns).toEqual([]); expect(loaded.reports).toHaveLength(1);
  expect(loaded.reports![0]!.text).toContain('RPC_EXCLUDED');
  expect(loaded.reports![0]!.report?.facts).toMatchObject({ status: 'completed', exitCode: 0, excludeFromContext: true });
  expect(JSON.stringify((await convertMessages(loaded.turns)).messages)).not.toContain('RPC_EXCLUDED');
  const fork = test.manager.fork(loaded.id, test.root, { activate: false });
  expect(fork.turns).toEqual([]); expect(fork.reports![0]!.text).toContain('RPC_EXCLUDED');
});

it.each(['deny', 'disabled', 'plan'] as const)('refuses shell %s before native side effects', async reason => {
  const test = fixture({ allow: reason !== 'deny', disabled: reason === 'disabled' });
  if (reason === 'plan') test.runtime.setAgentMode('plan');
  const response = await handleRpcCommand({ type: 'bash', command: 'printf forbidden > blocked.txt' }, test.host);
  expect(response.success).toBe(false);
  expect(response.data).toMatchObject({ isError: true, status: reason === 'deny' ? 'denied' : 'blocked' });
  expect(fs.existsSync(path.join(test.root, 'blocked.txt'))).toBe(false);
});

it('keeps a nonzero exit and stderr visible in an unsuccessful RPC response and its saved message', async () => {
  const test = fixture();
  const response = await handleRpcCommand({ type: 'bash', command: "printf RPC_PARTIAL; printf RPC_FAILURE >&2; exit 7" }, test.host);
  expect(response).toMatchObject({ success: false, data: { status: 'failed', exitCode: 7,
    isError: true, cancelled: false, historySaved: 'saved' } });
  expect(response.data?.output).toContain('RPC_PARTIAL'); expect(response.data?.output).toContain('RPC_FAILURE');
  expect(test.manager.getSession(test.context.session.id)!.turns[0]!.content).toContain('failed');
});

it('keeps actual exit evidence when after-call hooks fail', async () => {
  const test = fixture();
  const dispatch = HookDispatcher.prototype.dispatch;
  vi.spyOn(HookDispatcher.prototype, 'dispatch').mockImplementation(function (event, options) {
    if (event.eventName === 'PostToolUse') return Promise.reject(new Error('private hook detail'));
    return dispatch.call(this, event, options);
  });
  const response = await handleRpcCommand({ type: 'bash', command: 'printf RPC_EFFECT > effect.txt; printf RPC_EFFECT' }, test.host);
  expect(fs.readFileSync(path.join(test.root, 'effect.txt'), 'utf8')).toBe('RPC_EFFECT');
  expect(response).toMatchObject({ success: false, data: { status: 'completed', exitCode: 0, isError: true } });
  expect(response.data?.output).toContain('RPC_EFFECT'); expect(response.data?.output).toContain('after-call');
  expect(JSON.stringify(response)).not.toContain('private hook detail');
  const events = test.manager.getTranscriptEvents(test.context.session.id);
  expect(events.some(event => event.type === 'query-event' && event.event.type === 'tool.result'
    && event.event.success === false && event.event.output?.includes('RPC_EFFECT'))).toBe(true);
});

it('reports unverified message persistence without losing the completed native outcome', async () => {
  const test = fixture();
  vi.spyOn(test.manager, 'addTurn').mockImplementation(() => { throw new Error('private persistence detail'); });
  const response = await handleRpcCommand({ type: 'bash', command: 'printf RPC_UNSAVED' }, test.host);
  expect(response).toMatchObject({ success: false, data: { status: 'completed', exitCode: 0,
    historySaved: 'unverified', output: expect.stringContaining('RPC_UNSAVED') } });
  expect(JSON.stringify(response)).not.toContain('private persistence detail');
});

it('refuses native effects when a pre-call hook retires the captured branch', async () => {
  const test = fixture();
  test.manager.addTurn(test.context.session.id, { role: 'user', content: 'original question' });
  const sessionId = test.context.session.id;
  const dispatch = HookDispatcher.prototype.dispatch;
  vi.spyOn(HookDispatcher.prototype, 'dispatch').mockImplementation(async function (event, options) {
    if (event.eventName === 'PreToolUse') await test.manager.revertTo(sessionId, `${sessionId}:root`);
    return dispatch.call(this, event, options);
  });
  const response = await handleRpcCommand({ type: 'bash', command: 'printf forbidden > stale.txt' }, test.host);
  expect(fs.existsSync(path.join(test.root, 'stale.txt'))).toBe(false);
  expect(response).toMatchObject({ success: false, data: { status: 'blocked', historySaved: 'not-saved' } });
  expect(test.manager.getTranscriptEvents(sessionId).some(event => event.type === 'query-event'
    && event.event.type === 'tool.started')).toBe(false);
});

it.each(['configuration', 'deletion'] as const)('retains completed effects without saving history after %s retirement', async change => {
  const test = fixture();
  const sessionId = test.context.session.id, sessionDir = test.manager.getSessionDirPath(sessionId);
  const dispatch = HookDispatcher.prototype.dispatch;
  vi.spyOn(HookDispatcher.prototype, 'dispatch').mockImplementation(async function (event, options) {
    if (event.eventName === 'PostToolUse') {
      if (change === 'deletion') test.manager.deleteSession(sessionId);
      else {
        const configuration = test.context.configuration, before = configuration.current;
        configuration.publish(configuration.begin(before.binding), { ...before.config, disabledTools: ['bash'] }, before.binding);
      }
    }
    return dispatch.call(this, event, options);
  });
  const response = await handleRpcCommand({ type: 'bash', command: 'printf RPC_RETIRED' }, test.host);
  expect(response).toMatchObject({ success: false, data: { status: 'completed', exitCode: 0,
    historySaved: 'not-saved', output: expect.stringContaining('RPC_RETIRED') } });
  if (change === 'deletion') expect(fs.existsSync(sessionDir)).toBe(false);
  else expect(test.manager.getSession(sessionId)!.turns).toEqual([]);
});

it('preserves an unverified excluded report write in the RPC outcome', async () => {
  const test = fixture();
  vi.spyOn(test.manager, 'captureReportWriter').mockReturnValue(() => 'unverified');
  const response = await handleRpcCommand({ type: 'bash', command: 'printf RPC_REPORT', excludeFromContext: true }, test.host);
  expect(response).toMatchObject({ success: false, data: { status: 'completed', exitCode: 0,
    excludeFromContext: true, historySaved: 'unverified', output: 'RPC_REPORT' } });
  expect(test.manager.getSession(test.context.session.id)!.turns).toEqual([]);
});

it('accepts immediate abort before the shell operation enters its first microtask', async () => {
  const test = fixture();
  const pending = handleRpcCommand({ type: 'bash', command: 'printf forbidden > early.txt' }, test.host);
  await handleRpcCommand({ type: 'abort_bash' }, test.host);
  expect(await pending).toMatchObject({ success: false, data: { cancelled: true, status: 'cancelled', exitCode: null } });
  expect(fs.existsSync(path.join(test.root, 'early.txt'))).toBe(false);
  expect(test.runtime.isRunning()).toBe(false);
});

it.each(['session', 'branch'] as const)('does not publish a completed shell result into a changed %s', async change => {
  const test = fixture();
  test.manager.addTurn(test.context.session.id, { role: 'user', content: 'original question' });
  const original = test.manager.getSession(test.context.session.id)!;
  const other = test.manager.createNew(test.root, { activate: false });
  const dispatch = HookDispatcher.prototype.dispatch;
  vi.spyOn(HookDispatcher.prototype, 'dispatch').mockImplementation(async function (event, options) {
    if (event.eventName === 'PostToolUse') {
      if (change === 'session') {
        test.context.session = other;
        test.context.activeSession = { sessionId: other.id, sessionProjectDir: other.projectRoot };
      } else await test.manager.revertTo(original.id, `${original.id}:root`);
    }
    return dispatch.call(this, event, options);
  });
  const response = await handleRpcCommand({ type: 'bash', command: 'printf RPC_OLD_SOURCE' }, test.host);
  expect(response).toMatchObject({ success: false, data: { status: 'completed', exitCode: 0,
    historySaved: 'not-saved', output: expect.stringContaining('RPC_OLD_SOURCE') } });
  expect(test.manager.getSession(original.id)!.turns.some(message => message.role === 'custom')).toBe(false);
  expect(test.manager.getSession(other.id)!.turns).toEqual([]);
  expect(test.manager.getTranscriptEvents(other.id).some(event => event.type === 'query-event')).toBe(false);
  expect(test.manager.getTranscriptEvents(original.id).some(event => event.type === 'query-event'
    && event.event.type === 'tool.result' && event.event.output?.includes('RPC_OLD_SOURCE'))).toBe(true);
});

it('redacts credential-shaped command output in the response and durable records', async () => {
  const test = fixture();
  const marker = ['Bearer', 'synthetic-sensitive-value'].join(' ');
  const response = await handleRpcCommand({ type: 'bash', command: `printf '%s' '${marker}'` }, test.host);
  expect(response.success).toBe(true);
  expect(response.data?.output).toBe('Bearer [redacted]');
  expect(JSON.stringify(test.manager.getTranscriptEvents(test.context.session.id))).not.toContain('synthetic-sensitive-value');
});

it('leaves an unrelated local command running when abort_bash has no owned shell', async () => {
  const test = fixture(); let release!: () => void;
  const active = test.runtime.commands.run(async signal => { await new Promise<void>(resolve => { release = resolve; }); return signal.aborted; });
  await Promise.resolve();
  try {
    expect(await handleRpcCommand({ type: 'abort_bash' }, test.host)).toMatchObject({ success: true });
    const response = await handleRpcCommand({ type: 'bash', command: 'printf LATE' }, test.host);
    expect(response.success).toBe(false); expect(response.error).toMatch(/running|active/i);
  } finally { release(); }
  expect(await active).toBe(false);
});

it('refuses tree navigation while the shell command owner is running', async () => {
  const test = fixture();
  test.manager.addTurn(test.context.session.id, { role: 'user', content: 'original question' });
  const before = test.manager.getSession(test.context.session.id)!;
  let release!: () => void;
  const active = test.runtime.commands.run(() => new Promise<void>(resolve => { release = resolve; }));
  await Promise.resolve();
  try {
    const response = await handleRpcCommand({ type: 'navigate_tree', entryId: `${before.id}:root` }, test.host);
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/running|active/i);
    expect(test.manager.getSession(before.id)!.turns).toEqual(before.turns);
  } finally { release(); await active; }
});

it('lets JSONL reads, busy refusals and abort reach a native shell before its response settles', async () => {
  const test = fixture(), stdin = new PassThrough(), responses: RpcResponse[] = [], prompts: boolean[] = [];
  vi.spyOn(outputGuard, 'writeRawStdout').mockImplementation(text => { const frame = JSON.parse(text); if (frame.type === 'response') responses.push(frame); });
  fs.writeFileSync(path.join(test.root, 'hold.cjs'), "require('node:fs').writeFileSync('ready.txt','ready'); process.stdout.write('RPC_RUNNING'); setInterval(() => {}, 1000);");
  const run = runPromptInputStream({ stdin, runtimeContext: test.context, sessionRuntime: test.runtime,
    sessionManager: test.manager, renderer: test.renderer, logger: { info: () => {} } as never,
    rpcMode: true, runPrompt: async () => { prompts.push(test.runtime.isRunning()); } });
  try {
    stdin.write(JSON.stringify({ id: 'shell', type: 'bash', command: `${JSON.stringify(process.execPath)} hold.cjs` }) + '\n');
    await vi.waitFor(() => expect(fs.existsSync(path.join(test.root, 'ready.txt'))).toBe(true), { timeout: 2000 });
    stdin.write('{"id":"state","type":"get_state"}\n{"id":"new","type":"new_session"}\n'
      + '{"id":"overlap","type":"bash","command":"printf forbidden > overlap.txt"}\n'
      + '{"id":"next","type":"prompt","message":"AFTER_SHELL"}\n');
    await vi.waitFor(() => expect(responses.find(response => response.id === 'state')).toMatchObject({ success: true, data: { isBashRunning: true } }));
    expect(responses.find(response => response.id === 'shell')).toBeUndefined();
    await vi.waitFor(() => expect(responses.find(response => response.id === 'overlap')?.success).toBe(false));
    expect(responses.find(response => response.id === 'new')).toMatchObject({ data: { cancelled: true } });
    expect(prompts).toEqual([]);
    stdin.write('{"id":"cancel","type":"abort_bash"}\n');
    await vi.waitFor(() => expect(responses.find(response => response.id === 'shell')).toMatchObject({ success: false,
      data: { cancelled: true, status: 'cancelled', output: expect.stringContaining('RPC_RUNNING') } }), { timeout: 5000 });
    expect(responses.find(response => response.id === 'cancel')?.success).toBe(true);
    expect(fs.existsSync(path.join(test.root, 'overlap.txt'))).toBe(false);
  } finally { test.runtime.cancelCurrentRun(); stdin.end(); await run; }
  expect(prompts).toEqual([false]);
  expect(test.runtime.isRunning()).toBe(false);
});
