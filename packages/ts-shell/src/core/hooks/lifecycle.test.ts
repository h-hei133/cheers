import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { HookDispatcher } from './hookDispatcher.js';
import { registerDeclaredHooks } from './registration.js';
import { HookTrustStore, hookFingerprint } from './trust.js';
import { projectTrust } from '../security/projectTrust.js';
import { resolveUserDataFile } from '../paths/userHome.js';
import type { HookApprovalRequest } from './types.js';

let scratch: string;
let home: string;
let store: HookTrustStore;

beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  scratch = fs.mkdtempSync('/tmp/cheers-test/hooks-lifecycle-');
  home = path.join(scratch, 'home');
  fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(false);
  store = new HookTrustStore(path.join(home, 'hook-trust.json'));
});

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function declare(root: string, command: string): void {
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/hooks.json'), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: 'bash', hooks: [{ type: 'command', command }] }] },
  }));
}

function configure(dispatcher: HookDispatcher, root: string, requestApproval: HookApprovalRequest, bypassed = false): void {
  registerDeclaredHooks(dispatcher, root, { homeDir: home, trustStore: store, requestApproval, bypassed });
}

function fire(dispatcher: HookDispatcher, root: string) {
  return dispatcher.dispatch({ eventName: 'PreToolUse', workspaceRoot: root,
    sessionId: 'isolated', timestamp: '', toolName: 'bash', toolCallId: 'call', args: {} });
}

function command(label: string): string {
  return `printf '%s\\n' '${label}' >> '${path.join(scratch, 'effects')}'`;
}

function effects(): string[] {
  const file = path.join(scratch, 'effects');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [];
}

