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
import { closeJobsFor, installJobsRuntime, jobsCommandFor, jobsFor } from '../../runtime/jobs.js';
import { createCliProviderRuntimeBridge } from '../../provider/cliProviderRuntimeBridge.js';
import { routeSlashCommand } from '../../../core/commands/slashRouter.js';
import { getSessionTodos, replayTodosFromMessages, setSessionTodos } from '../../../core/commands/todoCommandRuntime.js';
import { readBoundSessionState } from '../../../session/store/bound.js';
import { AgentSessions } from './session.js';
import { hubProjection } from '../hub.js';
import { agentPage } from './projection.js';
import * as native from '../../../runtime/execution/local.js';

let scratch: string; let root: string; let manager: SessionManager; let context: ShellRuntimeContext;
let allowed: boolean; let releaseApproval: (() => Promise<{ decision: 'allow-once' }>) | undefined;
function install() {
  installJobsRuntime(context, manager, { getAgentMode: () => 'build', getPermissionScope: () => 'ask' } as ShellSessionRuntime,
    () => ({ sessionId: context.session.id, workspaceRoot: root, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit() {},
      escalationPromptHandler: async () => releaseApproval ? releaseApproval() : { decision: allowed ? 'allow-once' : 'deny' } }),
    { providerRuntimeBridge: createCliProviderRuntimeBridge({ runtimeConfig: () => context.runtimeConfig, options: {}, env: { CHEERS_PROVIDER_MODE: 'synthetic' } }) });
}
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/jobs-agent-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  manager = new SessionManager(); context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  context.configuration = new ConfigState(getRuntimeConfig(root), configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  allowed = true; releaseApproval = undefined; install();
});
afterEach(async () => { await closeJobsFor(context); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });
function command(raw: string) {
  return routeSlashCommand('/jobs ' + raw, { cwd: root, projectRoot: root, sessionId: context.session.id, jobsCommand: jobsCommandFor(context) });
}
async function settled(id: string) {
  const deadline = Date.now() + 5000;
  while (jobsFor(context)!.agents.hasLive(id)) { if (Date.now() > deadline) throw new Error('Agent did not settle.'); await new Promise(resolve => setTimeout(resolve, 10)); }
  return jobsFor(context)!.agents.journal.get(id);
}
it('refuses startup before creating either durable intent or child session', async () => {
  allowed = false; const before = manager.listSessions().map(session => session.id);
  expect(JSON.stringify(await command('agent Review the project'))).toContain('denied');
  expect(jobsFor(context)!.agents.journal.list()).toHaveLength(0);
  expect(manager.listSessions().map(session => session.id)).toEqual(before);
});
it('refuses declared command hooks, including declarations added during startup approval', async () => {
  const before = manager.listSessions().map(session => session.id);
  const directory = path.join(root, '.agents'); fs.mkdirSync(directory);
  const config = path.join(directory, 'hooks.json');
  const declare = () => fs.writeFileSync(config, JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ command: 'touch HOOK_EFFECT' }] }] } }));
  declare();
  expect(JSON.stringify(await command('agent Review with hooks'))).toContain('command hooks');
  expect(jobsFor(context)!.agents.journal.list()).toHaveLength(0);
  fs.unlinkSync(config);
  let began!: () => void; const held = new Promise<void>(resolve => { began = resolve; });
  let answer!: (response: { decision: 'allow-once' }) => void;
  releaseApproval = async () => { began(); return new Promise(resolve => { answer = resolve; }); };
  const pending = command('agent Review after approval'); await held; declare(); answer({ decision: 'allow-once' });
  expect(JSON.stringify(await pending)).toContain('command hooks');
  expect(jobsFor(context)!.agents.journal.list()).toHaveLength(0);
  expect(manager.listSessions().map(session => session.id)).toEqual(before);
  expect(fs.existsSync(path.join(root, 'HOOK_EFFECT'))).toBe(false);
});
it('forks context without selecting the child, inheriting spend or executing an interrupted parent tool', () => {
  const parent = context.session;
  manager.addTurn(parent.id, { id: 'parent-tool', role: 'assistant', content: '', tool_calls: [{ id: 'pending', type: 'function',
    function: { name: 'bash', arguments: '{"command":"touch PARENT_PENDING"}' } }] });
  setSessionTodos(parent.id, [{ id: 1, text: 'Parent work', status: 'in_progress' }]);
  const before = JSON.stringify(manager.getSession(parent.id)!.turns);
  const { child } = new AgentSessions(manager, parent).create(); const session = manager.getSession(child.scope.sessionId)!;
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(parent.id);
  expect(context.session.id).toBe(parent.id); expect(JSON.stringify(manager.getSession(parent.id)!.turns)).toBe(before);
  expect(session.parentSession).toBe(parent.id); expect(session.usage).toBeUndefined();
  expect(session.turns).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'pending', content: expect.stringContaining('not executed') }));
  replayTodosFromMessages(session.id, session.turns); expect(getSessionTodos(session.id)).toEqual([]);
  expect(getSessionTodos(parent.id)).toHaveLength(1); expect(fs.existsSync(path.join(root, 'PARENT_PENDING'))).toBe(false);
  expect(readBoundSessionState(manager, session).state.goal).toBeUndefined();
});
it('runs a native turn on the child and creates a fresh checkpoint run without replaying its predecessor', async () => {
  const before = JSON.stringify(manager.getSession(context.session.id)!.turns);
  await command('agent Explain  two spaces'); const host = jobsFor(context)!; const first = host.agents.journal.list()[0]!;
  const complete = await settled(first.id); expect(complete).toMatchObject({ status: 'completed', output: 'complete', prompt: 'Explain  two spaces' });
  expect(complete.runs).toHaveLength(1); expect(complete.runs[0]).toMatchObject({ dispatchPossible: true, status: 'completed' });
  const child = manager.getSession(complete.child!.scope.sessionId)!;
  expect(child.turns).toContainEqual(expect.objectContaining({ role: 'user', content: 'Explain  two spaces', metadata: expect.objectContaining({ runId: complete.runs[0]!.id }) }));
  expect(child.turns.some(message => message.role === 'assistant')).toBe(true);
  expect(JSON.stringify(manager.getSession(context.session.id)!.turns)).toBe(before);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(context.session.id);
  const previousRun = JSON.stringify(complete.runs[0]);
  await command('resume ' + first.id); expect(host.agents.journal.get(first.id).runs).toHaveLength(1);
  const continuation = await command('continue ' + first.id + ' Follow up independently');
  expect(JSON.stringify(continuation)).not.toContain('refused or unverified');
  expect(JSON.stringify(continuation)).not.toContain('Invalid /jobs');
  const next = await settled(first.id);
  expect(next.status).toBe('completed'); expect(next.runs).toHaveLength(2);
  expect(JSON.stringify(next.runs[0])).toBe(previousRun); expect(next.runs[1]!.id).not.toBe(next.runs[0]!.id);
  expect(next.runs[1]!.checkpoint).toEqual(complete.checkpoint);
  expect(hubProjection(host).parents).toContainEqual({ childId: child.id, parentId: context.session.id, parentKind: 'session' });
});
it('requires fresh approval after reinstallation for the same undispatched job', async () => {
  await command('agent --queue Inspect after restart'); const original = jobsFor(context)!.agents.journal.list()[0]!;
  expect(original.runs).toHaveLength(0); await closeJobsFor(context); install();
  allowed = false; await command('resume ' + original.id); expect(jobsFor(context)!.agents.journal.get(original.id).runs).toHaveLength(0);
  allowed = true; await command('resume ' + original.id); const complete = await settled(original.id);
  expect(complete.status).toBe('completed'); expect(complete.id).toBe(original.id); expect(complete.child).toEqual(original.child);
});
it('rejects a changed checkpoint and late approval after closure without creating a new run', async () => {
  await command('agent --queue Original assignment'); const host = jobsFor(context)!; const queued = host.agents.journal.list()[0]!;
  manager.addTurn(queued.child!.scope.sessionId, { role: 'user', content: 'Changed separately' });
  await command('resume ' + queued.id); expect(host.agents.journal.get(queued.id).runs).toHaveLength(0);
  let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  let answer!: (response: { decision: 'allow-once' }) => void;
  releaseApproval = async () => { began(); return new Promise(resolve => { answer = resolve; }); };
  const pending = command('agent Late assignment'); await started; await closeJobsFor(context); answer({ decision: 'allow-once' });
  expect(JSON.stringify(await pending)).toContain('closed or changed'); expect(host.agents.journal.list()).toHaveLength(1);
});
it('redacts full retained context before taking text pages and withholds truncated output', async () => {
  await command('agent --queue Output fixture'); const job = jobsFor(context)!.agents.journal.list()[0]!;
  const text = 'x'.repeat(16380) + '\nAuthorization: Bearer SYNTHETIC_SIDE_SECRET';
  expect(agentPage({ ...job, text }, 16384)).not.toContain('SYNTHETIC_SIDE_SECRET');
  expect(agentPage({ ...job, text: 'partial', truncated: true }, 0)).toContain('withheld');
});

