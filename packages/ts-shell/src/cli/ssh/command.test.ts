import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { JobStore } from '../../workflow/jobs/store.js';
import { JobService, type RemoteJobBackend } from '../../workflow/jobs/service.js';
import { sshCommandFor, installSshRuntime, sshFeatureTools, closeSshFor } from '../runtime/ssh.js';
import { sshHosts } from './state.js';
import { SshError, type SshProfile, type SshWorkspace } from '../../runtime/execution/ssh/model.js';
import { SshClient } from '../../runtime/execution/ssh/client.js';
import { SshTransport } from '../../runtime/execution/ssh/transport.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { runSessionGoalCommand } from '../../planning/goal/command.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { operationAdmission } from './authority.js';

const contexts: ShellRuntimeContext[] = [];
afterEach(async () => { await Promise.allSettled(contexts.splice(0).map(closeSshFor)); cleanupAdvisorHarnesses(); });
const workspace: SshWorkspace = { profileIdentity: 'a'.repeat(64), fingerprint: 'SHA256:' + 'B'.repeat(43), root: '/remote/work',
  directoryIdentity: '1:2', uid: 1000, bootId: '11111111-1111-1111-1111-111111111111', namespace: 'c'.repeat(32) };
async function setup(goal = false) {
  const s = createAdvisorHarness(false, false); const context = { cwd: s.root, projectRoot: s.root, session: s.session } as ShellRuntimeContext;
  contexts.push(context);
  const configuration = new ConfigState(getRuntimeConfig(s.root), configurationBinding(context));
  Object.assign(context, { configuration }); Object.defineProperty(context, 'runtimeConfig', { get: () => configuration.current.config });
  if (goal) await runSessionGoalCommand(['set', 'Remote goal'], { cwd: s.root, projectRoot: s.root, sessionId: s.session.id }, s.manager, s.session);
  const runtime = new ShellSessionRuntime({ sessionManager: s.manager, renderer: { renderLine() {}, renderChunk() {} } as never,
    runPrompt: () => (async function* () {})() });
  let approve = false; let afterApprove = () => {}; let blocked: string | undefined; const report = vi.fn();
  const gate = () => ({ workspaceRoot: s.root, sessionId: s.session.id, permissionScope: 'accept-edits' as const, hooks: new HookDispatcher(),
    admission: () => blocked, emit() {}, escalationPromptHandler: async () => { afterApprove(); return { decision: approve ? 'allow-once' as const : 'deny' as const }; } });
  installSshRuntime(context, s.manager, runtime, gate, report); const host = sshHosts.get(context)!;
  const profile: SshProfile = { identity: workspace.profileIdentity, fingerprint: workspace.fingerprint,
    selection: { version: 1, host: 'example.test', port: 22, user: 'fixture', workspace: workspace.root, executable: '/usr/bin/ssh', hostKey: 'synthetic-public' },
    check() {}, keySnapshot() { return 'not-used'; } };
  host.profile = profile; host.jobs.connect(workspace);
  const port: RemoteJobBackend = { identity: profile.identity, check() {}, start: vi.fn(async () => 'd'.repeat(32)),
    query: vi.fn(async () => ({ invocationId: 'd'.repeat(32), status: 'completed', exitCode: 0, output: 'complete' } as const)),
    cancel: vi.fn(async () => ({ status: 'unknown', output: 'unknown' } as const)),
    output: vi.fn(async () => ({ bytes: Buffer.from('α'), nextOffset: 2, size: 2, truncated: false })) };
  host.service = new JobService(host.jobs, port, () => undefined);
  const command = (args: string[], rawCommandArgs?: string) => sshCommandFor(context)(args, { cwd: s.root, projectRoot: s.root, sessionId: s.session.id, rawCommandArgs });
  return { ...s, host, context, gate, port, command, report, block: () => { blocked = 'SSH capability disabled'; },
    approve: () => { approve = true; }, afterApprove: (fn: () => void) => { afterApprove = fn; } };
}
it('rejects remote execution under a denied ordinary gate even when local edits are granted', async () => {
  const s = await setup(); const result = await s.command(['run', 'touch remote']);
  expect(result.kind === 'local' && result.output).toContain('refused'); expect(s.port.start).not.toHaveBeenCalled();
  expect(s.host.jobs.read().jobs).toHaveLength(0);
});

