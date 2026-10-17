import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from '../../core/paths/profile/context.js';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { SessionManager } from '../../session/SessionManager.js';
import { AgentMemoryManager } from '../../core/subagents/agentMemoryManager.js';
import { assertAgentSourceAccess } from '../../core/subagents/source.js';
import { projectMemoryRootFor } from '../../memory/projectMemoryRoot.js';
import { getSessionUsage, recordSessionUsage } from '../../observability/usageTelemetry.js';
import { getGlobalRotatingFileSink } from '../../observability/rotatingFileSink.js';
import { defaultPolicyFilePath } from '../../core/shell/approval/store.js';
import { extensionFile } from '../../extensions/store/state.js';
import { sourceFile } from '../../extensions/registry/sources.js';
import { getPluginStoragePath } from '../../core/commands/plugin/store.js';
import { parseCliArgs } from '../../entrypoints/cliArgs.js';
import { profileScope } from '../../core/paths/profile/scope.js';
import { setSessionTodos, getSessionTodos } from '../../core/commands/todoCommandRuntime.js';
import { sidebarSessionScopeId } from '../../core/commands/sidebarCommandEvents.js';
import { DEFAULT_COMPACT_INJECTION_STATE_STORE } from '../../context/compact/injection/compactInjectionState.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../core/shell/configuration.js';

let home: string;
let workspace: string;
let a: ProfileContext;
let b: ProfileContext;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-consumers-'));
  workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  a = createProfileContext({ homeDir: home, name: 'a', env: {} });
  b = createProfileContext({ homeDir: home, name: 'b', env: {} });
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function configure(profile: ProfileContext, key: string) {
  withProfile(profile, () => fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider: 'openai', offline: true,
    activeProviderConnectionId: 'relay', providerConnections: [{ id: 'relay', provider: 'openai', authType: 'api-key',
      apiKey: key, model: 'gpt-4o', baseUrl: `https://${profile.id}.example/v1`, createdAt: '2026-01-01', updatedAt: '2026-01-01' }] })));
}

it('resolves the actual credential and same-name sessions independently in one workspace', () => {
  configure(a, 'synthetic-key-a'); configure(b, 'synthetic-key-b');
  const managerA = withProfile(a, () => new SessionManager());
  const managerB = withProfile(b, () => new SessionManager());
  for (const [profile, manager] of [[a, managerA], [b, managerB]] as const) {
    withProfile(profile, () => {
      expect(manager.sessionExists('same')).toBe(false);
      manager.createNewWithId('same', workspace);
      manager.addTurn('same', { role: 'user', content: `message from ${profile.id}` });
      const resolved = resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspace), env: {} });
      expect(resolved.credential?.apiKey).toBe(`synthetic-key-${profile.id}`);
      expect(resolved.baseUrl ?? resolved.credential?.baseUrl).toBe(`https://${profile.id}.example/v1`);
    });
  }
  expect(managerA.getSessionDirPath('same')).not.toBe(managerB.getSessionDirPath('same'));
  expect(managerA.listSessions().map(session => session.id)).toEqual(['same']);
  expect(managerB.listSessions().map(session => session.id)).toEqual(['same']);
  expect(managerA.getSession('same')?.turns.map(turn => turn.content)).toEqual(['message from a']);
  expect(managerB.getSession('same')?.turns.map(turn => turn.content)).toEqual(['message from b']);
  expect(fs.existsSync(path.join(home, '.cheers', 'sessions'))).toBe(false);
});

it('does not adopt legacy credentials, approval grants or sessions in an empty named profile', () => {
  const legacy = path.join(home, '.cheer'); fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'config.json'), JSON.stringify({ provider: 'openai', providerCredentials: { openai: { apiKey: 'synthetic-legacy-key' } } }));
  fs.writeFileSync(path.join(legacy, 'approval-policy.json'), '{"grants":[]}');
  withProfile(a, () => {
    const config = getRuntimeConfig(workspace);
    expect(config.providerCredentials?.openai?.apiKey).toBeUndefined();
    expect(defaultPolicyFilePath()).toBe(path.join(a.root, 'approval-policy.json'));
    expect(new SessionManager().listSessions()).toEqual([]);
  });
});

