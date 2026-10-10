import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { ConfigState } from '../../../config/state.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { configurationBinding } from '../../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { routeSlashCommand } from '../../../core/commands/slashRouter.js';
import type { EscalationResponse } from '../../../core/shell/approval/contract.js';
import { closeJobsFor, installJobsRuntime, jobsFor, jobsCommandFor, workflowCommandFor } from '../../runtime/jobs.js';
import { readWorkflow } from '../../../core/workflow/definition.js';
import { captureDagRuntime } from './runtime.js';
import { hubProjection } from '../hub.js';
import { decodeJournal } from '../../../workflow/jobs/codec.js';
import { dagDigest } from '../../../workflow/jobs/dag/codec.js';

let scratch: string; let root: string; let manager: SessionManager; let context: ShellRuntimeContext;
let approve: (tool: string) => Promise<EscalationResponse>; let requests: string[];
function install(): void {
  installJobsRuntime(context, manager, { getAgentMode: () => 'build', getPermissionScope: () => 'ask' } as ShellSessionRuntime,
    tool => ({ sessionId: context.session.id, workspaceRoot: root, permissionScope: 'ask', agentMode: 'build',
      hooks: new HookDispatcher(), emit() {}, escalationPromptHandler: () => { requests.push(tool ?? 'bash'); return approve(tool ?? 'bash'); } }));
}
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/dag-command-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  context.configuration = new ConfigState(getRuntimeConfig(root), configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  requests = []; approve = async () => ({ decision: 'allow-once' }); install();
});
afterEach(async () => { await closeJobsFor(context); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
function define(steps: unknown, extra: Record<string, unknown> = {}): string {
  const source = path.join(root, '.agents/workflows/native.json'); fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ steps, ...extra })); return source;
}
async function command(raw: string): Promise<string> {
  const result = await routeSlashCommand('/workflow ' + raw, { cwd: root, sessionId: context.session.id,
    workflowCommand: workflowCommandFor(context), jobsCommand: jobsCommandFor(context) });
  if (result?.kind !== 'local') throw new Error('Expected a local workflow command.'); return result.output;
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Native workflow did not settle.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
it('keeps denied scheduling and denied ordinary command effects separate', async () => {
  define([{ id: 'first', run: 'touch DENIED' }, { id: 'after', run: 'touch AFTER', needs: ['first'] }]);
  approve = async () => ({ decision: 'deny' }); const host = jobsFor(context)!;
  expect(await command('run native')).toContain('denied'); expect(host.dags.journal.list()).toHaveLength(0);
  expect(host.local.list()).toHaveLength(0);
  approve = async tool => ({ decision: tool === 'task' ? 'allow-once' : 'deny' });
  await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!;
  expect(job.status).toBe('failed'); expect(job.steps.map(step => step.status)).toEqual(['failed', 'skipped']);
  expect(host.local.list()).toHaveLength(0); expect(requests).toEqual(['task', 'task', 'bash']);
  expect(fs.existsSync(path.join(root, 'DENIED'))).toBe(false); expect(fs.existsSync(path.join(root, 'AFTER'))).toBe(false);
});
it('runs dependent commands, parallel branches and the join through exact native jobs', async () => {
  define([{ id: 'first', run: 'printf start > order' },
    { id: 'left', run: 'test -f order; touch left; while [ ! -f right ]; do sleep 0.01; done; printf LEFT', needs: ['first'], timeoutSeconds: 5 },
    { id: 'right', run: 'test -f order; touch right; while [ ! -f left ]; do sleep 0.01; done; printf RIGHT', needs: ['first'], timeoutSeconds: 5 },
    { id: 'join', run: 'test -f left && test -f right && printf joined >> order', needs: ['left', 'right'] }], { maxConcurrency: 16 });
  const host = jobsFor(context)!; await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!;
  expect(job.status).toBe('completed'); expect(job.steps.every(step => step.status === 'completed')).toBe(true);
  expect(fs.readFileSync(path.join(root, 'order'), 'utf8')).toBe('startjoined'); expect(requests).toEqual(['task', 'bash', 'bash', 'bash', 'bash']);
  for (const step of job.steps) expect(host.local.get(step.jobId)).toMatchObject({ status: 'completed', exitCode: 0, origin: job.origin });
  expect(Buffer.from(host.local.get(job.steps[1]!.jobId).stdout, 'base64').toString()).toBe('LEFT');
  const hub = hubProjection(host); expect(hub.completionProof).toBe(false);
  expect(hub.parents).toContainEqual({ childId: job.steps[3]!.jobId, parentId: job.id, parentKind: 'workflow' });
});
it('stops at a failing batch and retains native exit codes and exact output', async () => {
  define([{ id: 'gate', run: 'printf boom >&2; exit 3' }, { id: 'after', run: 'touch AFTER', needs: ['gate'] }]);
  const host = jobsFor(context)!; await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!;
  expect(job.status).toBe('failed'); expect(job.steps.map(step => step.status)).toEqual(['failed', 'skipped']);
  const child = host.local.get(job.steps[0]!.jobId); expect(child).toMatchObject({ status: 'failed', exitCode: 3, output: 'complete' });
  expect(Buffer.from(child.stderr, 'base64').toString()).toBe('boom'); expect(host.local.list()).toHaveLength(1);
  expect(fs.existsSync(path.join(root, 'AFTER'))).toBe(false);
});
it('recalls completed native facts after restart without replaying commands', async () => {
  define([{ id: 'once', run: 'printf once >> count' }]); const first = jobsFor(context)!;
  await command('run native'); await first.dags.drain(); const saved = first.dags.journal.list()[0]!;
  await closeJobsFor(context); install();
  expect(await command('status')).toContain('completed'); expect(await command('resume ' + saved.id)).toContain('never resume or replay');
  expect(jobsFor(context)!.dags.journal.get(saved.id)).toEqual(saved);
  expect(fs.readFileSync(path.join(root, 'count'), 'utf8')).toBe('once'); expect(requests).toEqual(['task', 'bash']);
});
it('requires fresh scheduling and command approvals for queued restart, retaining all reserved IDs', async () => {
  define([{ id: 'once', run: 'printf once > count' }]); const first = jobsFor(context)!;
  await command('queue native'); const saved = first.dags.journal.list()[0]!; expect(first.local.list()).toHaveLength(0);
  await closeJobsFor(context); install(); approve = async () => ({ decision: 'deny' });
  expect(await command('resume ' + saved.id)).toContain('denied'); expect(jobsFor(context)!.dags.journal.get(saved.id)).toEqual(saved);
  approve = async () => ({ decision: 'allow-once' }); await command('resume ' + saved.id);
  const host = jobsFor(context)!; await host.dags.drain(); const done = host.dags.journal.get(saved.id);
  expect(done).toMatchObject({ id: saved.id, digest: saved.digest, status: 'completed', dispatchPossible: true });
  expect(done.steps.map(step => step.jobId)).toEqual(saved.steps.map(step => step.jobId));
  expect(requests).toEqual(['task', 'task', 'task', 'bash']); expect(fs.readFileSync(path.join(root, 'count'), 'utf8')).toBe('once');
});
it.each(['task', 'bash'])('refuses a changed raw definition during %s approval without a native effect', async changedAt => {
  const source = define([{ id: 'one', run: 'touch STALE' }]);
  approve = async tool => { if (tool === changedAt) fs.appendFileSync(source, '\n'); return { decision: 'allow-once' }; };
  const host = jobsFor(context)!; await command('run native'); await host.dags.drain();
  expect(host.local.list()).toHaveLength(0); expect(fs.existsSync(path.join(root, 'STALE'))).toBe(false);
  if (changedAt === 'task') expect(host.dags.journal.list()).toHaveLength(0);
  else expect(host.dags.journal.list()[0]?.status).not.toBe('completed');
});
it.each(['pause', 'cancel'])('%s waits for the exact live native cleanup and permanently halts dispatched scheduling', async action => {
  define([{ id: 'long', run: 'printf started > started; sleep 30' }, { id: 'after', run: 'touch AFTER', needs: ['long'] }]);
  const host = jobsFor(context)!; await command('run native'); const job = host.dags.journal.list()[0]!; const childId = job.steps[0]!.jobId;
  await until(() => host.registry.get(childId)?.pid !== undefined && fs.existsSync(path.join(root, 'started')));
  await command(action + ' ' + job.id);
  expect(host.dags.hasLive(job.id)).toBe(false); expect(host.registry.hasLive(childId)).toBe(false);
  expect(host.dags.journal.get(job.id).status).toBe(action === 'pause' ? 'paused' : 'cancelled');
  expect(host.local.get(childId).status).toBe('cancelled'); expect(fs.existsSync(path.join(root, 'AFTER'))).toBe(false);
  expect(await command('resume ' + job.id)).toContain('never resume or replay');
});
it('captures graph origin before scheduling approval despite concurrent main activity', async () => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Graph origin', metadata: { source: 'advisor-application', noteId: 'original-note' } });
  define([{ id: 'one', run: 'printf one' }]);
  approve = async tool => {
    if (tool === 'task') manager.addTurn(context.session.id, { role: 'user', content: 'Later main prompt', metadata: { source: 'advisor-application', noteId: 'later-note' } });
    return { decision: 'allow-once' };
  };
  const host = jobsFor(context)!; await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!;
  expect(job.origin.parentId).toBe('original-note'); expect(host.local.get(job.steps[0]!.jobId).origin).toEqual(job.origin);
});
it('retains unknown native cleanup without success or replay', async () => {
  define([{ id: 'one', run: 'printf once >> count' }, { id: 'after', run: 'touch AFTER', needs: ['one'] }]);
  const host = jobsFor(context)!; const finish = host.local.finish.bind(host.local);
  vi.spyOn(host.local, 'finish').mockImplementation((id, result) => finish(id, { ...result, terminationFailed: true }));
  await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!;
  expect(job.status).toBe('unknown'); expect(host.local.get(job.steps[0]!.jobId)).toMatchObject({ status: 'unknown', output: 'unknown' });
  expect(job.steps[1]!.status).toBe('skipped'); expect(await command('resume ' + job.id)).toContain('never resume or replay');
  expect(fs.readFileSync(path.join(root, 'count'), 'utf8')).toBe('once');
});
it('aborts a native sibling on step publication failure and retains the graph until every worker settles', async () => {
  define([{ id: 'a', run: 'sleep 0.1' }, { id: 'b', run: 'printf started > started; sleep 30' }]);
  const host = jobsFor(context)!; const loaded = readWorkflow(root, 'native'); if ('error' in loaded) throw new Error(loaded.error);
  const native = captureDagRuntime(host, loaded.workflow); let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }); let siblingSettled = false; let failed = false;
  const original = host.dags.journal.step.bind(host.dags.journal);
  vi.spyOn(host.dags.journal, 'step').mockImplementation((id, stepId, change) => {
    if (stepId === 'a' && change.status === 'completed' && !failed) { failed = true; throw new Error('Publication unavailable.'); }
    return original(id, stepId, change);
  });
  const job = host.dags.create(loaded.workflow, { kind: 'local' }, { ...native, runStep: async input => {
    const status = await native.runStep(input);
    if (input.step.id === 'b') { siblingSettled = true; await held; } return status;
  } });
  try {
    await until(() => failed && siblingSettled);
    expect(host.registry.hasLive(job.steps[1]!.jobId)).toBe(false); expect(host.local.get(job.steps[1]!.jobId).status).toBe('cancelled');
    expect(host.dags.hasLive(job.id)).toBe(true); let finished = false;
    const stop = host.dags.stop(host.dags.journal.get(job.id)).then(result => { finished = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 20)); expect(finished).toBe(false);
    release(); expect(await stop).toBe(false); await host.dags.drain();
    expect(host.dags.hasLive(job.id)).toBe(false); expect(host.dags.journal.get(job.id).status).toBe('unknown');
  } finally { release(); await host.dags.drain(); }
});
it('cancels the same live graph after dependencies advance during stop approval', async () => {
  define([{ id: 'a', run: 'touch a-start; while [ ! -f release-a ]; do sleep 0.01; done', timeoutSeconds: 5 },
    { id: 'b', run: 'touch b-start; sleep 30', needs: ['a'] }]);
  const host = jobsFor(context)!; await command('run native'); const job = host.dags.journal.list()[0]!;
  await until(() => fs.existsSync(path.join(root, 'a-start')));
  approve = async tool => {
    if (tool === 'task') { fs.writeFileSync(path.join(root, 'release-a'), ''); await until(() => fs.existsSync(path.join(root, 'b-start'))); }
    return { decision: 'allow-once' };
  };
  await command('cancel ' + job.id);
  expect(host.dags.hasLive(job.id)).toBe(false);
  expect(host.registry.hasLive(job.steps[1]!.jobId)).toBe(false);
  expect(host.dags.journal.get(job.id)).toMatchObject({ status: 'cancelled', dispatchPossible: true });
  expect(host.local.get(job.steps[1]!.jobId).status).toBe('cancelled');
});
it('does not inspect or expose a denied workflow definition', async () => {
  const source = define([{ id: 'secret', run: 'printf private-workflow-command' }]);
  const host = jobsFor(context)!; const original = host.gate;
  Object.assign(host, { gate: (tool?: string) => ({ ...original(tool), denyRules: [{ tool: 'read', pattern: path.join(root, '.agents/workflows/') }] }) });
  const opened = vi.spyOn(fs, 'openSync');
  const output = await command('run native');
  expect(output).not.toContain('private-workflow-command');
  expect(host.dags.journal.list()).toHaveLength(0); expect(requests).toHaveLength(0);
  expect(await command('list')).not.toContain('private-workflow-command');
  expect(opened.mock.calls.some(call => call[0] === source)).toBe(false);
});
it('retains result publication uncertainty even when the exact native child has been cancelled', async () => {
  define([{ id: 'one', run: 'sleep 30' }]); const host = jobsFor(context)!; const original = host.gate;
  let failed = false;
  Object.assign(host, { gate: (tool?: string) => ({ ...original(tool), emit(event: { type: string }) {
    if (tool === 'bash' && event.type === 'tool.result' && !failed) { failed = true; throw new Error('Publication unavailable.'); }
  } }) });
  await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!;
  expect(failed).toBe(true); expect(job.status).toBe('unknown'); expect(job.steps[0]!.status).toBe('unknown');
  expect(host.local.get(job.steps[0]!.jobId).status).toBe('cancelled'); expect(host.registry.hasLive(job.steps[0]!.jobId)).toBe(false);
});
it('keeps global child identities and possible effects consistent across retained graphs', async () => {
  define([{ id: 'one', run: 'true' }]); const host = jobsFor(context)!; await command('queue native');
  const duplicate = JSON.parse(JSON.stringify(host.jobs.read())); const first = duplicate.dags[0];
  const second = { ...first, id: '10000000-0000-0000-0000-000000000001', steps: first.steps.map((step: object) => ({ ...step })) };
  second.digest = dagDigest(second); duplicate.dags.push(second);
  expect(() => decodeJournal(duplicate, host.jobs.scope())).toThrow();
  const invalid = JSON.parse(JSON.stringify(host.jobs.read()));
  invalid.dags[0].steps[0].dispatchPossible = true; invalid.dags[0].steps[0].status = 'unknown';
  expect(() => decodeJournal(invalid, host.jobs.scope())).toThrow();
});
it('releases admission after a settled dispatched pause while retaining every replay fence', async () => {
  define([{ id: 'one', run: 'sleep 30' }]); const host = jobsFor(context)!;
  for (let index = 0; index < 2; index++) {
    await command('run native'); const job = host.dags.journal.list()[index]!;
    await until(() => host.registry.get(job.steps[0]!.jobId)?.pid !== undefined);
    await command('pause ' + job.id); expect(host.dags.journal.get(job.id).status).toBe('paused');
    expect(await command('resume ' + job.id)).toContain('never resume or replay');
  }
  await command('queue native'); expect(host.dags.journal.list()).toHaveLength(3);
  expect(host.dags.journal.list()[2]!.dispatchPossible).toBe(false);
});
it('does not dispatch a reserved child independently after graph handoff uncertainty', async () => {
  define([{ id: 'one', run: 'touch NEVER' }]); const host = jobsFor(context)!;
  vi.spyOn(host.local, 'arm').mockImplementationOnce(() => { throw new Error('Dispatch reservation unavailable.'); });
  await command('run native'); await host.dags.drain(); const job = host.dags.journal.list()[0]!; const child = host.local.get(job.steps[0]!.jobId);
  expect(job.status).toBe('unknown'); expect(child.dispatchPossible).toBe(false);
  const count = requests.length;
  const result = await routeSlashCommand('/jobs resume ' + child.id, { cwd: root, sessionId: context.session.id, jobsCommand: jobsCommandFor(context) });
  expect(result?.kind === 'local' && result.output).toContain('never resume independently');
  expect(requests).toHaveLength(count); expect(() => host.local.adopt(child.id)).toThrow();
  expect(fs.existsSync(path.join(root, 'NEVER'))).toBe(false); expect(host.local.get(child.id)).toEqual(child);
});
