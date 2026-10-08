import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapShellRuntime } from '../../core/shell/bootstrap.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { projectTrust } from '../../core/security/trust/store.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { getWorkflowGitContext } from '../../workflow/gitContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { changeSessionWorkspaceRoots, sessionWorkspaceAdmission } from '../../session/continuation/workspace.js';
import { SessionRootRebindError } from '../../session/continuation/sessionProjectRootRebind.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { runWorkspaceShellAction } from '../../core/commands/workspace/command.js';
import type { CommandContext } from '../../core/commands/types.js';
import { startNewSession } from '../runtime/session.js';
import { runCliWorkspaceCommand } from './command.js';

let fixture: string, primary: string, extra: string, other: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-command-'));
  [primary, extra, other] = ['primary', 'extra', 'other'].map(name => path.join(fixture, name));
  for (const folder of [primary, extra, other, path.join(fixture, 'home')]) fs.mkdirSync(folder);
  vi.stubEnv('HOME', path.join(fixture, 'home')); vi.stubEnv('USERPROFILE', path.join(fixture, 'home'));
  vi.stubEnv('CHEERS_TEST_ROOT', path.join(fixture, 'data'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });

function setup() {
  const manager = new SessionManager(); const renderer = new StreamingRenderer(); const lines: string[] = [];
  vi.spyOn(renderer, 'renderLine').mockImplementation(line => { lines.push(line); });
  const context = bootstrapShellRuntime({ cwd: primary, runtimeConfig: getRuntimeConfig(primary),
    gitContext: getWorkflowGitContext(primary), sessionManager: manager, renderer, emitLifecycleMessages: false }).context;
  context.workspaceAdmission = () => sessionWorkspaceAdmission(manager, context.session);
  const refresh = vi.fn();
  return { manager, context, lines, refresh, run: (workspaceAction: 'add' | 'remove' | 'rebind' | 'attach', workspaceTarget = extra, workspaceAccess: 'read' | 'write' = 'read', busy = () => false) => {
    lines.length = 0;
    runCliWorkspaceCommand({ renderer, sessionManager: manager, runtimeContext: context, workspaceAction,
      workspaceTarget, workspaceAccess, busy, printMode: true, onProjectContextSwitched: refresh });
  } };
}

