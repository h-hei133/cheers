import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import type { CommandDefinition } from '../../core/commands/types.js';
import { projectTrust } from '../../core/security/trust/store.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig, switchActiveSession } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import * as outputGuard from '../../core/shell/outputGuard.js';
import type { Skill } from '../../core/skills/skillLoader.js';
import * as skills from '../../core/skills/skillCatalog.js';
import { SessionManager } from '../../session/SessionManager.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import { handleRpcCommand } from './rpcServer.js';
import type { RpcResponse } from './protocol.js';
import { runPromptInputStream } from '../runtime/inputStream.js';

let root: string;
const retire: Array<() => void> = [];
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/rpc-commands-');
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});
afterEach(() => { retire.splice(0).forEach(close => close()); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const manager = new SessionManager(), session = manager.createNew(root);
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct',
    targetPathBase: root, gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, session,
    runtimeConfig: getRuntimeConfig(root) });
  const runtime = { commands: new ShellCommandRuntime(), getState: () => 'idle', waitForIdle: async () => {}, cancelCurrentRun: vi.fn() } as unknown as ShellSessionRuntime;
  const host = { ...createRuntimeRpcHost({ runtimeContext: context, sessionManager: manager, sessionRuntime: runtime,
    queue: new SubmissionQueue(() => context.session, () => {}), isStreaming: () => false, enqueuePrompt: () => {} }), emitResponse: () => {} };
  return { context, manager, host, runtime };
}

function command(name: string, summary: string, aliases?: readonly string[]): CommandDefinition {
  return { name, summary, aliases, kind: 'local', group: 'session', supportsNonInteractive: true,
    execute: async () => ({ kind: 'local', output: 'executed' }) };
}

