import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { loadMcpConfigs, mcpConfigPath } from '../../core/mcp/config/document.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CoreMcpGateway } from '../../core/mcp/gateway.js';
import { cancelMcpFor, installMcpRuntime, mcpCommandFor, mcpDefinitionFor } from '../runtime/mcp.js';

afterEach(cleanupAdvisorHarnesses);
function fixture() {
  const f = createAdvisorHarness(false, false); const runtimeConfig = getRuntimeConfig(f.root);
  const binding = configurationBinding({ projectRoot: f.root, session: f.session });
  const configuration = new ConfigState(runtimeConfig, binding);
  const context = { cwd: f.root, projectRoot: f.root, session: f.session, configuration,
    get runtimeConfig() { return configuration.current.config; } } as ShellRuntimeContext;
  const changed = vi.fn(async () => {}); let decision: 'allow-once' | 'deny' = 'deny'; let effect = () => {};
  const approve = vi.fn(async () => { effect(); return { decision }; });
  const gate: ToolGateOptions = { sessionId: f.session.id, workspaceRoot: f.root, agentMode: 'build', permissionScope: 'ask',
    hooks: new HookDispatcher(), emit: () => {}, escalationPromptHandler: approve };
  installMcpRuntime(context, { configurationChanged: changed } as unknown as CoreMcpGateway, () => gate);
  return { ...f, context, changed, gate, approve, target: mcpConfigPath(f.root, 'project'), add: mcpDefinitionFor(context),
    allow: () => { decision = 'allow-once'; }, effect: (value: () => void) => { effect = value; } };
}

it('uses the existing exact-byte approval and writer without a temporary definition file or connection', async () => {
  const f = fixture(); const before = fs.readdirSync(f.root);
  const definition = { command: '/a path/server', args: ['--value', 'two words', ''] };
  expect(await f.add('project', 'local', definition)).toContain('denied');
  expect(fs.readdirSync(f.root)).toEqual(before); expect(f.changed).not.toHaveBeenCalled();
  f.allow(); expect(await f.add('project', 'local', definition)).toContain('explicit /mcp test or /mcp reconnect starts discovery');
  expect(loadMcpConfigs(f.root, true).local).toMatchObject(definition);
  expect(f.approve).toHaveBeenCalledTimes(2); expect(f.changed).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(path.join(f.root, '.cheers', 'mcp.json'))).toBe(true);
  expect(fs.existsSync(path.join(f.root, '.cheers.mcp.json'))).toBe(false);
});

it.each(['session', 'root', 'substrate', 'revalidated'])('rejects an original wizard after its %s binding changes before approval', async kind => {
  const f = fixture(); f.allow();
  if (kind === 'session') f.context.session = { ...f.context.session, id: 'different' };
  else if (kind === 'root') f.context.cwd = path.dirname(f.root);
  else if (kind === 'substrate') f.context.configuration.transition(configurationBinding({ projectRoot: f.root, session: { id: 'different' } }));
  else {
    const binding = configurationBinding(f.context); const config = f.context.runtimeConfig;
    f.context.configuration.transition(binding);
    f.context.configuration.publish(f.context.configuration.begin(binding), config, binding);
  }
  expect(await f.add('project', 'local', { command: 'server', args: [] })).toMatch(kind === 'substrate' ? /validation failed/i : /changed|unavailable/i);
  expect(f.approve).not.toHaveBeenCalled(); expect(fs.existsSync(f.target)).toBe(false);
});

it('shares the original pending command cancellation boundary and refuses overlapping publications', async () => {
  const f = fixture(); let release!: () => void, entered!: () => void;
  const pending = new Promise<void>(resolve => { entered = resolve; });
  f.gate.escalationPromptHandler = async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return { decision: 'allow-once' }; };
  const first = f.add('project', 'first', { command: 'server', args: [] }); await pending;
  expect(await f.add('project', 'second', { command: 'server', args: [] })).toContain('already pending');
  cancelMcpFor(f.context); release(); expect(await first).toContain('publication refused');
  expect(fs.existsSync(f.target)).toBe(false); expect(f.changed).not.toHaveBeenCalled();
});

it.each(['state', 'cancel', 'owner'])('rechecks %s after the ordinary approval before publishing', async kind => {
  const f = fixture(); f.allow();
  f.effect(() => {
    if (kind === 'state') { fs.mkdirSync(path.dirname(f.target), { recursive: true }); fs.writeFileSync(f.target, '{"mcpServers":{},"external":true}'); }
    else if (kind === 'cancel') cancelMcpFor(f.context);
    else f.context.session = { ...f.context.session, id: 'different' };
  });
  expect(await f.add('project', 'local', { command: 'server', args: [] })).toMatch(kind === 'cancel' ? /publication refused/i : /changed|FILE_CONTENT_CHANGED/i);
  expect(f.changed).not.toHaveBeenCalled();
  if (kind === 'state') expect(fs.readFileSync(f.target, 'utf8')).toBe('{"mcpServers":{},"external":true}');
  else expect(fs.existsSync(f.target)).toBe(false);
});

it('keeps command-file source authorization while typed definitions use the same publication owner', async () => {
  const f = fixture(); f.allow(); const outside = path.join(f.directory, 'outside.json');
  fs.writeFileSync(outside, JSON.stringify({ command: 'server' }));
  const result = await mcpCommandFor(f.context)(['add', 'project', 'local', outside], { cwd: f.root, sessionId: f.session.id });
  expect(result.kind === 'local' && result.output).toContain('outside the registered workspace');
  expect(f.approve).not.toHaveBeenCalled(); expect(fs.existsSync(f.target)).toBe(false);
  expect(await f.add('project', 'local', { command: 'server', args: [] })).toContain('explicit /mcp test or /mcp reconnect starts discovery');
});

it.each([{ url: 'http://remote.invalid/' }, { command: 'server', args: Array(257).fill('a') }, { command: 'server', unknown: true }])('rejects invalid typed input before approval', async definition => {
  const f = fixture(); f.allow();
  await f.add('project', 'local', definition);
  expect(f.approve).not.toHaveBeenCalled(); expect(fs.existsSync(f.target)).toBe(false);
});

it('does not leak typed URL query values into approval or results', async () => {
  const f = fixture(); const prompts: string[] = [];
  f.gate.escalationPromptHandler = async prompt => { prompts.push(JSON.stringify(prompt)); return { decision: 'allow-once' }; };
  const result = await f.add('project', 'local', { url: 'https://synthetic.invalid/mcp?credential=synthetic-private-value' });
  expect(JSON.stringify([prompts, result])).not.toContain('synthetic-private-value');
  expect(prompts.join('')).toContain('SHA-256');
  expect(loadMcpConfigs(f.root, true).local!.url).toContain('synthetic-private-value');
});

it('rejects approval after a directory configuration shadows the captured legacy source', async () => {
  const f = fixture(); const legacy = path.join(f.root, '.cheers.mcp.json');
  fs.writeFileSync(legacy, '{"mcpServers":{}}'); f.allow();
  const current = path.join(f.root, '.cheers', 'mcp.json');
  f.effect(() => { fs.mkdirSync(path.dirname(current), { recursive: true }); fs.writeFileSync(current, '{"mcpServers":{},"external":true}'); });
  expect(await f.add('project', 'local', { command: 'server', args: [] })).toContain('FILE_CONTENT_CHANGED');
  expect(fs.readFileSync(legacy, 'utf8')).toBe('{"mcpServers":{}}');
  expect(fs.readFileSync(current, 'utf8')).toBe('{"mcpServers":{},"external":true}');
  expect(f.changed).not.toHaveBeenCalled();
});