it('requires a separate one-time approval for an exact workspace file and withholds sensitive pages', async () => {
  const s = await setup();
  const connect = vi.spyOn(SshClient.prototype, 'connect').mockResolvedValue(workspace);
  const connection = vi.spyOn(SshTransport.prototype, 'checkConnection').mockImplementation(() => {});
  const context = Buffer.from('token=SYNTHETIC_PAGE_SECRET_12345678');
  const stat = vi.spyOn(SshClient.prototype, 'stat').mockResolvedValue({ size: context.length });
  const read = vi.spyOn(SshClient.prototype, 'read').mockResolvedValue({ bytes: context, context, size: context.length, nextOffset: context.length, version: 'b'.repeat(64) });
  const invoke = async (...args: string[]) => {
    const result = await s.command(args);
    if (result.kind !== 'local') throw new Error('Expected a local SSH response.');
    return result.output;
  };
  try {
    s.approve();
    expect(await invoke('connect')).toContain('persistent connection');
    expect(await invoke('read', '../outside')).toContain('refused');
    expect(read).not.toHaveBeenCalled();
    expect(await invoke('stat', 'folder/report.txt')).toContain(`${context.length} bytes`);
    const result = await invoke('read', 'folder/report.txt');
    expect(result).toContain('withheld');
    expect(result).not.toContain('SYNTHETIC_PAGE_SECRET');
    expect(stat).toHaveBeenCalledWith(workspace, 'folder/report.txt', expect.anything(), expect.any(AbortSignal));
    expect(read).toHaveBeenCalledWith(workspace, 'folder/report.txt', 0, undefined, expect.anything(), expect.any(AbortSignal));
    s.afterApprove(() => { s.host.cancellationRevision++; });
    expect(await invoke('read', 'folder/report.txt')).toContain('refused');
    expect(read).toHaveBeenCalledOnce();
  } finally { connect.mockRestore(); connection.mockRestore(); stat.mockRestore(); read.mockRestore(); }
});
it('preserves exact shell source and publishes durable unknown/native results without local completion proof', async () => {
  const s = await setup(); s.approve(); const source = 'printf "%s\\n" "α β"; false';
  const result = await s.command(['run', 'tokenized-wrong'], 'run ' + source);
  expect(result.kind === 'local' && result.output).toContain('running');
  const job = s.host.jobs.read().jobs[0]!; expect(job.command).toBe(source); expect(job.dispatchPossible).toBe(true);
  expect((await s.command(['reconcile', job.id])).kind).toBe('local'); expect(s.host.jobs.get(job.id).status).toBe('completed');
  expect(s.host.jobs.get(job.id).note).toContain('not local goal-completion proof');
});
it('fences parent goal changes during native approval before any remote intent is created', async () => {
  const s = await setup(true); s.approve(); s.afterApprove(() => {
    void runSessionGoalCommand(['pause'], { cwd: s.root, projectRoot: s.root, sessionId: s.session.id }, s.manager, s.session);
  });
  const result = await s.command(['run', 'touch remote']); expect(result.kind === 'local' && result.output).toContain('refused');
  expect(s.port.start).not.toHaveBeenCalled(); expect(s.host.jobs.read().jobs).toHaveLength(0);
});
it('routes model SSH through the same approval and attributes the exact active goal', async () => {
  const s = await setup(true); s.approve(); const tool = sshFeatureTools(s.context)[0]!;
  const result = await runPreparedTool(tool, { command: 'printf remote' }, s.gate());
  expect(result.isError).toBe(false); const job = s.host.jobs.read().jobs[0]!;
  expect(job.origin).toMatchObject({ kind: 'goal', goalId: expect.any(String), sourceEntryId: s.sourcePromptEntryId });
  expect(result.metadata).toMatchObject({ evidence: 'remote-reported', goalCompletionProof: false, id: job.id });
  expect(new JobStore(s.manager, () => s.session).get(job.id)).toEqual(job);
});

