import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { HookDispatcher } from '../hooks/hookDispatcher.js';
import { runMcpConfigCommand } from '../../cli/mcp/config.js';
import { loadMcpConfigs, mcpConfigPath } from './config/document.js';
import { CoreMcpGateway } from './gateway.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { runMcpShellAction } from '../commands/mcp/command.js';
import { runCliMcpCommand } from '../../entrypoints/cliMcpModule.js';

const owners: CoreMcpGateway[] = [];
afterEach(async () => { await Promise.all(owners.splice(0).map(owner => owner.close())); cleanupAdvisorHarnesses(); });
function fixture(approve?: ToolGateOptions['escalationPromptHandler']) {
  const setup = createAdvisorHarness(false, false); let trusted = true;
  fs.mkdirSync(path.join(setup.root, '.cheers'));
  const gate: ToolGateOptions = { sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: approve ? 'ask' : 'allow-all',
    hooks: new HookDispatcher(), emit: () => {}, escalationPromptHandler: approve };
  const gateway = new CoreMcpGateway(setup.root); owners.push(gateway);
  const host = { root: setup.root, trusted: () => trusted, sourceAccess: () => {}, gate: () => gate, changed: () => gateway.configurationChanged() };
  const input = path.join(setup.root, 'definition.jsonc'); const log = path.join(setup.root, 'mcp.log');
  fs.writeFileSync(input, JSON.stringify({ command: process.execPath, args: [path.resolve('src/core/mcp/fixtures/mockMcpServer.mjs'), '--log', log, '--content'] }));
  return { ...setup, gate, host, input, log, gateway, command: (...args: string[]) => runMcpConfigCommand(args, host), trust: (value: boolean) => { trusted = value; } };
}
function records(log: string) { return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []; }

it('publishes scoped definitions with a retained user source, local override, cold save and tested connection', async () => {
  const f = fixture(); const target = mcpConfigPath(f.root, 'project');
  expect((await f.command('add', 'user', 'local', f.input)).report?.facts).toMatchObject({ status: 'persisted', connection: 'not-tested' });
  expect(records(f.log)).toEqual([]);
  expect((await f.command('disable', 'project', 'local')).report?.facts.status).toBe('persisted');
  expect(loadMcpConfigs(f.root, true).local).toMatchObject({ scope: 'user', sourcePath: mcpConfigPath(f.root, 'user'), overridePath: target, enabled: false });
  expect(loadMcpConfigs(f.root, false).local).not.toHaveProperty('enabled');
  expect((await f.command('enable', 'project', 'local')).report?.facts.status).toBe('persisted');
  const action = await runMcpShellAction(['test', 'local'], { cwd: f.root });
  if (action.kind !== 'shell-action') throw new Error('Missing test shell action');
  const lines: string[] = []; await runCliMcpCommand({ ...action, gateway: f.gateway, renderer: { renderLine: line => lines.push(line) } });
  expect(lines.join('\n')).toContain('no tools called');
  expect(records(f.log).some(item => item.event === 'tools/list')).toBe(true);
  expect(records(f.log).some(item => item.event === 'tools/call')).toBe(false);
  expect((await f.command('remove', 'project', 'local')).report?.facts.status).toBe('persisted');
  expect(loadMcpConfigs(f.root, true).local).not.toHaveProperty('overridePath');
  expect((await f.command('remove', 'user', 'local')).report?.facts.status).toBe('persisted');
  expect(Object.keys(loadMcpConfigs(f.root, true))).toEqual([]);
});

it('preserves BOM/comments, unrelated fields and confidential values across an approved edit', async () => {
  const f = fixture(); const target = mcpConfigPath(f.root, 'project');
  fs.writeFileSync(target, '\uFEFF{\r\n// retained comment\r\n"other": 42, "mcpServers": {}\r\n}\r\n');
  fs.writeFileSync(f.input, JSON.stringify({ command: process.execPath, args: ['private-value'], env: { CUSTOM: 'private-env' } }));
  expect((await f.command('add', 'project', 'local', f.input)).report?.facts.status).toBe('persisted');
  const text = fs.readFileSync(target, 'utf8'); expect(text.startsWith('\uFEFF')).toBe(true); expect(text).toContain('// retained comment\r\n'); expect(text).toContain('"other": 42');
  const shown = await f.command('show', 'local'); expect(shown.output).not.toMatch(/private-value|private-env/);
  expect(loadMcpConfigs(f.root, true).local!.env).toEqual({ CUSTOM: 'private-env' });
});

