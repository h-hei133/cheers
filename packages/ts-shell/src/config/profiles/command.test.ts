import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, currentProfile, withProfile, type ProfileContext } from '../../core/paths/profile/context.js';
import type { CommandContext } from '../../core/commands/types.js';
import { profileDefinition } from '../../core/commands/profile/registration.js';
import { runProfileCommand } from './command.js';
import { openProfile } from './context.js';
import { SessionManager } from '../../session/SessionManager.js';

let home: string; let source: ProfileContext; let context: CommandContext;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-command-'));
  const workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  source = createProfileContext({ name: 'source', homeDir: home, env: {} });
  context = { cwd: workspace, projectRoot: workspace, sessionId: 'source-session' };
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });

it('creates and inventories storage without changing the installed process profile', async () => {
  await withProfile(source, async () => {
    expect((await runProfileCommand([], context)).output).toContain('Active profile: source');
    expect((await runProfileCommand(['create', 'target'], context)).output).toContain('created');
    expect((await runProfileCommand(['create', 'target'], context)).output).toContain('already exists');
    expect((await runProfileCommand(['list'], context)).output).toContain('source (active)');
    expect((await runProfileCommand(['list'], context)).output).toContain('target');
    expect(currentProfile()).toBe(source);
    expect((await runProfileCommand(['create', '../bad'], context)).output).toContain('could not be verified');
  });
});

it('keeps preview read-only, requires the exact confirmation, and exposes recovery separately', async () => {
  fs.writeFileSync(path.join(source.root, 'config.json'), '{"maxTurns":19}');
  await withProfile(source, async () => {
    await runProfileCommand(['create', 'target'], context);
    const target = openProfile('target', home);
    const args = ['import', 'source', '--target', 'target', '--config'];
    const preview = (await runProfileCommand(args, context)).output;
    const digest = /Confirm digest: ([a-f0-9]{64})/.exec(preview)![1]!;
    expect(preview).toContain('preview'); expect(fs.readdirSync(target.root)).toEqual([]);
    expect((await runProfileCommand([...args, '--confirm', 'wrong'], context)).output).toContain('rejected');
    expect(fs.readdirSync(target.root)).toEqual([]);
    expect((await runProfileCommand([...args, '--confirm', digest], context)).output).toContain('stored and read back');
    expect(JSON.parse(fs.readFileSync(path.join(target.root, 'config.json'), 'utf8')).maxTurns).toBe(19);
    expect((await runProfileCommand(['recover', digest, '--target', 'target'], context)).output).toContain('Retained import state: complete');
    expect((await runProfileCommand(['recover', digest, '--target', 'target', '--confirm', digest], context)).output).toContain('stored and read back');
    expect((await runProfileCommand(['import', 'missing', '--target', 'target'], context)).output).toContain('could not be verified');
    expect(fs.existsSync(path.join(home, '.cheers/profiles/missing'))).toBe(false);
  });
});

it('uses the lifecycle port with the captured session and never suggests a confirmation token', async () => {
  const request = vi.fn(async () => ({ status: 'requested' as const, operation: 'operation' }));
  const controller = new AbortController();
  const profileSwitch = { request, inspect: vi.fn(() => 'retained unknown switch') };
  await withProfile(source, async () => {
    const result = await runProfileCommand(['switch', 'target', '--confirm', 'digest'], { ...context, signal: controller.signal, profileSwitch });
    expect(request).toHaveBeenCalledWith({ target: 'target', confirmation: 'digest', sessionId: context.sessionId, signal: controller.signal });
    expect(result.output).toContain('requested'); expect(result.output).toContain('not yet verified');
    expect((await runProfileCommand(['recover', 'a'.repeat(64)], { ...context, profileSwitch })).output).toBe('retained unknown switch');
    expect((await runProfileCommand(['switch', 'target'], context)).output).toContain('unavailable in this host');
    const definition = profileDefinition();
    const completions = definition.getArgumentCompletions?.('import source --')?.map(item => item.value);
    expect(completions).toContain('--history'); expect(completions).not.toContain('--confirm');
    expect(definition.getArgumentCompletions?.('switch target --confirm ')).toBeNull();
    expect((await runProfileCommand(['import', 'source', '--invalid'], context)).output).toContain('Usage:');
  });
});

it('binds the active source exclusion while retaining other history across preview report publication', async () => {
  await withProfile(source, async () => {
    const manager = new SessionManager();
    const inactive = manager.createNewWithId('inactive', context.cwd);
    manager.addTurn(inactive.id, { role: 'user', content: 'retained-inactive-history' });
    manager.createNewWithId(context.sessionId!, context.cwd);
    manager.addTurn(context.sessionId!, { role: 'user', content: 'active-history-excluded' });
    await runProfileCommand(['create', 'target'], context);
    const args = ['import', 'source', '--target', 'target', '--history'];
    const preview = (await runProfileCommand(args, context)).output;
    expect(preview).toContain('active source conversation is excluded');
    const digest = /Confirm digest: ([a-f0-9]{64})/.exec(preview)![1]!;
    manager.addTurn(context.sessionId!, { role: 'assistant', content: preview });
    expect((await runProfileCommand([...args, '--confirm', digest], context)).output).toContain('stored and read back');
    const target = openProfile('target', home);
    withProfile(target, () => {
      const imported = new SessionManager().listSessions();
      expect(imported).toHaveLength(1);
      expect(new SessionManager().resume(imported[0]!.id).turns.map(turn => turn.content)).toEqual(['retained-inactive-history']);
    });
    const journal = JSON.parse(fs.readFileSync(path.join(target.root, '.imports', digest, 'journal.json'), 'utf8'));
    expect(journal.request.excludedSessionId).toBe(context.sessionId);
  });
});

it('refuses cancellation and admission changes before management effects', async () => {
  const controller = new AbortController(); controller.abort();
  await withProfile(source, async () => {
    expect((await runProfileCommand(['create', 'cancelled'], { ...context, signal: controller.signal })).output).toContain('not admitted');
    expect((await runProfileCommand(['create', 'stale'], { ...context, admission: () => 'stale' })).output).toContain('not admitted');
  });
  for (const name of ['cancelled', 'stale']) expect(fs.existsSync(path.join(home, '.cheers/profiles', name))).toBe(false);
});