it.each(['1:2', '1:3'])('refuses an old tool approval after reconnecting the same profile (workspace identity %s)', async directoryIdentity => {
  const s = await setup(); s.approve(); const oldTool = sshFeatureTools(s.context)[0]!;
  const nextWorkspace = { ...workspace, directoryIdentity };
  const connect = vi.spyOn(SshClient.prototype, 'connect').mockResolvedValue(nextWorkspace);
  const connection = vi.spyOn(SshTransport.prototype, 'checkConnection').mockImplementation(() => {});
  const start = vi.spyOn(SshClient.prototype, 'start').mockResolvedValue('d'.repeat(32));
  let entered!: () => void; const approving = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const pending = runPreparedTool(oldTool, { command: 'printf OLD' }, { ...s.gate(), escalationPromptHandler: async () => {
    entered(); await held; return { decision: 'allow-once' as const };
  } });
  try {
    await approving;
    const disconnected = await s.command(['disconnect']);
    expect(disconnected.kind === 'local' && disconnected.output).toContain('Local SSH binding released');
    const rebound = await s.command(['connect']);
    expect(rebound.kind === 'local' && rebound.output).toContain('SSH workspace verified and bound');
    release();
    expect((await pending).isError).toBe(true);
    expect((await runPreparedTool(oldTool, { command: 'printf OLD AGAIN' }, s.gate())).isError).toBe(true);
    expect(s.port.start).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    expect(s.host.jobs.read().jobs).toHaveLength(0);
    expect(s.host.jobs.read().remote).toEqual(nextWorkspace);
    const next = sshFeatureTools(s.context)[0]!;
    expect((await runPreparedTool(next, { command: 'printf CURRENT' }, s.gate())).isError).toBe(false);
    expect(start).toHaveBeenCalledOnce();
    expect(s.host.jobs.read().jobs[0]).toMatchObject({ binding: nextWorkspace, status: 'running', dispatchPossible: true });
  } finally { release(); await pending; connect.mockRestore(); connection.mockRestore(); start.mockRestore(); }
});

