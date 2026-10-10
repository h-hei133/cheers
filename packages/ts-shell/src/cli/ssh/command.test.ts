import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { JobStore } from '../../workflow/jobs/store.js';
import { JobService, type RemoteJobBackend } from '../../workflow/jobs/service.js';
import { sshCommandFor, installSshRuntime, sshFeatureTools, closeSshFor } from '../runtime/ssh.js';
import { sshHosts } from './state.js';
import type { SshProfile, SshWorkspace } from '../../runtime/execution/ssh/model.js';
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