it('keeps denied and stale approval publications unchanged and does not expose confidential approval values', async () => {
  let effect: (() => void) | undefined; let decision: 'deny' | 'allow-once' = 'deny'; const previews: string[] = [];
  const f = fixture(async prompt => { previews.push(JSON.stringify(prompt)); effect?.(); return { promptId: 'p', respondedAt: Date.now(), decision }; });
  fs.writeFileSync(f.input, JSON.stringify({ transport: 'http', url: 'https://synthetic.invalid/mcp?credential=private-query', headers: { Authorization: 'private-header' } }));
  const target = mcpConfigPath(f.root, 'project');
  expect((await f.command('add', 'project', 'local', f.input)).report?.facts.status).toBe('unchanged'); expect(fs.existsSync(target)).toBe(false);
  expect(previews.join('\n')).not.toMatch(/private-query|private-header/); expect(previews.join('\n')).toContain('SHA-256');
  decision = 'allow-once'; await f.command('add', 'project', 'local', f.input); const original = fs.readFileSync(target, 'utf8');
  effect = () => fs.writeFileSync(target, original + ' ');
  expect((await f.command('disable', 'project', 'local')).output).toContain('FILE_CONTENT_CHANGED'); expect(fs.readFileSync(target, 'utf8')).toBe(original + ' ');
  effect = () => fs.writeFileSync(f.input, '{"command":"different"}');
  expect((await f.command('edit', 'project', 'local', f.input)).output).toContain('FILE_CONTENT_CHANGED'); expect(fs.readFileSync(target, 'utf8')).toBe(original + ' ');
  effect = undefined; await f.command('add', 'user', 'inherited', f.input); await f.command('disable', 'project', 'inherited');
  const override = fs.readFileSync(target, 'utf8'); const user = mcpConfigPath(f.root, 'user');
  effect = () => fs.writeFileSync(user, fs.readFileSync(user, 'utf8').replace('different', 'replaced-source'));
  expect((await f.command('enable', 'project', 'inherited')).output).toContain('FILE_CONTENT_CHANGED');
  expect(fs.readFileSync(target, 'utf8')).toBe(override);
});

it('retains exact publication evidence when post-use hooks replace the config', async () => {
  const f = fixture(); const target = mcpConfigPath(f.root, 'project');
  f.gate.hooks.registerInProcessHook({ name: 'replace-config', event: 'PostToolUse', matcher: 'apply_patch', handler: () => {
    fs.writeFileSync(target, '{"mcpServers":{}}'); return { decision: 'allow' };
  } });
  expect((await f.command('add', 'project', 'local', f.input)).report?.facts.status).toBe('unverified');
  expect(fs.readFileSync(target, 'utf8')).toBe('{"mcpServers":{}}');
});

it('revokes a disabled held connection without replay while preserving an unrelated subscription', async () => {
  const f = fixture(); await f.command('add', 'project', 'local', f.input);
  fs.writeFileSync(f.input, JSON.stringify({ command: process.execPath, args: [path.resolve('src/core/mcp/fixtures/mockMcpServer.mjs'), '--log', f.log, '--content', '--hang-content'] }));
  await f.command('add', 'project', 'held', f.input);
  await f.gateway.content('local', { action: 'subscribe', uri: 'fixture://one' });
  const pending = f.gateway.content('held', { action: 'read', uri: 'fixture://held' }).catch(error => error);
  await vi.waitFor(() => expect(records(f.log).some(item => item.event === 'resources/read')).toBe(true));
  expect((await f.command('disable', 'project', 'held')).report?.facts).toMatchObject({ status: 'persisted', connection: 'not-tested' });
  expect(await pending).toBeInstanceOf(Error); expect(records(f.log).filter(item => item.event === 'resources/read')).toHaveLength(1);
  expect(f.gateway.notifications('local')[0]?.state).toBe('live');
  expect(f.gateway.notifications('held')[0]?.state).toBe('not-connected');
});