describe('declared hook snapshot ownership', () => {
  it('rechecks source withdrawal after an already-trusted async gate and before spawn', async () => {
    const root = path.join(scratch, 'project'), sourcePath = path.join(root, '.agents/hooks.json');
    declare(root, command('retired')); const dispatcher = new HookDispatcher();
    const fingerprint = hookFingerprint({ event: 'PreToolUse', matcher: 'bash', command: command('retired'), sourcePath });
    store.recordTrust(fingerprint, 'retired', sourcePath, '');
    const trusted = store.isTrusted.bind(store);
    vi.spyOn(store, 'isTrusted').mockImplementation((fingerprint, source) => {
      const result = trusted(fingerprint, source);
      queueMicrotask(() => { store.forgetSource(sourcePath); }); return result;
    });
    const approval = vi.fn(async () => 'deny' as const); configure(dispatcher, root, approval);
    await fire(dispatcher, root);
    expect(effects()).toEqual([]); expect(approval).not.toHaveBeenCalled(); expect(store.entries()).toEqual([]);
  });

  it('replaces repeated declarations while preserving process hooks exactly once', async () => {
    const root = path.join(scratch, 'project');
    declare(root, command('declared'));
    const dispatcher = new HookDispatcher();
    const inProcess = vi.fn();
    dispatcher.registerInProcessHook({ event: 'PreToolUse', handler: inProcess });
    dispatcher.registerCommandHook({ event: 'PreToolUse', command: command('process') });
    const approval = vi.fn(async () => 'allow-always' as const);
    configure(dispatcher, root, approval); await fire(dispatcher, root);
    configure(dispatcher, root, approval); await fire(dispatcher, root);
    expect(effects()).toEqual(['process', 'declared', 'process', 'declared']);
    expect(inProcess).toHaveBeenCalledTimes(2);
    expect(approval).toHaveBeenCalledTimes(1);
  });

  it('retires an edited declaration without running or reoffering the old grant', async () => {
    const root = path.join(scratch, 'project');
    declare(root, command('old'));
    const dispatcher = new HookDispatcher();
    configure(dispatcher, root, async () => 'allow-always'); await fire(dispatcher, root);
    declare(root, command('new'));
    const approval = vi.fn(async (_request: Parameters<HookApprovalRequest>[0]) => 'deny' as const);
    configure(dispatcher, root, approval); await fire(dispatcher, root);
    expect(effects()).toEqual(['old']);
    expect(approval).toHaveBeenCalledOnce();
    expect(approval.mock.calls[0]?.[0]).toMatchObject({ command: command('new') });
  });

  it('removes hooks when the declaration file disappears', async () => {
    const root = path.join(scratch, 'project');
    declare(root, command('removed'));
    const dispatcher = new HookDispatcher();
    configure(dispatcher, root, async () => 'allow-always'); await fire(dispatcher, root);
    fs.unlinkSync(path.join(root, '.agents/hooks.json'));
    const approval = vi.fn(async (_request: Parameters<HookApprovalRequest>[0]) => 'deny' as const);
    configure(dispatcher, root, approval); await fire(dispatcher, root);
    expect(effects()).toEqual(['removed']);
    expect(approval).not.toHaveBeenCalled();
  });

  it('does not use an old project fingerprint to execute another project relative command', async () => {
    const first = path.join(scratch, 'first'), second = path.join(scratch, 'second');
    for (const [root, label] of [[first, 'first'], [second, 'second']] as const) {
      declare(root, './run-hook.sh');
      fs.writeFileSync(path.join(root, 'run-hook.sh'), `#!/bin/sh\n${command(label)}\n`, { mode: 0o700 });
    }
    const dispatcher = new HookDispatcher();
    configure(dispatcher, first, async () => 'allow-always'); await fire(dispatcher, first);
    const approval = vi.fn(async (_request: Parameters<HookApprovalRequest>[0]) => 'deny' as const);
    configure(dispatcher, second, approval); await fire(dispatcher, second);
    expect(effects()).toEqual(['first']);
    expect(approval).toHaveBeenCalledOnce();
    expect(approval.mock.calls[0]?.[0]).toMatchObject({ sourcePath: path.join(second, '.agents/hooks.json') });
  });

  it.each([false, true])('refuses a mismatched workspace before approval or bypass (%s)', async bypassed => {
    const first = path.join(scratch, 'first'), second = path.join(scratch, 'second');
    declare(first, command('wrong-workspace')); fs.mkdirSync(second);
    const dispatcher = new HookDispatcher();
    const approval = vi.fn(async () => 'allow-always' as const);
    configure(dispatcher, first, approval, bypassed);
    await fire(dispatcher, second);
    expect(effects()).toEqual([]);
    expect(approval).not.toHaveBeenCalled();
    expect(store.entries()).toEqual([]);
  });

  it('does not adopt a new declaration snapshot after an awaited process hook', async () => {
    const root = path.join(scratch, 'project');
    declare(root, command('old'));
    const dispatcher = new HookDispatcher();
    let replace = true;
    dispatcher.registerInProcessHook({ event: 'PreToolUse', handler: async () => {
      if (replace) {
        replace = false; declare(root, command('new'));
        configure(dispatcher, root, async () => 'allow-once');
      }
    } });
    configure(dispatcher, root, async () => 'allow-once');
    await fire(dispatcher, root);
    expect(effects()).toEqual([]);
    await fire(dispatcher, root);
    expect(effects()).toEqual(['new']);
  });

  it('preserves user hook grants while removing refused project declarations', async () => {
    const first = path.join(scratch, 'first'), second = path.join(scratch, 'second');
    declare(first, command('project')); fs.mkdirSync(second);
    const userFile = resolveUserDataFile('hooks.json', home);
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.writeFileSync(userFile, JSON.stringify({ hooks: {
      PreToolUse: [{ hooks: [{ type: 'command', command: command('user') }] }],
    } }));
    const dispatcher = new HookDispatcher();
    const approval = vi.fn(async () => 'allow-always' as const);
    configure(dispatcher, first, approval); await fire(dispatcher, first);
    expect(effects()).toEqual(['user', 'project']);
    vi.mocked(projectTrust.isProjectUntrusted).mockReturnValue(true);
    configure(dispatcher, first, approval); await fire(dispatcher, first);
    configure(dispatcher, second, approval); await fire(dispatcher, second);
    expect(effects()).toEqual(['user', 'project', 'user', 'user']);
    expect(approval).toHaveBeenCalledTimes(2);
  });

  it('clears process commands before resuming an awaited process handler', async () => {
    const dispatcher = new HookDispatcher();
    dispatcher.registerCommandHook({ event: 'PreToolUse', command: command('cleared') });
    dispatcher.registerInProcessHook({ event: 'PreToolUse', handler: async () => { dispatcher.clear(); } });
    await fire(dispatcher, scratch);
    expect(effects()).toEqual([]);
  });

  it('clears pending declared approvals without recording a grant', async () => {
    const root = path.join(scratch, 'project');
    declare(root, command('cleared'));
    const dispatcher = new HookDispatcher();
    let answer!: (decision: 'allow-always') => void;
    configure(dispatcher, root, () => new Promise(resolve => { answer = resolve; }));
    const pending = fire(dispatcher, root);
    expect(answer).toBeTypeOf('function');
    dispatcher.clear(); answer('allow-always'); await pending;
    expect(effects()).toEqual([]);
    expect(store.entries()).toEqual([]);
  });

  it('discards a pending approval and persistent grant after snapshot replacement', async () => {
    const root = path.join(scratch, 'project');
    declare(root, command('pending'));
    const dispatcher = new HookDispatcher();
    let answer!: (decision: 'allow-always') => void;
    configure(dispatcher, root, () => new Promise(resolve => { answer = resolve; }));
    const pending = fire(dispatcher, root);
    expect(answer).toBeTypeOf('function');
    configure(dispatcher, root, async () => 'deny');
    answer('allow-always'); await pending;
    expect(effects()).toEqual([]);
    expect(store.entries()).toEqual([]);
  });
});