function skillFile(directory: string, name: string) {
  const file = path.join(directory, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: ${name} instructions\n---\nInstructions for ${name}.\n`);
  return file;
}

it('discovers extension and named invocations with the same builtin precedence and drops retired registrations', async () => {
  const { context, host } = fixture();
  const close = registerCatalogContribution({ root, sessionId: context.session.id, tools: [], skills: () => [], commands: [
    command('fixture', 'Extension description', ['alias']), command('help', 'Shadowed extension'),
  ] }); retire.push(close);
  const response = await handleRpcCommand({ type: 'get_commands' }, host); expect(response.success).toBe(true);
  const rows = response.data!.commands as Array<{ name: string; description: string }>;
  const names = rows.map(row => row.name);
  for (const name of ['fixture', 'alias', 'recall', 'retain', 'reload-plugins', 'join', 'leave']) expect(names).toContain(name);
  expect(rows.find(row => row.name === 'help')!.description).not.toBe('Shadowed extension');
  expect(new Set(names).size).toBe(names.length);
  close(); const current = (await handleRpcCommand({ type: 'get_commands' }, host)).data!.commands as Array<{ name: string }>;
  expect(current.map(row => row.name)).not.toContain('fixture');
  expect(current.map(row => row.name)).not.toContain('alias');
});

it('uses explicit skill paths with no-skills and applies the existing project trust decision', async () => {
  const { context, host } = fixture();
  const explicit = skillFile(path.join(root, 'explicit'), 'named');
  skillFile(path.join(root, '.cheers', 'skills'), 'project-only');
  skillFile(path.join(root, 'home', '.cheers', 'skills'), 'personal');
  context.skillOptions = { noSkills: true, skillPaths: [explicit] };
  const names = async () => ((await handleRpcCommand({ type: 'get_commands' }, host)).data!.commands as Array<{ name: string }>).map(row => row.name);
  const restricted = await names();
  expect(restricted).toContain('skill:named'); expect(restricted).not.toContain('skill:personal'); expect(restricted).not.toContain('skill:project-only');
  context.skillOptions = { skillPaths: [explicit] };
  projectTrust.setProjectTrust(root, 'untrusted'); refreshShellRuntimeConfig(context);
  const untrusted = await names();
  expect(untrusted).toContain('skill:named'); expect(untrusted).toContain('skill:personal'); expect(untrusted).not.toContain('skill:project-only');
});

it('refuses an asynchronous skill result after the selected session changes', async () => {
  const { context, host, manager } = fixture();
  let release!: (value: readonly Skill[]) => void, started!: () => void;
  const pending = new Promise<readonly Skill[]>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  retire.push(registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [],
    skills: () => { started(); return pending; } }));
  const operation = handleRpcCommand({ type: 'get_commands' }, host);
  // The old synchronous projection never enters the shared skill owner.
  await Promise.race([entered, operation]);
  const next = manager.createNew(root, { activate: false });
  switchActiveSession(context, next, root, { cwd: root, projectRoot: root }); refreshShellRuntimeConfig(context);
  release([]);
  expect(await operation).toMatchObject({ success: false });
});

it('does not return a skill whose contribution was retired during acquisition', async () => {
  const { context, host } = fixture();
  const contributed: Skill = { name: 'contributed', description: 'Contributed', body: 'Body', filePath: path.join(root, 'skill.md'),
    source: 'extension', disableModelInvocation: false, unhonouredFields: [] };
  const close = registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: async () => {
    close(); return [contributed];
  } }); retire.push(close);
  const response = await handleRpcCommand({ type: 'get_commands' }, host);
  expect(response.success).toBe(false); expect(response.data).toBeUndefined();
});

it('refuses a contribution retired between catalogue resolution and the RPC consumer', async () => {
  const { context, host } = fixture();
  const contributed: Skill = { name: 'late', description: 'Late', body: 'Body', filePath: path.join(root, 'late.md'),
    source: 'extension', disableModelInvocation: false, unhonouredFields: [] };
  const close = registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => [contributed] });
  retire.push(close);
  const resolve = skills.resolveSkillCatalog;
  vi.spyOn(skills, 'resolveSkillCatalog').mockImplementation(async (...args) => {
    const result = await resolve(...args);
    queueMicrotask(close);
    return result;
  });
  expect(await handleRpcCommand({ type: 'get_commands' }, host)).toMatchObject({ success: false });
});

it('refuses synchronous retirement in the final skill validity callback', async () => {
  const { context, host } = fixture(); let reads = 0;
  const close = registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => [{
    name: 'self-retiring', description: 'Retired', body: 'Body', filePath: path.join(root, 'retired.md'), source: 'extension',
    disableModelInvocation: false, unhonouredFields: [], isCurrent: () => { if (++reads === 3) close(); return true; },
  }] }); retire.push(close);
  expect(await handleRpcCommand({ type: 'get_commands' }, host)).toMatchObject({ success: false });
  expect(reads).toBe(3);
});

it('revalidates discovery after the host promise resolves and before emitting its response', async () => {
  const { context, host } = fixture();
  const close = registerCatalogContribution({ root, sessionId: context.session.id, commands: [command('retiring', 'Retiring')],
    tools: [], skills: () => [] }); retire.push(close);
  const get = host.getCommands!;
  const rpc = { ...host, getCommands: async () => { const result = await get(); queueMicrotask(close); return result; } };
  expect(await handleRpcCommand({ type: 'get_commands' }, rpc)).toMatchObject({ success: false });
});

it('refuses a revoked skill at response publication even when its contribution stays registered', async () => {
  const { context, host } = fixture(); let current = true;
  retire.push(registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => [{
    name: 'revoked', description: 'Revoked', body: 'Body', filePath: path.join(root, 'revoked.md'), source: 'extension',
    disableModelInvocation: false, unhonouredFields: [], isCurrent: () => current,
  }] }));
  const get = host.getCommands!;
  const rpc = { ...host, getCommands: async () => { const result = await get(); queueMicrotask(() => { current = false; }); return result; } };
  expect(await handleRpcCommand({ type: 'get_commands' }, rpc)).toMatchObject({ success: false });
});

it('keeps JSONL reads and cancellation responsive during skill acquisition and joins a refused read at EOF', async () => {
  const { context, manager, runtime } = fixture();
  let release!: (value: readonly Skill[]) => void, entered = false;
  const pending = new Promise<readonly Skill[]>(resolve => { release = resolve; });
  retire.push(registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => {
    entered = true; return pending;
  } }));
  const stdin = new PassThrough(), responses: RpcResponse[] = [];
  vi.spyOn(outputGuard, 'writeRawStdout').mockImplementation(text => { const frame = JSON.parse(text);
    if (frame.type === 'response') responses.push(frame);
  });
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true, runPrompt: async () => {} });
  try {
    stdin.write('{"id":"commands","type":"get_commands"}\n');
    await vi.waitFor(() => expect(entered).toBe(true));
    stdin.write('{"id":"state","type":"get_state"}\n{"id":"abort","type":"abort"}\n');
    await vi.waitFor(() => expect(responses.find(response => response.id === 'state')?.success).toBe(true), { timeout: 500 });
    await vi.waitFor(() => expect(responses.find(response => response.id === 'abort')?.success).toBe(true), { timeout: 500 });
    expect(runtime.cancelCurrentRun).toHaveBeenCalledOnce();
    stdin.end();
    await vi.waitFor(() => expect(responses.find(response => response.id === 'commands')?.success).toBe(false), { timeout: 500 });
  } finally { release([]); stdin.end(); await run; }
});

it('keeps private skill-loader failures out of the RPC response', async () => {
  const { context, host } = fixture();
  retire.push(registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [],
    skills: async () => { throw new Error('private loader payload'); } }));
  const response = await handleRpcCommand({ type: 'get_commands' }, host);
  expect(response.success).toBe(false); expect(JSON.stringify(response)).not.toContain('private loader payload');
});