it('retains foreground execution uncertainty instead of confirming agent cancellation', async () => {
  vi.stubEnv('CHEERS_SYNTHETIC_TOOLS', '1');
  let began!: () => void; const ready = new Promise<void>(resolve => { began = resolve; });
  vi.spyOn(native, 'startStreamed').mockImplementation(options => {
    began();
    const result = new Promise<{ stdout: string; stderr: string }>((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('Process cleanup is unverified.'), { stdout: '', stderr: 'Process cleanup is unverified.', code: null, terminationFailed: true }));
      if (options.abortSignal?.aborted) fail(); else options.abortSignal?.addEventListener('abort', fail, { once: true });
    });
    return { handle: { pid: 1, onOutput: () => () => {}, detach: () => {}, kill: async () => {}, result }, result };
  });
  await command('agent Report node version'); await ready;
  const host = jobsFor(context)!; const job = host.agents.journal.list()[0]!;
  const result = JSON.stringify(await command('cancel ' + job.id));
  expect(result).toContain('unknown'); expect(result).not.toContain('live cleanup settled');
  const unknown = host.agents.journal.get(job.id);
  expect(unknown).toMatchObject({ status: 'unknown', output: 'unknown', runs: [{ status: 'unknown', dispatchPossible: true }] });
  expect(host.agents.hasLive(job.id)).toBe(false);
  expect(manager.getSession(job.childSessionId)?.lastError).toContain('unverified');
  await command('continue ' + job.id + ' Another instruction');
  expect(host.agents.journal.get(job.id).runs).toHaveLength(1);
});