it('keeps project and local memories private while a captured manager finishes under another scope', async () => {
  const managerA = withProfile(a, () => new AgentMemoryManager(workspace));
  const managerB = withProfile(b, () => new AgentMemoryManager(workspace));
  withProfile(b, () => {
    managerA.saveMemory('review', 'A project', 'project');
    managerB.saveMemory('review', 'B project', 'project');
    managerA.saveMemory('review', 'A local', 'local');
    managerB.saveMemory('review', 'B local', 'local');
  });
  expect((await managerA.loadMemory('review', 'project')).content).toBe('A project');
  expect((await managerB.loadMemory('review', 'project')).content).toBe('B project');
  expect((await managerA.loadMemory('review', 'local')).content).toBe('A local');
  expect(fs.existsSync(path.join(workspace, '.agents'))).toBe(false);
  const rootA = withProfile(a, () => projectMemoryRootFor(workspace));
  const rootB = withProfile(b, () => projectMemoryRootFor(workspace));
  expect(rootA).not.toBe(rootB);
  expect(rootA.startsWith(`${a.root}${path.sep}`)).toBe(true);
});

it('applies the parent read policy to private agent memory without granting other profile files', async () => {
  await withProfile(a, async () => {
    const writer = new AgentMemoryManager(workspace); writer.saveMemory('review', 'PRIVATE_NOTES');
    const access = (target: string) => assertAgentSourceAccess(target, workspace);
    const reader = new AgentMemoryManager(workspace, access);
    expect((await reader.loadMemory('review')).content).toBe('PRIVATE_NOTES');
    expect(() => access(path.join(a.root, 'config.json'))).toThrow();
    const file = path.join(writer.resolveMemoryDir('review'), 'MEMORY.md');
    expect(() => assertAgentSourceAccess(file, workspace, [], undefined,
      [{ tool: 'read', pattern: file }])).toThrow();
    fs.writeFileSync(path.join(a.root, 'config.json'), 'PRIVATE_CONFIG');
    fs.unlinkSync(file); fs.symlinkSync(path.join(a.root, 'config.json'), file);
    await expect(reader.loadMemory('review')).rejects.toThrow('symbolic links');
  });
});

it('uses the owning profile for command state, compact injection and sidebar scopes', () => {
  withProfile(a, () => {
    setSessionTodos('same', [{ id: 1, text: 'A task', status: 'pending' }]);
    const scope = sidebarSessionScopeId({ sessionId: 'same', cwd: workspace } as never);
    expect(scope).toBe(profileScope('session:same'));
    DEFAULT_COMPACT_INJECTION_STATE_STORE.markPending({ sessionScopeId: scope, checkpointId: 'A checkpoint', sourceCommand: '/compact' });
  });
  withProfile(b, () => {
    expect(getSessionTodos('same')).toEqual([]);
    expect(DEFAULT_COMPACT_INJECTION_STATE_STORE.get(profileScope('session:same')).injectionStatus).toBe('none');
  });
  withProfile(a, () => {
    expect(getSessionTodos('same')[0]?.text).toBe('A task');
    expect(DEFAULT_COMPACT_INJECTION_STATE_STORE.get(profileScope('session:same')).injectionStatus).toBe('pending');
  });
});

it('revokes prepared runtime admission when the owning profile or its root changes', () => {
  const context = withProfile(a, () => {
    configure(a, 'synthetic-key-a');
    const manager = new SessionManager();
    return createShellRuntimeContext({ cwd: workspace, originalCwd: workspace, projectRoot: workspace, targetPathBase: workspace,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      runtimeConfig: getRuntimeConfig(workspace), session: manager.createNewWithId('same', workspace) });
  });
  const admission = withProfile(a, () => configurationAdmission(context));
  expect(withProfile(a, admission)).toBeUndefined();
  expect(withProfile(b, admission)).toContain('Profile');
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  expect(admission()).toContain('Profile');
});