it('does not publish a new master lost while the previous connection is closing', async () => {
  const s = await setup();
  s.approve();
  const clients: SshClient[] = [];
  const available = new Set<SshTransport>();
  const candidateWorkspace = { ...workspace, directoryIdentity: '1:3' };
  const connect = vi.spyOn(SshClient.prototype, 'connect').mockImplementation(async function (this: SshClient) {
    clients.push(this);
    available.add(this.transport);
    return clients.length === 1 ? workspace : candidateWorkspace;
  });
  const check = vi.spyOn(SshTransport.prototype, 'checkConnection').mockImplementation(function (this: SshTransport) {
    if (!available.has(this)) throw new SshError('unavailable');
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let entering!: () => void;
  const closing = new Promise<void>(resolve => { entering = resolve; });
  let replacement: ReturnType<typeof s.command> | undefined;
  try {
    const initial = await s.command(['connect']);
    expect(initial.kind === 'local' && initial.output).toContain('persistent connection');
    const prior = clients[0]!.transport;
    const close = prior.close.bind(prior);
    vi.spyOn(prior, 'close').mockImplementationOnce(async () => { entering(); await held; await close(); });
    replacement = s.command(['connect']);
    await closing;
    expect(clients).toHaveLength(2);
    const candidateClose = vi.spyOn(clients[1]!.transport, 'close');
    available.delete(clients[1]!.transport);
    release();
    const result = await replacement;
    expect(result.kind === 'local' && result.output).toContain('could not be confirmed');
    expect(s.host.client).toBeUndefined();
    expect(s.host.service).toBeUndefined();
    expect(s.host.jobs.read().remote).toEqual(workspace);
    expect(candidateClose).toHaveBeenCalledOnce();
  } finally { release(); await replacement; connect.mockRestore(); check.mockRestore(); }
});

it('rejects new job intent when its approved master was already lost', async () => {
  const s = await setup();
  s.approve();
  const connect = vi.spyOn(SshClient.prototype, 'connect').mockResolvedValue(workspace);
  const check = vi.spyOn(SshTransport.prototype, 'checkConnection').mockImplementationOnce(() => {})
    .mockImplementation(() => { throw new SshError('unavailable'); });
  const start = vi.spyOn(SshClient.prototype, 'start').mockResolvedValue('d'.repeat(32));
  try {
    const initial = await s.command(['connect']);
    expect(initial.kind === 'local' && initial.output).toContain('persistent connection');
    const tool = sshFeatureTools(s.context)[0]!;
    const result = await runPreparedTool(tool, { command: 'printf AFTER_LOSS' }, s.gate());
    expect(result.isError).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(s.host.jobs.read().jobs).toEqual([]);
  } finally { connect.mockRestore(); check.mockRestore(); start.mockRestore(); }
});

it.each([false, true])('joins unpublished SSH cleanup during shutdown (unverified=%s)', async unverified => {
  const s = await setup();
  s.approve();
  const clients: SshClient[] = [];
  const connect = vi.spyOn(SshClient.prototype, 'connect').mockImplementation(async function (this: SshClient) {
    clients.push(this);
    return clients.length === 1 ? workspace : { ...workspace, directoryIdentity: '1:3' };
  });
  const check = vi.spyOn(SshTransport.prototype, 'checkConnection').mockImplementation(() => {});
  let releasePrior!: () => void;
  let beginPrior!: () => void;
  const priorCleanup = new Promise<void>(resolve => { releasePrior = resolve; });
  const priorClosing = new Promise<void>(resolve => { beginPrior = resolve; });
  let releaseCandidate!: () => void;
  let beginCandidate!: () => void;
  const candidateCleanup = new Promise<void>(resolve => { releaseCandidate = resolve; });
  const candidateClosing = new Promise<void>(resolve => { beginCandidate = resolve; });
  let replacement: ReturnType<typeof s.command> | undefined;
  let shutdown: Promise<void> | undefined;
  try {
    const initial = await s.command(['connect']);
    expect(initial.kind === 'local' && initial.output).toContain('persistent connection');
    vi.spyOn(clients[0]!.transport, 'close').mockImplementation(() => { beginPrior(); return priorCleanup; });
    replacement = s.command(['connect']);
    await priorClosing;
    const candidate = clients[1]!.transport;
    let settlement: Promise<void> | undefined;
    vi.spyOn(candidate, 'close').mockImplementation(() => {
      beginCandidate();
      return settlement ??= candidateCleanup.then(() => {
        if (unverified) throw new SshError('cleanup');
      });
    });
    const pending = s.host.pending!.signal;
    shutdown = closeSshFor(s.context);
    const observed = vi.fn();
    const completed = shutdown.then(observed, observed);
    expect(closeSshFor(s.context)).toBe(shutdown);
    await candidateClosing;
    expect(pending.aborted).toBe(true);
    releasePrior();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(observed).not.toHaveBeenCalled();
    expect(sshHosts.get(s.context)).toBe(s.host);
    releaseCandidate();
    if (unverified) await expect(shutdown).rejects.toMatchObject({ code: 'cleanup' });
    else await expect(shutdown).resolves.toBeUndefined();
    await completed;
    expect(sshHosts.has(s.context)).toBe(false);
    const result = await replacement;
    expect(result.kind === 'local' && result.output).not.toContain('persistent connection');
    expect(s.host.jobs.read().remote).toEqual(workspace);
  } finally {
    releasePrior(); releaseCandidate();
    await Promise.allSettled([replacement, shutdown]);
    connect.mockRestore(); check.mockRestore();
  }
});
it('aborts a held local request promptly on parent revocation and uses the separately approved exact cancellation capability', async () => {
  const s = await setup(true); s.approve(); let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  s.port.start = vi.fn(async (_job, _authority, signal) => { began();
    await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true }));
    throw new Error('Local transport aborted');
  });
  s.port.query = vi.fn(async () => ({ invocationId: 'd'.repeat(32), status: 'running', output: 'unknown' } as const));
  s.port.cancel = vi.fn(async (_job, invocationId) => ({ invocationId, status: 'cancelled', output: 'interrupted', cancellation: 'selected-cgroup-empty' } as const));
  const pending = s.command(['run', 'sleep 200']); await started;
  await runSessionGoalCommand(['pause'], { cwd: s.root, projectRoot: s.root, sessionId: s.session.id }, s.manager, s.session);
  await pending; await vi.waitFor(() => expect(s.port.cancel).toHaveBeenCalledTimes(1));
  const job = s.host.jobs.read().jobs[0]!;
  expect(job).toMatchObject({ lifetime: 'parent', status: 'cancelled', dispatchPossible: true, cancellation: 'selected-cgroup-empty', output: 'interrupted' });
  expect(s.port.start).toHaveBeenCalledTimes(1);
});
it('keeps detached remote outcome unknown when a local pending request is cancelled and a new local request is admitted', async () => {
  const s = await setup(); s.approve(); let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  s.port.start = vi.fn(async (_job, _authority, signal) => { began();
    await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true })); throw new Error('Local abort'); });
  const pending = s.command(['run', 'sleep 200']); await started;
  const cancellation = await s.command(['cancel-pending']); expect(cancellation.kind === 'local' && cancellation.output).toContain('remote termination is separate');
  await pending; const first = s.host.jobs.read().jobs[0]!;
  expect(first).toMatchObject({ lifetime: 'detached', status: 'unknown' }); expect(first.cancellation).toBeUndefined();
  s.port.start = vi.fn(async () => 'd'.repeat(32)); await s.command(['run', 'printf NEXT']);
  expect(s.host.jobs.read().jobs).toHaveLength(2); expect(s.host.jobs.get(first.id)).toEqual(first);
  expect(s.port.cancel).not.toHaveBeenCalled();
});
it('cancels a held model-issued local SSH request through the same SSH control owner', async () => {
  const s = await setup(); s.approve(); let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  s.port.start = vi.fn(async (_job, _authority, signal) => { began();
    await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true })); throw new Error('Local abort'); });
  const pending = runPreparedTool(sshFeatureTools(s.context)[0]!, { command: 'sleep 200' }, s.gate());
  await started; await s.command(['cancel-pending']); await pending;
  expect(s.host.jobs.read().jobs[0]).toMatchObject({ lifetime: 'detached', status: 'unknown', dispatchPossible: true });
  expect(s.port.cancel).not.toHaveBeenCalled(); expect(s.host.operations.size).toBe(0);
});
it('drains a late submission and its exact parent cancellation before closing the runtime', async () => {
  const s = await setup(true); s.approve(); let began!: () => void; let aborted!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; }); const stopped = new Promise<void>(resolve => { aborted = resolve; });
  const cleanup = new Promise<void>(resolve => { release = resolve; });
  s.port.start = vi.fn(async (_job, _authority, signal) => { began(); signal!.addEventListener('abort', () => aborted(), { once: true });
    await cleanup; throw new Error('Late local cleanup after abort'); });
  s.port.query = vi.fn(async () => ({ invocationId: 'd'.repeat(32), status: 'running', output: 'unknown' } as const));
  s.port.cancel = vi.fn(async (_job, invocationId) => ({ invocationId, status: 'cancelled', output: 'interrupted', cancellation: 'selected-cgroup-empty' } as const));
  const pending = s.command(['run', 'sleep 200']); await started;
  let closed = false; const closing = closeSshFor(s.context).then(() => { closed = true; });
  await stopped; await new Promise<void>(resolve => setImmediate(resolve));
  expect(closed).toBe(false); expect(sshHosts.get(s.context)).toBe(s.host);
  release(); await pending; await closing;
  expect(s.port.cancel).toHaveBeenCalledTimes(1); expect(s.host.jobs.read().jobs[0]?.status).toBe('cancelled');
  expect(sshHosts.has(s.context)).toBe(false);
});

