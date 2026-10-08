import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { captureWorkspaceRoot, validateWorkspaceRoots } from '../core/workspace/roots.js';
import { createCoreToolRegistry } from '../core/tools/registry.js';
import { ArtifactManager } from '../core/session/artifactManager.js';
import type { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from './tools.js';
import { SessionManager } from '../session/SessionManager.js';
import { changeSessionWorkspaceRoots, sessionWorkspaceAdmission } from '../session/continuation/workspace.js';

let fixture: string, primary: string, extra: string, writable: string, outside: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-tools-'));
  [primary, extra, writable, outside] = ['primary', 'extra', 'writable', 'outside'].map(name => path.join(fixture, name));
  for (const folder of [primary, extra, writable, outside, path.join(fixture, 'home')]) fs.mkdirSync(folder);
  vi.stubEnv('HOME', path.join(fixture, 'home')); vi.stubEnv('USERPROFILE', path.join(fixture, 'home'));
  vi.stubEnv('CHEERS_TEST_ROOT', path.join(fixture, 'data'));
  fs.writeFileSync(path.join(extra, 'source.ts'), 'export const first = 1;\nexport const second = 2;\nexport function workspaceSymbol() { return 1; }\n');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });

function setup(overrides: Partial<ToolGateOptions> = {}) {
  const options: ToolGateOptions = { sessionId: 'sess_roots', workspaceRoot: primary,
    workspaceRoots: [captureWorkspaceRoot(extra, primary, 'read'), captureWorkspaceRoot(writable, primary, 'write')],
    permissionScope: 'accept-edits', hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher,
    emit: () => {}, ...overrides };
  const definitions = createCoreToolRegistry();
  const tools = new Map(adaptTools(definitions, options).map(tool => [tool.name, tool]));
  return { options, hooks: createToolHooks(options, definitions),
    execute: (name: string, args: Record<string, unknown>) => tools.get(name)!.execute('call_roots', args, new AbortController().signal),
  };
}

describe('workspace file grants through the existing tools', () => {
  it('reads selectors and searches a registered root without changing the primary base', async () => {
    const tools = setup();
    const selected = await tools.execute('read', { path: path.join(extra, 'source.ts') + ':2-2' });
    expect(selected.isError).toBe(false); expect(selected.output).toContain('second'); expect(selected.output).not.toContain('first');
    expect((await tools.execute('glob', { path: extra, pattern: '*.ts' })).output).toContain('source.ts');
    expect((await tools.execute('grep', { path: extra, pattern: 'second' })).output).toContain('source.ts:2:');
    expect((await tools.execute('lsp', { filePath: path.join(extra, 'source.ts'), operation: 'documentSymbol' })).output).toContain('workspaceSymbol');
    expect((await tools.execute('read', { path: 'source.ts' })).isError).toBe(true);
    expect((await tools.execute('read', { path: path.join(outside, 'unknown') })).isError).toBe(true);
  });

  it('rejects read-root writes before asking and reuses the approved writer for a write root', async () => {
    const approval = vi.fn(); const tools = setup({ escalationPromptHandler: approval });
    const readArgs = { path: path.join(extra, 'source.ts'), content: 'unsafe' };
    const refused = await tools.hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'call', name: 'write', args: readArgs }, args: readArgs });
    expect(refused).toMatchObject({ block: true, reason: expect.stringContaining('read-only') }); expect(approval).not.toHaveBeenCalled();
    expect((await tools.execute('write', readArgs)).isError).toBe(true);
    const writeArgs = { path: path.join(writable, 'saved.txt'), content: 'approved file' };
    expect(await tools.hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'write', name: 'write', args: writeArgs }, args: writeArgs })).toBeUndefined();
    expect((await tools.execute('write', writeArgs)).isError).toBe(false);
    expect(fs.readFileSync(writeArgs.path, 'utf8')).toBe('approved file');
    expect(fs.readFileSync(path.join(extra, 'source.ts'), 'utf8')).toContain('first');
  });

  it('refuses child symlink escape and replaced root identities', async () => {
    const tools = setup(); fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside secret');
    fs.symlinkSync(outside, path.join(extra, 'escape'), 'dir');
    expect((await tools.execute('read', { path: path.join(extra, 'escape/secret.txt') })).isError).toBe(true);
    fs.renameSync(extra, extra + '-original'); fs.mkdirSync(extra); fs.writeFileSync(path.join(extra, 'source.ts'), 'replacement');
    expect((await tools.execute('read', { path: path.join(extra, 'source.ts') })).output).toContain('changed identity');
  });

  it('applies root-relative deny rules and retains primary artifact access', async () => {
    const tools = setup({ denyRules: [{ tool: 'read', pattern: 'source.ts' }] });
    expect((await tools.execute('read', { path: path.join(extra, 'source.ts') })).output).toContain('Refused by a rule');
    const artifact = await ArtifactManager.getShared(primary, 'sess_roots').save('session artifact', 'test');
    expect((await tools.execute('read', { path: artifact.uri })).output).toContain('session artifact');
  });

  it('spills additional-root search results into the primary session artifact store', async () => {
    fs.writeFileSync(path.join(extra, 'large.txt'), Array.from({ length: 300 }, () => 'MATCH ' + 'x'.repeat(350)).join('\n'));
    const tools = setup();
    const result = await tools.execute('grep', { path: extra, pattern: 'MATCH', limit: 400 });
    const uri = result.output?.match(/artifact:\/\/\d+/)?.[0]; expect(uri).toBeDefined();
    expect(ArtifactManager.getShared(primary, 'sess_roots').resolve(uri!)).toBeTruthy();
    expect((await tools.execute('read', { path: uri })).output).toContain('MATCH');
  });

  it('rejects overlapping roots including symlink aliases of the primary', () => {
    const child = path.join(primary, 'child'); fs.mkdirSync(child);
    expect(() => validateWorkspaceRoots(primary, [captureWorkspaceRoot(child, primary, 'read')])).toThrow('overlapping');
    const alias = path.join(fixture, 'alias'); fs.symlinkSync(primary, alias, 'dir');
    expect(() => validateWorkspaceRoots(primary, [captureWorkspaceRoot(alias, primary, 'write')])).toThrow('overlapping');
  });

  it.each(['remove', 'downgrade', 'rebind'] as const)('refuses captured file authority after another process performs %s', async action => {
    const manager = new SessionManager();
    const created = manager.createNew(primary);
    const added = changeSessionWorkspaceRoots({ manager, session: created, busy: () => false, action: 'add', target: writable, access: 'write' });
    expect(added.status).toBe('changed'); const session = added.session!;
    const tools = setup({ sessionId: session.id, workspaceRoots: session.workspaceRoots,
      admission: () => sessionWorkspaceAdmission(manager, session) });
    const args = { path: path.join(writable, 'revoked.txt'), content: 'must not write' };
    const other = new SessionManager();
    if (action === 'rebind') other.rebindSessionProjectRoot(session.id, outside);
    else expect(changeSessionWorkspaceRoots({ manager: other, session: other.getSession(session.id)!, busy: () => false,
      action: action === 'remove' ? 'remove' : 'add', target: writable, access: 'read' }).status).toBe('changed');
    const decision = await tools.hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' }, call: { id: 'revoked', name: 'write', args }, args });
    expect(decision).toMatchObject({ block: true, reason: expect.stringContaining('saved workspace') });
    expect((await tools.execute('write', args)).isError).toBe(true); expect(fs.existsSync(args.path)).toBe(false);
  });
});