it('separates live usage and log owners for equal session IDs', () => {
  withProfile(a, () => recordSessionUsage('same', { provider: 'openai', model: 'gpt-4o', promptTokens: 10, completionTokens: 2 }));
  withProfile(b, () => {
    expect(getSessionUsage('same').turnsCount).toBe(0);
    recordSessionUsage('same', { provider: 'openai', model: 'gpt-4o', promptTokens: 30, completionTokens: 4 });
  });
  expect(withProfile(a, () => getSessionUsage('same').byModel['openai/gpt-4o']?.promptTokens)).toBe(10);
  expect(withProfile(b, () => getSessionUsage('same').byModel['openai/gpt-4o']?.promptTokens)).toBe(30);
  expect(withProfile(a, () => getGlobalRotatingFileSink().getLogDir())).toBe(path.join(a.root, 'logs'));
  expect(withProfile(b, () => getGlobalRotatingFileSink().getLogDir())).toBe(path.join(b.root, 'logs'));
});

it('routes extension registries through the frozen profile despite late environment changes', () => {
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', '/late-registry'); vi.stubEnv('CHEERS_PLUGINS_FILE', '/late-imports');
  withProfile(a, () => {
    expect(extensionFile()).toBe(path.join(a.root, 'extensions', 'registry.json'));
    expect(getPluginStoragePath()).toBe(path.join(a.root, 'plugins.json'));
    expect(sourceFile()).toBe(path.join(a.root, 'marketplaces.json'));
  });
});

it('rejects a captured session store after the profile directory is replaced', () => {
  const manager = withProfile(a, () => new SessionManager());
  withProfile(a, () => manager.createNewWithId('same', workspace));
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  expect(() => manager.getSessionDirPath('same')).toThrow('changed identity');
  expect(() => manager.listSessions()).toThrow('changed identity');
});

it('parses profile selection without turning its value into a project or prompt', () => {
  const result = parseCliArgs(['--profile', 'Work', '--print', 'hello'], { cwd: workspace });
  expect(result).toMatchObject({ ok: true, args: { options: { profile: 'work', promptArg: 'hello' } } });
  expect(result.ok && result.args.options.projectPath).toBeUndefined();
  expect(parseCliArgs(['--profile=a', '--print', 'hello'], { cwd: workspace })).toMatchObject({ ok: true, args: { options: { profile: 'a', promptArg: 'hello' } } });
  for (const args of [['--profile'], ['--profile', '--print'], ['--profile', '../a'], ['--profile=a', '--profile=b']]) {
    expect(parseCliArgs(args, { cwd: workspace }).ok).toBe(false);
  }
  expect(parseCliArgs(['--profile=a', '--print', '--', '--profile=b'], { cwd: workspace }))
    .toMatchObject({ ok: true, args: { options: { profile: 'a', promptArg: '--profile=b' } } });
  expect(parseCliArgs(['--print', '--', '--profile', 'b'], { cwd: workspace }))
    .toMatchObject({ ok: true, args: { options: { promptArg: '--profile b' } } });
});

it('does not select a profile from a value consumed by another launch flag', () => {
  for (const value of ['--profile', '--profile=b']) {
    const result = parseCliArgs(['--api-key', value, '--print', 'hello'], { cwd: workspace });
    expect(result).toMatchObject({ ok: true, args: { options: { apiKey: value, promptArg: 'hello' } } });
    expect(result.ok && result.args.options.profile).toBeUndefined();
    expect(parseCliArgs(['--api-key', value, '--profile', 'a', '--print', 'hello'], { cwd: workspace }))
      .toMatchObject({ ok: true, args: { options: { profile: 'a', apiKey: value, promptArg: 'hello' } } });
  }
  expect(parseCliArgs(['--api-key', '--', '--profile', 'b', '--print', 'hello'], { cwd: workspace }))
    .toMatchObject({ ok: true, args: { options: { profile: 'b', apiKey: '--', promptArg: 'hello' } } });
});
