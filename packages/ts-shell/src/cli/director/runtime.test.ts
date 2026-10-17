import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { createCliProviderRuntimeBridge } from '../provider/cliProviderRuntimeBridge.js';
import { closeJobsFor, installJobsRuntime, jobsFor } from '../runtime/jobs.js';
import { closeDirectorFor, directorCommandFor, directorRunFor } from '../runtime/director.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { createProviderReadinessCliTerminalEvent } from '../../entrypoints/providerReadinessCliSurface.js';
import { DirectorStore } from '../../workflow/director/store.js';
import { AgentSessions } from '../jobs/agent/session.js';
import { liveDirectors } from './state.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import * as native from '../../runtime/execution/local.js';

let scratch: string; let root: string; let manager: SessionManager; let context: ShellRuntimeContext;
let runtime: ShellSessionRuntime; let server: http.Server; let requests: Array<Record<string, any>>;
let purposes: string[];
let approvals: string[]; let approval: (name: string) => Promise<'allow-once' | 'deny'>;
let reply: (body: Record<string, any>, response: http.ServerResponse) => void;
function respond(response: http.ServerResponse, calls: Array<{ id: string; name: string; args: object }> = []): void {
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({
    choices: [{ message: { role: 'assistant', content: 'Fixture result', ...(calls.length ? { tool_calls: calls.map(call => ({ id: call.id,
      type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}) }, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  }));
}
function install(): void {
  installJobsRuntime(context, manager, runtime, () => ({ sessionId: context.session.id, workspaceRoot: root,
    agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit() {}, escalationPromptHandler: async prompt => {
      const name = prompt.context.toolName; approvals.push(name);
      return { decision: await approval(name), promptId: prompt.id, respondedAt: Date.now() };
    } }), { providerRuntimeBridge: createCliProviderRuntimeBridge({ runtimeConfig: () => context.runtimeConfig, options: {}, env: {} }) });
}
beforeEach(async () => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/director-test-')); root = path.join(scratch, 'project');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); const home = path.join(scratch, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  requests = []; approvals = []; purposes = []; approval = async () => 'allow-once'; reply = (_body, response) => respond(response);
  server = http.createServer(async (request, response) => {
    if (request.method === 'GET') { response.end('{"data":[{"id":"planner"},{"id":"vendor/executor"}]}'); return; }
    let source = ''; for await (const chunk of request) source += chunk;
    const body = JSON.parse(source); requests.push(body);
    const ledger = readBoundSessionState(manager, context.session).state.requestLedger as { scopes: Record<string, { pending: Record<string, { purpose: string }> }> };
    purposes.push(...Object.values(ledger.scopes).flatMap(scope => Object.values(scope.pending).map(attempt => attempt.purpose)));
    reply(body, response);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  manager = new SessionManager(); context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  const config = { ...getRuntimeConfig(root), provider: 'openai-compatible' as const, maxOutputTokens: 512, reserveTokens: 1024,
    retryEnabled: false, providerRetryMaxRetries: 0, maxTurns: 8, cacheWarming: 'off' as const,
    providerConnections: [{ id: 'fixture', provider: 'openai-compatible' as const, model: 'planner', apiKey: 'synthetic-fixture', baseUrl,
      authType: 'api-key' as const, status: 'connected' as const, thinkingEffort: null,
      createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }], activeProviderConnectionId: 'fixture' };
  context.configuration = new ConfigState(config, configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  runtime = { getCurrentRunController: () => null, getAgentMode: () => 'build', getPermissionScope: () => 'ask' } as unknown as ShellSessionRuntime;
  install();
});
afterEach(async () => {
  await closeDirectorFor(context); await closeJobsFor(context);
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true });
});
async function command(args: string): Promise<string> {
  const result = await routeSlashCommand('/director ' + args, { cwd: root, sessionId: context.session.id, directorCommand: directorCommandFor(context) });
  if (result?.kind !== 'local') throw new Error('Expected local director result.'); return result.output;
}
async function settled(id: string) {
  const host = jobsFor(context)!; const deadline = Date.now() + 5000;
  while (host.agents.hasLive(id)) { if (Date.now() > deadline) throw new Error('Worker did not settle.'); await new Promise(resolve => setTimeout(resolve, 10)); }
  return host.agents.journal.get(id);
}
async function drive(): Promise<void> {
  const director = directorRunFor(context, manager, () => undefined)!;
  const config = director.config(context.runtimeConfig); const gate = jobsFor(context)!.gate('task');
  const resolution = jobsFor(context)!.agentRuntimeInput!.providerRuntimeBridge.resolveCredentialSnapshot();
  const invocation = await runCliRuntimeInvocation({ ...gate, sessionId: context.session.id, prompt: 'KEEP_CONSTRAINT and original input order',
    historyMessages: manager.getSession(context.session.id)!.turns, workspaceRoot: root, signal: new AbortController().signal, maxTurns: 8,
    providerCredentialResolution: resolution, providerModeEnv: 'real', runtimeConfig: config, providerCatalog: context.configuration.current.catalog,
    requestPolicy: director.policy(undefined), admission: director.admission, featureTools: director.featureTools,
    continuityContext: director.contextText, onPromptAccepted: () => manager.persistUserPromptBarrier(context.session.id, 'KEEP_CONSTRAINT and original input order'),
    onTurnMessage: message => manager.addTurn(context.session.id, message),
  }, { hooks: new HookDispatcher(), checkProviderReadiness: async () => ({ ok: true }), createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent });
  for await (const event of invocation.events) expect(event.type, JSON.stringify(event)).not.toBe('query.failed');
}
it('uses the actual restricted main schema, independently approved worker effects and persistent same-model continuation', async () => {
  const original = context.runtimeConfig; let main = 0; let worker = 0;
  reply = (body, response) => {
    if (body.model === 'planner' && ++main === 1) respond(response, [{ id: 'delegate', name: 'worker_start', args: { prompt: 'KEEP_WORKER_CONSTRAINT first assignment' } }]);
    else if (body.model === 'vendor/executor' && ++worker === 1) respond(response, [{ id: 'effect', name: 'write', args: { path: 'worker.txt', content: 'approved' } }]);
    else respond(response);
  };
  expect(await command('on --model openai-compatible/vendor/executor --effort low')).toContain('Director on'); await drive();
  const first = await settled(jobsFor(context)!.agents.journal.list()[0]!.id);
  expect(first.status).toBe('completed'); expect(approvals).toEqual(['worker_start', 'write']);
  const schema = requests.find(body => body.model === 'planner')!.tools.map((tool: any) => tool.function.name);
  expect(schema).toContain('worker_start'); expect(schema).not.toContain('write'); expect(schema).not.toContain('bash'); expect(schema).not.toContain('task');
  const childId = first.childSessionId; const oldRun = JSON.stringify(first.runs[0]);
  expect(fs.readFileSync(path.join(root, 'worker.txt'), 'utf8')).toBe('approved');
  await command(`send ${first.id} KEEP_WORKER_CONSTRAINT  second assignment`); const second = await settled(first.id);
  expect(second).toMatchObject({ status: 'completed', childSessionId: childId, child: first.child });
  expect(JSON.stringify(second.runs[0])).toBe(oldRun); expect(second.runs[1]!.checkpoint).toEqual(first.checkpoint);
  const workers = requests.filter(body => body.model === 'vendor/executor');
  expect(workers).toHaveLength(3); expect(workers.every(body => body.reasoning_effort === 'low')).toBe(true);
  expect(JSON.stringify(workers.at(-1)!.messages)).toContain('first assignment'); expect(JSON.stringify(workers.at(-1)!.messages)).toContain('second assignment');
  expect(approvals).toEqual(['worker_start', 'write', 'worker_send']);
  const ledger = readBoundSessionState(manager, context.session).state.requestLedger as { scopes: Record<string, unknown> };
  expect(Object.values(ledger.scopes)).toEqual([expect.objectContaining({ inputTokens: 500, outputTokens: 50, pending: {} })]);
  expect(purposes.every(purpose => purpose.startsWith(`director:${new DirectorStore(manager, context.session).read().cycles[0]!.id}:`))).toBe(true);
  expect(purposes).toContainEqual(expect.stringContaining(`/job/${first.id}/run/${second.runs[1]!.id}`));
  expect(context.runtimeConfig).toBe(original); expect(await command('show ' + first.id)).toContain(childId); expect(approvals).toHaveLength(3);
  expect(await command('off')).toContain('cleanup settled'); expect(context.runtimeConfig).toBe(original);
});
it('denies a worker effect separately from delegation and preserves the original tool allowlist', async () => {
  approval = async name => name === 'write' ? 'deny' : 'allow-once'; let turn = 0;
  reply = (_body, response) => ++turn === 1 ? respond(response, [{ id: 'denied-effect', name: 'write', args: { path: 'denied.txt', content: 'denied' } }]) : respond(response);
  await command('on'); await command('spawn Separate effect'); const job = await settled(jobsFor(context)!.agents.journal.list()[0]!.id);
  expect(job.status).toBe('failed'); expect(approvals).toEqual(['worker_start', 'write']); expect(fs.existsSync(path.join(root, 'denied.txt'))).toBe(false);
  await command('off'); context.configuration = new ConfigState({ ...context.runtimeConfig, allowedTools: ['read', 'task'] }, configurationBinding(context));
  await command('on'); const projected = directorRunFor(context, manager, () => undefined)!.config(context.runtimeConfig);
  expect(projected.allowedTools).toEqual(['read']);
});
it('revokes a late delegation approval without creating durable intent or child', async () => {
  let began!: () => void; const held = new Promise<void>(resolve => { began = resolve; });
  let answer!: (decision: 'allow-once') => void; approval = async () => { began(); return new Promise(resolve => { answer = resolve; }); };
  await command('on'); const sessions = manager.listSessions().map(row => row.id);
  const pending = command('spawn Late assignment'); await held; await command('off'); answer('allow-once'); await pending;
  expect(jobsFor(context)!.agents.journal.list()).toEqual([]); expect(manager.listSessions().map(row => row.id)).toEqual(sessions); expect(requests).toEqual([]);
});
it('publishes permanent membership after the native creation fence and before child creation', async () => {
  await command('on'); const create = vi.spyOn(AgentSessions.prototype, 'create'); const change = DirectorStore.prototype.change;
  vi.spyOn(DirectorStore.prototype, 'change').mockImplementation(function (this: DirectorStore, row, update) {
    if (update.workers) throw new Error('Injected membership publication failure'); return change.call(this, row, update);
  });
  await command('spawn Publication uncertainty'); const job = jobsFor(context)!.agents.journal.list()[0]!;
  expect(job).toMatchObject({ status: 'unknown', runs: [] }); expect(job.child).toBeUndefined(); expect(create).not.toHaveBeenCalled(); expect(requests).toEqual([]);
});
it('requires a live selection after restart and refuses adopting the retained workers', async () => {
  await command('on'); await command('spawn Original assignment'); const first = await settled(jobsFor(context)!.agents.journal.list()[0]!.id);
  liveDirectors.delete(context); await closeJobsFor(context); install();
  expect(() => directorRunFor(context, manager, () => undefined)).toThrow('no adoptable'); expect(await command('status')).toContain('unknown');
  expect(await command(`send ${first.id} Must not replay`)).toContain('No live'); expect(requests).toHaveLength(1);
  const previous = new DirectorStore(manager, context.session).read().cycles[0]!;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(previous.createdAt - 1);
  let off: string;
  try { off = await command('off'); } finally { clock.mockRestore(); }
  expect(off, off).toContain('not adopted');
  expect(new DirectorStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'unknown', retired: true, endedAt: previous.createdAt });
  expect(requests).toHaveLength(1); expect(await command('on')).toContain('Director on');
});
it('confirms exact cancellation only after native cleanup settles', async () => {
  let began!: () => void; const ready = new Promise<void>(resolve => { began = resolve; });
  reply = (_body, response) => respond(response, [{ id: 'held-command', name: 'bash', args: { command: 'node -e "setTimeout(() => {}, 10000)"' } }]);
  vi.spyOn(native, 'startStreamed').mockImplementation(options => {
    began();
    const result = new Promise<{ stdout: string; stderr: string }>((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('Cancelled'), { stdout: '', stderr: 'Cancelled', code: null }));
      if (options.abortSignal?.aborted) fail(); else options.abortSignal?.addEventListener('abort', fail, { once: true });
    });
    return { handle: { pid: 1, onOutput: () => () => {}, detach: () => {}, kill: async () => {}, result }, result };
  });
  await command('on'); await command('spawn Hold exact command'); await ready;
  const id = jobsFor(context)!.agents.journal.list()[0]!.id;
  const previous = new DirectorStore(manager, context.session).read().cycles[0]!;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(previous.createdAt - 1);
  let off: string;
  try { off = await command('off'); } finally { clock.mockRestore(); }
  expect(off, off).toContain('cleanup settled'); expect(await settled(id)).toMatchObject({ status: 'cancelled' });
  expect(new DirectorStore(manager, context.session).read().cycles[0]).toMatchObject({ phase: 'disabled', endedAt: previous.createdAt });
  expect(requests).toHaveLength(1);
});
it('retains unknown mutation receipt outcomes and refuses any later model request or assignment', async () => {
  let turn = 0; reply = (_body, response) => ++turn === 1 ? respond(response, [{ id: 'receipt-effect', name: 'write', args: { path: 'uncertain.txt', content: 'effect' } }]) : respond(response);
  const rename = fs.renameSync; vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (/^op-.*\.json$/.test(path.basename(String(to))) && fs.existsSync(path.join(root, 'uncertain.txt'))) throw new Error('Injected receipt publication failure');
    rename(from, to);
  });
  await command('on'); await command('spawn Receipt uncertainty'); const job = await settled(jobsFor(context)!.agents.journal.list()[0]!.id);
  expect(fs.readFileSync(path.join(root, 'uncertain.txt'), 'utf8')).toBe('effect');
  expect(job).toMatchObject({ status: 'unknown', output: 'unknown', runs: [{ status: 'unknown' }] }); expect(requests).toHaveLength(1);
  expect(manager.getSession(job.childSessionId)!.turns.find(row => row.tool_call_id === 'receipt-effect')?.metadata).toMatchObject({ status: 'unknown' });
  expect(await command(`send ${job.id} Must refuse`)).toContain('settled worker checkpoint'); expect(job.runs).toHaveLength(1);
  expect(await command('off')).toContain('remain unknown');
});