it('joins one shutdown and preserves a successor installed while the prior SSH request drains', async () => {
  const s = await setup(); s.approve(); let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  let interrupted!: () => void; const stopped = new Promise<void>(resolve => { interrupted = resolve; });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  s.port.start = vi.fn(async (_job, _authority, signal) => {
    signal!.addEventListener('abort', interrupted, { once: true }); began();
    await held; throw new Error('Synthetic lost start reply');
  });
  const running = s.command(['run', 'printf held']); await started;
  const closed = closeSshFor(s.context);
  try {
    expect(closeSshFor(s.context)).toBe(closed);
    await stopped;
    installSshRuntime(s.context, s.manager, s.host.runtime, s.gate, s.host.report);
    const successor = sshHosts.get(s.context);
    release(); await running; await closed;
    expect(sshHosts.get(s.context)).toBe(successor);
    expect(s.port.start).toHaveBeenCalledOnce();
    expect(s.host.jobs.read().jobs[0]).toMatchObject({ status: 'unknown', dispatchPossible: true });
  } finally { release(); await Promise.allSettled([running, closed]); }
});
it('retains the configuration transition fence when the same binding becomes active again', async () => {
  const s = await setup(); const admission = operationAdmission(s.host, false, false, false);
  expect(admission()).toBeUndefined(); const binding = configurationBinding(s.context); const config = s.context.runtimeConfig;
  s.context.configuration.transition(binding); s.context.configuration.publish(s.context.configuration.begin(binding), config, binding);
  expect(admission()).toContain('changed');
});
it.each(['before', 'during'] as const)('preserves requested unknown cancellation when retained capability revokes %s its query', async timing => {
  const s = await setup(true); s.approve(); let began!: () => void; const querying = new Promise<void>(resolve => { began = resolve; });
  s.port.query = vi.fn(async (_job, _invocation, _authority, signal) => { began();
    await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true })); throw new Error('Held observation aborted'); });
  await s.command(['run', 'sleep 200']);
  if (timing === 'before') s.block();
  else {
    await runSessionGoalCommand(['pause'], { cwd: s.root, projectRoot: s.root, sessionId: s.session.id }, s.manager, s.session);
    await querying; s.block();
  }
  await vi.waitFor(() => expect(s.host.jobs.read().jobs[0]).toMatchObject({ status: 'unknown', cancellation: 'requested' }));
  await vi.waitFor(() => expect(s.report).toHaveBeenCalledWith(expect.stringContaining('unconfirmed')));
  expect(s.port.cancel).not.toHaveBeenCalled(); expect(s.port.query).toHaveBeenCalledTimes(timing === 'before' ? 0 : 1);
});