describe('workspace session commands', () => {
  it('strictly parses grants and keeps write access explicit', async () => {
    const context = {} as CommandContext;
    expect(await runWorkspaceShellAction(['add', extra], context)).toMatchObject({ workspaceAccess: 'read', workspaceTarget: extra });
    expect(await runWorkspaceShellAction(['add', '--write', extra], context)).toMatchObject({ workspaceAccess: 'write' });
    for (const args of [['add'], ['remove'], ['rebind'], ['remove', '--write', extra], ['add', extra, other], ['add', '--write', '--write', extra]]) {
      expect(await runWorkspaceShellAction(args, context)).toMatchObject({ kind: 'local', output: expect.stringContaining('Invalid /workspace') });
    }
  });

  it('persists roots across restart, fork and new session without changing resource discovery', () => {
    fs.writeFileSync(path.join(extra, '.cheers.json'), '{"maxTurns":77}');
    projectTrust.setProjectTrust(extra, 'trusted');
    const tools = setup(); tools.run('add');
    const source = tools.context.session; expect(source.workspaceRoots).toMatchObject([{ path: extra, access: 'read' }]);
    expect(tools.context.projectRoot).toBe(primary); expect(tools.context.runtimeConfig.maxTurns).not.toBe(77);
    expect(new SessionManager().getSession(source.id)?.workspaceRoots).toEqual(source.workspaceRoots);
    expect(tools.manager.fork(source.id).workspaceRoots).toEqual(source.workspaceRoots);
    expect(tools.manager.fork(source.id, other).workspaceRoots ?? []).toEqual([]);
    tools.manager.addTurn(source.id, { role: 'user', content: 'keep the original session' });
    startNewSession(tools.context, tools.manager);
    expect(tools.context.session.id).not.toBe(source.id); expect(tools.context.session.workspaceRoots).toEqual(source.workspaceRoots);
    const revision = tools.context.workspaceRevision; tools.refresh.mockClear(); tools.run('add');
    expect(tools.context.workspaceRevision).toBe(revision); expect(tools.refresh).not.toHaveBeenCalled();
    tools.run('attach', other); expect(tools.context.projectRoot).toBe(other); expect(tools.context.session.workspaceRoots ?? []).toEqual([]);
  });

  it('refuses busy, overlap and stale grants before any state write', () => {
    const tools = setup(); const file = path.join(tools.manager.getSessionDirPath(tools.context.session.id), 'state.json');
    const original = fs.readFileSync(file, 'utf8');
    tools.run('add', extra, 'write', () => true); expect(fs.readFileSync(file, 'utf8')).toBe(original);
    tools.run('add', primary); expect(fs.readFileSync(file, 'utf8')).toBe(original);
    const manager = new SessionManager();
    expect(changeSessionWorkspaceRoots({ manager, session: manager.getSession(tools.context.session.id)!, busy: () => false, action: 'add', target: other }).status).toBe('changed');
    const updated = fs.readFileSync(file, 'utf8'); tools.run('add'); expect(fs.readFileSync(file, 'utf8')).toBe(updated);
    expect(tools.context.session.workspaceRoots ?? []).toEqual([]); expect(configurationAdmission(tools.context)()).toContain('saved workspace');
    expect(() => startNewSession(tools.context, tools.manager)).toThrow('saved workspace');
  });

  it('revokes missing and symlink-replaced roots by their registered path without deleting targets', () => {
    const tools = setup(); tools.run('add');
    fs.renameSync(extra, extra + '-original'); fs.symlinkSync(other, extra, 'dir');
    tools.run('remove'); expect(tools.context.session.workspaceRoots).toEqual([]); expect(fs.lstatSync(extra).isSymbolicLink()).toBe(true);
    fs.unlinkSync(extra); fs.renameSync(extra + '-original', extra); tools.run('add'); fs.rmdirSync(extra);
    tools.run('remove'); expect(tools.context.session.workspaceRoots).toEqual([]); expect(fs.existsSync(other)).toBe(true);
  });

  it('rebinds the same saved identity, filters the new primary and refreshes project resources', () => {
    fs.writeFileSync(path.join(extra, '.cheers.json'), '{"maxTurns":77}');
    projectTrust.setProjectTrust(extra, 'trusted');
    const tools = setup(); tools.run('add'); tools.run('add', other, 'write');
    const id = tools.context.session.id; tools.manager.addTurn(id, { role: 'user', content: 'history remains' });
    const admission = configurationAdmission(tools.context); tools.refresh.mockClear(); tools.run('rebind');
    expect(tools.context.session.id).toBe(id); expect(tools.context.cwd).toBe(extra); expect(tools.context.projectRoot).toBe(extra);
    expect(tools.context.requestedWorkspaceRoot).toBe(extra); expect(tools.context.targetPathBase).toBe(extra);
    expect(tools.context.session.workspaceRoots).toMatchObject([{ path: other, access: 'write' }]);
    expect(tools.context.runtimeConfig.maxTurns).toBe(77); expect(tools.refresh).toHaveBeenCalledOnce(); expect(admission()).toBeTruthy();
    const saved = new SessionManager().getSession(id)!; expect(saved.projectRoot).toBe(extra); expect(saved.turns[0]?.content).toBe('history remains');
  });

  it('keeps restored migrations unchanged and blocks unconfirmed writes', () => {
    const tools = setup(); const previous = tools.context.session;
    const rebound = vi.spyOn(tools.manager, 'rebindSessionProjectRoot').mockImplementation(() => { throw new SessionRootRebindError('restored', 'metadata', new Error('synthetic')); });
    tools.run('rebind'); expect(tools.context.session).toBe(previous); expect(tools.lines.join('\n')).toContain('did not commit'); expect(tools.refresh).not.toHaveBeenCalled();
    rebound.mockImplementation(() => { throw new SessionRootRebindError('partial', 'metadata', new Error('synthetic')); });
    tools.run('rebind'); expect(tools.context.session).toBe(previous); expect(configurationAdmission(tools.context)()).toContain('unverified');
    expect(tools.refresh).not.toHaveBeenCalled();
  });

  it('publishes a confirmed committed migration with a follow-up warning', () => {
    const tools = setup(); const actual = tools.manager.rebindSessionProjectRoot.bind(tools.manager);
    vi.spyOn(tools.manager, 'rebindSessionProjectRoot').mockImplementation((...args) => { actual(...args); throw new SessionRootRebindError('committed', 'selection', new Error('synthetic')); });
    tools.run('rebind'); expect(tools.context.projectRoot).toBe(extra); expect(tools.lines.join('\n')).toContain('follow-up failure');
    expect(tools.context.workspaceIssue).toBeUndefined(); expect(tools.refresh).toHaveBeenCalledOnce();
  });
});