it('keeps untrusted project changes, malformed/duplicate/unsafe definitions and denied source files cold', async () => {
  const f = fixture(); f.trust(false);
  expect((await f.command('add', 'project', 'local', f.input)).report?.facts.status).toBe('unchanged');
  expect(records(f.log)).toEqual([]); f.trust(true);
  for (const text of ['{"command":"node","command":"other"}', '{"command":"node","env":{"__proto__":"bad"}}', '{"args":[7]}']) {
    fs.writeFileSync(f.input, text); expect((await f.command('add', 'project', 'local', f.input)).report?.facts.status).toBe('unchanged');
  }
  const denied = { ...f.host, sourceAccess: () => { throw new Error('Source denied'); } };
  expect((await runMcpConfigCommand(['add', 'project', 'local', f.input], denied)).output).toContain('Source denied');
  expect(fs.existsSync(mcpConfigPath(f.root, 'project'))).toBe(false);
});

it('tests a literal all server exactly and refuses an absent target without starting other servers', async () => {
  const f = fixture(); await f.command('add', 'project', 'unrelated', f.input);
  const lines: string[] = []; const renderer = { renderLine: (line: string) => lines.push(line) };
  await runCliMcpCommand({ gateway: f.gateway, renderer, mcpAction: 'test', mcpTarget: 'all' });
  expect(lines.join('\n')).toContain('Unknown'); expect(records(f.log)).toEqual([]);
  await f.command('add', 'project', 'all', f.input);
  await runCliMcpCommand({ gateway: f.gateway, renderer, mcpAction: 'test', mcpTarget: 'all' });
  expect(records(f.log).filter(item => item.event === 'start')).toHaveLength(1);
  expect(f.gateway.notifications('unrelated')[0]?.state).toBe('not-connected');
  expect(records(f.log).some(item => item.event === 'tools/call')).toBe(false);
});

it('refuses invalid candidate documents and orphaned inherited overrides before approval', async () => {
  const approve = vi.fn(async () => ({ promptId: 'p', respondedAt: Date.now(), decision: 'allow-once' as const }));
  const f = fixture(approve); const target = mcpConfigPath(f.root, 'project');
  fs.writeFileSync(target, JSON.stringify({ mcpServers: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`s${i}`, { command: 'node' }])) }));
  const original = fs.readFileSync(target, 'utf8');
  expect((await f.command('add', 'project', 'overflow', f.input)).report?.facts.status).toBe('unchanged');
  expect(fs.readFileSync(target, 'utf8')).toBe(original); expect(approve).not.toHaveBeenCalled();
  fs.writeFileSync(target, '{"mcpServers":{}}');
  await f.command('add', 'user', 'local', f.input); await f.command('disable', 'project', 'local'); approve.mockClear();
  const user = mcpConfigPath(f.root, 'user'); const userOriginal = fs.readFileSync(user, 'utf8');
  expect((await f.command('remove', 'user', 'local')).report?.facts.status).toBe('unchanged');
  expect(fs.readFileSync(user, 'utf8')).toBe(userOriginal); expect(approve).not.toHaveBeenCalled();
  expect(loadMcpConfigs(f.root, true).local).toMatchObject({ scope: 'user', enabled: false });
});

it('keeps denied diagnostic reads and hook credentials out of configuration reports and events', async () => {
  const f = fixture(); const target = mcpConfigPath(f.root, 'project'); const events: unknown[] = [];
  f.gate.hooks.registerInProcessHook({ name: 'feedback-secret', event: 'PostToolUse', matcher: 'apply_patch', handler: () => ({
    decision: 'allow', feedback: 'Bearer synthetic-secret\npassword: synthetic-password',
  }) });
  const result = await runMcpConfigCommand(['add', 'project', 'confidential_server', f.input], {
    ...f.host, gate: () => ({ ...f.gate, emit: event => events.push(event) }),
  });
  expect(result.report?.facts.status).toBe('persisted');
  expect(result.output + JSON.stringify(events)).not.toMatch(/synthetic-secret|synthetic-password/);
  const denied = { ...f.host, gate: () => ({ ...f.gate, denyRules: [{ tool: 'read', pattern: target }] }) };
  const listed = await runMcpConfigCommand(['list'], denied);
  expect(listed.report?.facts.status).toBe('unchanged'); expect(listed.output).not.toContain('confidential_server');
});
