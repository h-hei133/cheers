import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { closeJobsFor, installJobsRuntime, jobsCommandFor, jobsFor, jobsRunnerFor, watchJobsFor } from '../runtime/jobs.js';
import { jobsInstallations } from './state.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import type { EscalationResponse } from '../../core/shell/approval/contract.js';
import { createCoreToolRegistry } from '../../core/tools/registry.js';
import type { ToolExecutionContext } from '../../tools/types.js';
import { readGoalEdit, writeGoal } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { readBoundSessionState, publishBoundSessionState } from '../../session/store/bound.js';
import { hubProjection } from './hub.js';

let scratch: string; let root: string; let manager: SessionManager; let context: ShellRuntimeContext;
let approve: () => Promise<EscalationResponse>;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/jobs-command-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager();
  context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  context.configuration = new ConfigState(getRuntimeConfig(root), configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  approve = async () => ({ decision: 'allow-once' });
  installJobsRuntime(context, manager, {} as ShellSessionRuntime, () => ({ sessionId: context.session.id, workspaceRoot: context.cwd,
    permissionScope: 'accept-edits', hooks: new HookDispatcher(), emit() {}, escalationPromptHandler: () => approve() }));
});
afterEach(async () => { await closeJobsFor(context); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
async function command(raw: string) {
  return routeSlashCommand('/jobs ' + raw, { cwd: context.cwd, projectRoot: context.projectRoot,
    sessionId: context.session.id, jobsCommand: jobsCommandFor(context) });
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Command job did not settle.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
it('keeps ordinary denial separate from queued intent and resumes the exact raw shell suffix once', async () => {
  const host = jobsFor(context)!; approve = async () => ({ decision: 'deny' });
  expect(JSON.stringify(await command('queue touch DENIED'))).toContain('denied'); expect(host.local.list()).toHaveLength(0);
  approve = async () => ({ decision: 'allow-once' });
  const suffix = `printf '%s' 'a  b' > once.txt; printf '中🙂'`;
  await command('queue ' + suffix); const id = host.local.list()[0]!.id;
  expect(host.local.get(id)).toMatchObject({ command: suffix, status: 'queued', dispatchPossible: false });
  await command('pause ' + id); expect(host.local.get(id).status).toBe('paused');
  await command('resume ' + id); await until(() => !host.registry.hasLive(id));
  expect(host.local.get(id)).toMatchObject({ status: 'completed', exitCode: 0, dispatchPossible: true });
  expect(fs.readFileSync(path.join(root, 'once.txt'), 'utf8')).toBe('a  b');
  expect(JSON.stringify(await command('output ' + id + ' stdout 0'))).toContain('中🙂');
  await command('resume ' + id); expect(host.local.list()).toHaveLength(1);
  expect(fs.existsSync(path.join(root, 'DENIED'))).toBe(false);
});
it('rejects a late ordinary approval after runtime closure without publishing intent', async () => {
  let begin!: () => void; const started = new Promise<void>(resolve => { begin = resolve; });
  let release!: (answer: EscalationResponse) => void; const held = new Promise<EscalationResponse>(resolve => { release = resolve; });
  approve = async () => { begin(); return held; };
  const host = jobsFor(context)!; const pending = command('queue touch LATE'); await started;
  await closeJobsFor(context); release({ decision: 'allow-once' });
  expect(JSON.stringify(await pending)).toContain('closed or changed'); expect(host.local.list()).toHaveLength(0);
});
it('rebinds the same session to a new owner and keeps old intent visibly detached', async () => {
  const first = jobsFor(context)!; await command('queue touch OLD'); const id = first.local.list()[0]!.id;
  const other = path.join(scratch, 'other'); fs.mkdirSync(path.join(other, '.git'), { recursive: true });
  context.session = manager.rebindSessionProjectRoot(context.session.id, other); context.cwd = other; context.projectRoot = other;
  const binding = configurationBinding(context); context.configuration.transition(binding);
  context.configuration.publish(context.configuration.begin(binding), getRuntimeConfig(other), binding);
  const rebound = jobsFor(context)!; expect(rebound).not.toBe(first);
  expect(JSON.stringify(await command('list'))).toContain('detached'); await command('resume ' + id);
  expect(rebound.local.get(id).dispatchPossible).toBe(false);
  await command('queue touch NEW'); expect(rebound.local.list()).toHaveLength(2);
  expect(jobsInstallations.get(context)?.hosts.size).toBe(1);
});
it('delivers completion only to its current session and releases retired session owners', async () => {
  const ended = vi.fn(); const release = watchJobsFor(context, ended); const first = jobsFor(context)!;
  await command('run sleep 30'); const id = first.local.list()[0]!.id;
  context.session = manager.createNew(root); const binding = configurationBinding(context);
  context.configuration.transition(binding); context.configuration.publish(context.configuration.begin(binding), getRuntimeConfig(root), binding);
  const second = jobsFor(context)!; await first.registry.close();
  expect(second.registry.get(id)).toBeUndefined(); expect(ended).not.toHaveBeenCalled();
  expect(jobsInstallations.get(context)?.hosts.size).toBe(1); release();
});

it('refuses ordinary background tools when bound owner cleanup is saturated or closed', async () => {
  const installed = jobsInstallations.get(context)!;
  for (let index = 0; index < 8; index++) installed.retiring.add(Promise.resolve());
  expect(jobsFor(context)).toBeUndefined();
  const tools = createCoreToolRegistry();
  const toolContext = { workspaceRoot: root, sessionId: context.session.id, background: jobsRunnerFor(context) } as ToolExecutionContext;
  await expect(tools.get('bash')!.execute({ command: 'touch UNBOUND', runInBackground: true }, toolContext)).rejects.toThrow(/bound local job owner/);
  await expect(tools.get('taskStop')!.execute({ taskId: 'bg_1' }, toolContext)).rejects.toThrow(/bound local job owner/);
  await expect(tools.get('taskOutput')!.execute({ all: true }, toolContext)).rejects.toThrow(/bound local job owner/);
  expect(fs.existsSync(path.join(root, 'UNBOUND'))).toBe(false);
  await closeJobsFor(context);
  expect(() => jobsRunnerFor(context).start({ command: 'touch CLOSED', cwd: root })).toThrow(/bound local job owner/);
});

it('projects stored parents and the shared goal budget once, preserving dispatched unknown usage', async () => {
  writeGoal(manager, context.session, readGoalEdit(manager, context.session), { type: 'set', objective: 'Parent goal' });
  writeGoal(manager, context.session, readGoalEdit(manager, context.session), { type: 'budget', cap: 600 });
  const goal = readGoalEdit(manager, context.session).goal!;
  const policy = goalRequestPolicy(manager, context.session)!;
  const prepared = { bodyDigest: 'a'.repeat(64), provider: 'fixture', model: 'fixture', endpoint: 'http://localhost/fixture', purpose: 'turn',
    bound: { inputTokens: 100, outputTokens: 50, source: 'fixture', version: '1' } };
  const known = policy.reserve({ ...prepared, requestId: 'known' }); known.dispatch();
  known.settle({ version: 1, inputTokens: 100, outputTokens: 10, complete: true });
  policy.reserve({ ...prepared, requestId: 'unknown' }).dispatch();
  manager.addTurn(context.session.id, { role: 'user', content: 'Applied advice', metadata: { source: 'advisor-application', noteId: 'note-one' } });
  await command('queue printf FIRST'); await command('queue printf SECOND');
  const host = jobsFor(context)!; const hub = hubProjection(host);
  expect(hub.goal).toMatchObject({ id: goal.id, status: 'active', tokenBudget: 600 });
  expect(hub.requestUsage).toEqual([expect.objectContaining({ scopeId: goal.id, tokenBudget: 600, knownTokens: 110, retainedTokens: 150, unknownAttempts: 1 })]);
  for (const job of host.local.list()) {
    expect(hub.parents).toContainEqual({ childId: job.id, parentId: goal.id, parentKind: 'goal' });
    expect(hub.parents).toContainEqual({ childId: job.id, parentId: 'note-one', parentKind: 'advisor-note' });
  }
  expect(hub.completionProof).toBe(false);
  const bound = readBoundSessionState(manager, context.session);
  publishBoundSessionState(manager, context.session, bound, () => true, state => ({ ...state,
    requestLedger: { ...(state.requestLedger as object), sessionId: 'another-session' } }));
  expect(hubProjection(host).requestUsage).toBe('unavailable');
});
