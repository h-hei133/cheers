import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { HookDispatcher } from '../hooks/hookDispatcher.js';
import { SubagentLoader } from './subagentLoader.js';
import { runAgentsCommand } from './command.js';
import { createTaskToolDefinition } from '../tools/taskTool.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../../turn/tools.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { assertAgentSourceAccess } from './source.js';

afterEach(cleanupAdvisorHarnesses);
function fixture(approve?: ToolGateOptions['escalationPromptHandler']) {
  const setup = createAdvisorHarness(false, false); let trusted = true;
  const gate: ToolGateOptions = { sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: approve ? 'ask' : 'allow-all',
    hooks: new HookDispatcher(), emit: () => {}, escalationPromptHandler: approve };
  const host = { root: setup.root, trusted: () => trusted,
    sourceAccess: (absolute: string) => assertAgentSourceAccess(absolute, setup.root, [], gate.permissionScope, gate.denyRules), gate: () => gate };
  const input = path.join(setup.root, 'definition.md');
  fs.writeFileSync(input, '---\nname: review\ndescription: Review files\ntools: [read, write, task]\ndisallowedTools: [write]\nmaxTurns: 2\nmodel: openai/review-model\neffort: high\n---\nROLE_PROMPT\n');
  return { ...setup, gate, host, input, command: (...args: string[]) => runAgentsCommand(args, host), trust: (value: boolean) => { trusted = value; } };
}
it('publishes CRUD with user/project precedence, persists enable/model/effort, exports and reveals the lower override after deletion', async () => {
  const f = fixture();
  expect((await f.command('import', 'user', 'review', f.input)).report?.facts.status).toBe('persisted');
  expect((await f.command('create', 'project', 'review', f.input)).output).toContain('effective source=project');
  const loader = new SubagentLoader(f.root);
  expect(loader.getSubagent('review')).toMatchObject({ source: 'project', model: 'openai/review-model', effort: 'high', tools: ['read', 'write', 'task'] });
  expect((await f.command('show', 'review')).output).toContain('Shadowed: user');
  expect((await f.command('disable', 'project', 'review')).output).toContain('disabled');
  const runSubagent = vi.fn();
  expect((await createTaskToolDefinition().execute({ description: 'review', prompt: 'review', subagent_type: 'review' }, { taskId: 't', workspaceRoot: f.root, runSubagent })).success).toBe(false);
  expect(runSubagent).not.toHaveBeenCalled();
  await f.command('enable', 'project', 'review'); await f.command('model', 'project', 'review', 'inherit'); await f.command('effort', 'project', 'review', 'auto');
  expect(loader.getSubagent('review')).toMatchObject({ enabled: true, effort: null }); expect(loader.getSubagent('review')?.model).toBeUndefined();
  expect((await f.command('export', 'review', 'export.md')).report?.facts.status).toBe('persisted'); expect(fs.readFileSync(path.join(f.root, 'export.md'), 'utf8')).toContain('ROLE_PROMPT');
  await f.command('delete', 'project', 'review'); expect(loader.getSubagent('review')).toMatchObject({ source: 'user', model: 'openai/review-model', effort: 'high' });
  await f.command('disable', 'user', 'Explore'); expect(loader.getSubagent('Explore')).toBeUndefined();
  await f.command('delete', 'user', 'Explore'); expect(loader.getSubagent('Explore')?.source).toBe('builtin');
});
it('keeps denied writes and stale target/source approval snapshots unchanged', async () => {
  let effect: (() => void) | undefined; let decision: 'deny' | 'allow-once' = 'deny';
  const f = fixture(async () => { effect?.(); return { promptId: 'p', respondedAt: Date.now(), decision }; });
  const target = path.join(f.root, '.agents', 'review.md');
  expect((await f.command('create', 'project', 'review', f.input)).report?.facts.status).toBe('unchanged'); expect(fs.existsSync(target)).toBe(false);
  decision = 'allow-once'; await f.command('create', 'project', 'review', f.input); const original = fs.readFileSync(target, 'utf8');
  effect = () => fs.writeFileSync(f.input, original.replace('ROLE_PROMPT', 'LATE_SOURCE'));
  expect((await f.command('edit', 'project', 'review', f.input)).output).toContain('FILE_CONTENT_CHANGED'); expect(fs.readFileSync(target, 'utf8')).toBe(original);
  effect = () => fs.writeFileSync(target, original.replace('ROLE_PROMPT', 'LATE_TARGET'));
  expect((await f.command('disable', 'project', 'review')).output).toContain('FILE_CONTENT_CHANGED'); expect(fs.readFileSync(target, 'utf8')).toContain('LATE_TARGET');
});
it('preserves trust and valid user definitions while exposing malformed overrides and rejecting invalid publication', async () => {
  const f = fixture(); await f.command('create', 'user', 'review', f.input); await f.command('create', 'project', 'review', f.input);
  f.trust(false); expect((await f.command('disable', 'project', 'review')).output).toContain('untrusted');
  expect(new SubagentLoader(f.root).getSubagent('review', false)?.source).toBe('user');
  f.trust(true); fs.writeFileSync(path.join(f.root, '.agents', 'review.md'), '---\nname: review\ndescription: invalid\nmaxTurns: -1\n---\nno');
  expect((await f.command('list')).output).toContain('invalid');
  const runner = vi.fn(); const result = await createTaskToolDefinition().execute({ description: 'inspect', prompt: 'inspect', subagent_type: 'review' }, { taskId: 't', workspaceRoot: f.root, runSubagent: runner });
  expect(result.success).toBe(false); expect(runner).not.toHaveBeenCalled();
  expect((await f.command('edit', 'project', 'review', f.input)).report?.facts.status).toBe('persisted');
  fs.writeFileSync(f.input, fs.readFileSync(f.input, 'utf8').replace('effort: high', 'effort: extreme'));
  expect((await f.command('edit', 'project', 'review', f.input)).output).toContain('Invalid effort');
});
it('binds ordinary task approval to the preapproval role identity with zero late child launch', async () => {
  const f = fixture(); await f.command('create', 'project', 'review', f.input);
  const runner = vi.fn(); const target = path.join(f.root, '.agents', 'review.md');
  const gate = { ...f.gate, permissionScope: 'ask' as const, runSubagent: runner, escalationPromptHandler: async () => {
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('ROLE_PROMPT', 'REPLACED')); return { promptId: 'p', respondedAt: Date.now(), decision: 'allow-once' as const };
  } };
  const pool = new Map([['task', createTaskToolDefinition()]]); const adapted = adaptTools(pool, gate)[0]!; const hooks = createToolHooks(gate, pool);
  const args = adapted.prepareArguments!({ description: 'inspect', prompt: 'inspect', subagent_type: 'review' });
  const call = { id: 'task', name: 'task', args }; const assistantMessage = { role: 'assistant' as const, content: '' };
  expect(await hooks.beforeToolCall!({ call, args, assistantMessage })).toBeUndefined();
  expect((await adapted.execute('task', args)).output).toContain('changed after task approval'); expect(runner).not.toHaveBeenCalled();
});
it('revokes child permission admission after asynchronous approval without expanding parent authority', async () => {
  const f = fixture(); fs.writeFileSync(f.input, fs.readFileSync(f.input, 'utf8').replace('disallowedTools: [write]', 'disallowedTools: []').replace('model: openai/review-model\neffort: high\n', ''));
  await f.command('create', 'project', 'review', f.input); const target = path.join(f.root, '.agents', 'review.md');
  const write = vi.fn(async () => ({ success: true, output: 'wrong effect' }));
  const tools = new Map([['write', { name: 'write', description: 'write', argsSchema: {}, execute: write }]]);
  const runner = createSubagentRunner({ defaultMaxSteps: 2, step: async () => ({ text: '', toolCalls: [{ id: 'child-write', name: 'write', args: { path: 'output.txt', content: 'wrong' } }], stopReason: 'stop' }) }, tools,
    { ...f.gate, permissionScope: 'ask', escalationPromptHandler: async () => {
      fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('ROLE_PROMPT', 'REPLACED')); return { promptId: 'p', respondedAt: Date.now(), decision: 'allow-once' };
    } });
  const result = await createTaskToolDefinition().execute({ description: 'inspect', prompt: 'inspect', subagent_type: 'review' }, { taskId: 't', workspaceRoot: f.root, runSubagent: runner });
  expect(result.success).toBe(false); expect(write).not.toHaveBeenCalled();
});
it('preserves actual publication evidence on after-rename sync failure, after-hook replacement and dispatcher rejection', async () => {
  const f = fixture(async () => ({ promptId: 'p', respondedAt: Date.now(), decision: 'allow-once' }));
  const events: { type: string; success?: boolean }[] = []; const target = path.join(f.root, '.agents', 'review.md');
  const hooks = new HookDispatcher(); const host = { ...f.host, gate: () => ({ ...f.gate, hooks, emit: (event: { type: string; success?: boolean }) => events.push(event) }) };
  const sync = fs.fsyncSync; const fault = vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
    if (fs.fstatSync(fd).isDirectory()) throw new Error('Synthetic after-rename directory sync failure'); sync(fd);
  });
  const uncertain = await runAgentsCommand(['create', 'project', 'review', f.input], host); fault.mockRestore();
  expect(uncertain.report?.facts.status).toBe('unverified'); expect(fs.readFileSync(target, 'utf8')).toContain('ROLE_PROMPT');
  hooks.registerInProcessHook({ name: 'replace-after-write', event: 'PostToolUse', matcher: 'apply_patch', handler: () => {
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace('ROLE_PROMPT', 'LATE_PROMPT')); return { decision: 'allow' };
  } });
  const replaced = await runAgentsCommand(['edit', 'project', 'review', f.input], host);
  expect(replaced.report?.facts).toMatchObject({ status: 'unverified', publication: 'persisted' }); expect(replaced.output).toContain('current publication verification is unverified');
  expect(events.filter(event => event.type === 'tool.result').every(event => event.success === false)).toBe(true);
  const rejecting = new HookDispatcher(); const dispatch = rejecting.dispatch.bind(rejecting);
  rejecting.dispatch = async event => { if (event.eventName === 'PostToolUse') throw new Error('Synthetic entire dispatcher rejection'); return dispatch(event); };
  const rejected = await runAgentsCommand(['edit', 'project', 'review', f.input], { ...host, gate: () => ({ ...host.gate(), hooks: rejecting }) });
  expect(rejected.report?.facts).toMatchObject({ status: 'unverified', publication: 'persisted' });
  expect(events.filter(event => event.type === 'tool.result')).toHaveLength(3); expect(events.at(-1)?.success).toBe(false);
});
it('ordinary task source admission preserves user definitions and refuses denied project and user prompts before dispatch', async () => {
  const f = fixture(); await f.command('create', 'user', 'review', f.input); const loader = new SubagentLoader(f.root);
  const captured = vi.fn(async () => ({ text: 'answer', failed: false, steps: 1, allowedTools: [] }));
  const input = { description: 'inspect', prompt: 'inspect', subagent_type: 'review' };
  const options = { ...f.gate, runSubagent: captured };
  expect((await runPreparedTool(createTaskToolDefinition(), input, options)).isError).toBe(false);
  expect(captured).toHaveBeenCalledOnce(); captured.mockClear();
  expect((await runPreparedTool(createTaskToolDefinition(), input, { ...options, denyRules: [{ tool: 'read', pattern: loader.getSubagent('review')!.filePath! }] })).isError).toBe(true);
  expect(captured).not.toHaveBeenCalled();
  await f.command('create', 'project', 'review', f.input);
  expect((await runPreparedTool(createTaskToolDefinition(), input, { ...options, denyRules: [{ tool: 'read', pattern: loader.getSubagent('review')!.filePath! }] })).isError).toBe(true);
  expect(captured).not.toHaveBeenCalled();
});

it('uses parent source admission before management discovery reads role metadata', async () => {
  const f = fixture(); const directory = path.join(f.root, '.agents'); fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, 'hidden.md');
  fs.writeFileSync(target, '---\nname: body-only-name\ndescription: Hidden\nmodel: body-only-model\n---\nPRIVATE_ROLE_BODY');
  const sourceAccess = vi.fn((absolute: string) => { if (absolute === target) throw new Error('Synthetic source refusal'); });
  const open = vi.spyOn(fs, 'openSync');
  for (const action of ['list', 'discover']) {
    const result = await runAgentsCommand([action], { ...f.host, sourceAccess });
    expect(result.output).toContain('Definition source refused or unreadable');
    expect(result.output).not.toMatch(/body-only-name|body-only-model|PRIVATE_ROLE_BODY/);
  }
  expect(sourceAccess).toHaveBeenCalledWith(target);
  expect(open.mock.calls.some(call => call[0] === target)).toBe(false);
});
