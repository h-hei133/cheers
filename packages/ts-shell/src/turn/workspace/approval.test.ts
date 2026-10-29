import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeToolBatch } from '../../core/agent/tools.js';
import { createCoreToolRegistry } from '../../core/tools/registry.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import type { EscalationPrompt, EscalationResponse } from '../../core/shell/approval/contract.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import { createCliEscalationPromptHandler } from '../../entrypoints/cliApprovalModule.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../../config/runtimeConfig.js';
import { toolScopeBinding } from '../../config/scope/tools.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../tools.js';

let fixture: string, primary: string, outside: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-file-approval-'));
  primary = path.join(fixture, 'primary'); outside = path.join(fixture, 'outside');
  for (const directory of [primary, outside, path.join(fixture, 'home')]) fs.mkdirSync(directory);
  vi.stubEnv('HOME', path.join(fixture, 'home')); vi.stubEnv('USERPROFILE', path.join(fixture, 'home'));
  vi.stubEnv('CHEERS_TEST_ROOT', path.join(fixture, 'data'));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(fixture, { recursive: true, force: true }); });

function setup(handler?: (prompt: EscalationPrompt) => Promise<EscalationResponse>, overrides: Partial<ToolGateOptions> = {}) {
  const approval = vi.fn(handler ?? (async prompt => ({ promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once' })));
  const options: ToolGateOptions = { sessionId: 'sess_external', workspaceRoot: primary, permissionScope: 'accept-edits',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher,
    escalationPromptHandler: approval, emit: () => {}, ...overrides };
  const definitions = createCoreToolRegistry();
  const tools = adaptTools(definitions, options), hooks = createToolHooks(options, definitions);
  return { options, approval, tools, run: (name: string, args: Record<string, unknown>) => executeToolBatch(tools,
    { role: 'assistant', content: '' }, [{ id: 'call_external', name, args }], hooks, undefined, undefined, () => {}) };
}

describe('one-time external file approvals', () => {
  it.each(['accept-edits', 'allow-all'] as const)('requires the actual CLI answer in %s even with cached grants', async permissionScope => {
    const policy = new ApprovalTrustPolicy(path.join(fixture, 'policy.json'));
    const interactive = vi.fn().mockResolvedValue('allow-once');
    const renderer = new StreamingRenderer(); vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
    const host = setup(async prompt => {
      expect(prompt.context.explicitApproval).toBe(true);
      policy.rememberAllowAlways(prompt, primary);
      policy.rememberAllowOnce(policy.evaluate(prompt, primary).cacheKey);
      return createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => primary,
        () => 'allow-always', undefined, undefined, () => permissionScope, interactive)(prompt);
    }, { permissionScope });
    const target = path.join(outside, 'saved.txt');
    await host.run('write', { path: target, content: 'first' });
    await host.run('write', { path: target, content: 'second' });
    expect(interactive).toHaveBeenCalledTimes(2); expect(fs.readFileSync(target, 'utf8')).toBe('second');
  });

  it('makes the real CLI reject a persistent answer without saving a grant', async () => {
    const policy = new ApprovalTrustPolicy(path.join(fixture, 'policy.json'));
    const remember = vi.spyOn(policy, 'rememberAllowAlways');
    const renderer = new StreamingRenderer(); vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
    const host = setup(createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => primary,
      undefined, undefined, undefined, () => 'allow-all', async () => 'allow-always'));
    const target = path.join(outside, 'saved.txt'); await host.run('write', { path: target, content: 'unsafe' });
    expect(remember).not.toHaveBeenCalled(); expect(fs.existsSync(target)).toBe(false);
  });

  it('makes the real headless CLI refuse even an explicit noninteractive allow policy', async () => {
    const policy = new ApprovalTrustPolicy(path.join(fixture, 'policy.json'));
    const renderer = new StreamingRenderer(); vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
    const host = setup(createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => primary,
      () => 'allow-once', undefined, undefined, () => 'allow-all'));
    const target = path.join(outside, 'saved.txt'); await host.run('write', { path: target, content: 'unsafe' });
    expect(fs.existsSync(target)).toBe(false);
  });
  it.each(['accept-edits', 'allow-all', 'ask'] as const)('asks in %s, then writes and edits through the existing writer without saving roots', async permissionScope => {
    const host = setup(undefined, { permissionScope });
    const target = path.join(outside, 'nested/saved.txt');
    await host.run('write', { path: target, content: 'first' });
    expect(fs.readFileSync(target, 'utf8')).toBe('first');
    expect(host.approval).toHaveBeenCalledOnce();
    expect(host.approval.mock.calls[0]![0].context.target).toContain(target);
    expect(host.approval.mock.calls[0]![0].context.target).toContain(outside);
    expect(host.approval.mock.calls[0]![0].options.map(option => option.value)).toEqual(['allow-once', 'deny']);
    await host.run('edit', { path: target, oldText: 'first', newText: 'second' });
    expect(fs.readFileSync(target, 'utf8')).toBe('second');
    expect(host.approval).toHaveBeenCalledTimes(2); expect(host.options.workspaceRoots).toBeUndefined();
  });

  it('requires approval for external selector reads and preserves the exact slice', async () => {
    const target = path.join(outside, 'source.txt'); fs.writeFileSync(target, 'first\nsecond\nthird\n');
    const host = setup(); const result = await host.run('read', { path: target + ':2-2' });
    expect(JSON.stringify(result)).toContain('second'); expect(JSON.stringify(result)).not.toContain('third');
    expect(host.approval).toHaveBeenCalledOnce();
  });

  it('approves one direct directory listing while keeping child deny rules', async () => {
    fs.writeFileSync(path.join(outside, 'visible.txt'), 'visible'); fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    const host = setup(undefined, { denyRules: [{ tool: 'read', pattern: 'secret.txt' }] });
    const result = await host.run('read', { path: outside });
    expect(JSON.stringify(result), JSON.stringify(result)).toContain('visible.txt'); expect(JSON.stringify(result)).not.toContain('secret.txt');
    expect(host.approval).toHaveBeenCalledOnce();
  });

  it('preserves an absolute directory in the pagination hint and requires a new answer for its next page', async () => {
    for (const name of ['a.txt', 'b.txt', 'c.txt']) fs.writeFileSync(path.join(outside, name), name);
    const host = setup(); const result = await host.run('read', { path: outside, limit: 1 });
    const text = result.messages[0]!.content as string;
    const continuation = /Use read\(path="([^"]+)", offset=(\d+)\)/.exec(text)!;
    expect(continuation).not.toBeNull(); expect(continuation[1]).toBe(outside + path.sep);
    const next = await host.run('read', { path: continuation[1], offset: Number(continuation[2]), limit: 1 });
    expect(JSON.stringify(next)).toContain('b.txt'); expect(host.approval).toHaveBeenCalledTimes(2);
  });

  it.each(['deny', 'allow-always'] as const)('does not write when the approval response is %s', async decision => {
    const target = path.join(outside, 'saved.txt');
    const host = setup(async prompt => ({ promptId: prompt.id, respondedAt: Date.now(), decision }));
    await host.run('write', { path: target, content: 'must not write' });
    expect(host.approval).toHaveBeenCalledOnce(); expect(fs.existsSync(target)).toBe(false);
  });

  it('blocks headless calls and execution without the original native approval', async () => {
    const target = path.join(outside, 'saved.txt'), args = { path: target, content: 'must not write' };
    const host = setup(undefined, { escalationPromptHandler: undefined });
    expect(JSON.stringify(await host.run('write', args))).toContain('no interactive handler');
    const tool = host.tools.find(tool => tool.name === 'write')!;
    const prepared = await tool.prepareArguments!(args);
    expect((await tool.execute('forged', prepared, undefined)).isError).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('keeps relative escapes, read-only roots and child symlink escapes out of the prompt', async () => {
    const target = path.join(outside, 'source.txt'); fs.writeFileSync(target, 'safe');
    const host = setup(); await host.run('write', { path: '../outside/source.txt', content: 'unsafe' });
    fs.symlinkSync(outside, path.join(primary, 'escape'), 'dir');
    await host.run('write', { path: path.join(primary, 'escape/source.txt'), content: 'unsafe' });
    const readOnly = setup(undefined, { workspaceRoots: [captureWorkspaceRoot(outside, primary, 'read')] });
    await readOnly.run('write', { path: target, content: 'unsafe' });
    expect(host.approval).not.toHaveBeenCalled(); expect(readOnly.approval).not.toHaveBeenCalled();
    expect(fs.readFileSync(target, 'utf8')).toBe('safe');
  });

  it('keeps root-relative deny rules authoritative before asking', async () => {
    const host = setup(undefined, { denyRules: [{ tool: 'write', pattern: 'secret.txt' }] });
    await host.run('write', { path: path.join(outside, 'secret.txt'), content: 'unsafe' });
    expect(host.approval).not.toHaveBeenCalled(); expect(fs.existsSync(path.join(outside, 'secret.txt'))).toBe(false);
  });

  it.each(['write', 'edit'] as const)('refuses external %s when reading its original body is denied', async name => {
    const target = path.join(outside, 'secret.txt'); fs.writeFileSync(target, 'protected body');
    const host = setup(undefined, { denyRules: [{ tool: 'read', pattern: 'secret.txt' }] });
    const result = await host.run(name, { path: target, content: 'unsafe' });
    expect(host.approval).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('protected body');
    expect(fs.readFileSync(target, 'utf8')).toBe('protected body');
  });

  it('rejects changed parent identity after approval', async () => {
    const target = path.join(outside, 'saved.txt');
    const host = setup(async prompt => {
      fs.renameSync(outside, outside + '-old'); fs.mkdirSync(outside);
      return { promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once' };
    });
    expect(JSON.stringify(await host.run('write', { path: target, content: 'unsafe' }))).toContain('changed identity');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('uses a canonical parent for an absolute alias and rejects its replacement during approval', async () => {
    const alias = path.join(fixture, 'alias'); fs.symlinkSync(outside, alias, 'dir');
    const host = setup(); await host.run('write', { path: path.join(alias, 'saved.txt'), content: 'approved' });
    expect(fs.readFileSync(path.join(outside, 'saved.txt'), 'utf8')).toBe('approved');
    expect(host.approval.mock.calls[0]![0].context.target).toContain(outside);
    const redirected = path.join(fixture, 'redirected'); fs.mkdirSync(redirected);
    const changed = setup(async prompt => {
      fs.unlinkSync(alias); fs.symlinkSync(redirected, alias, 'dir');
      return { promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once' };
    });
    await changed.run('write', { path: path.join(alias, 'new.txt'), content: 'unsafe' });
    expect(fs.existsSync(path.join(redirected, 'new.txt'))).toBe(false);
  });

  it('prepares a complete external patch and applies only its exact approved selection', async () => {
    const target = path.join(outside, 'patch.txt');
    const host = setup(async prompt => {
      const selected = prompt.context.selections!.map(group => group.id);
      const preview = prompt.context.selectionPreview!(selected);
      return { promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once', selected, selectionRevision: preview.revision };
    });
    const result = await host.run('apply_patch', { input: `*** Begin Patch\n*** Add File: ${target}\n+approved patch\n*** End Patch` });
    expect(fs.readFileSync(target, 'utf8')).toBe('approved patch\n');
    expect(JSON.stringify(result)).toContain('committed'); expect(host.approval).toHaveBeenCalledOnce();
    expect(host.options.workspaceRoots).toBeUndefined();
  });

  it('keeps external patch reads and writes bound across multiple directories and an absolute alias', async () => {
    const other = path.join(fixture, 'other'); fs.mkdirSync(other);
    const alias = path.join(fixture, 'alias'); fs.symlinkSync(outside, alias, 'dir');
    const source = path.join(outside, 'source.txt'); fs.writeFileSync(source, 'first\n');
    const target = path.join(other, 'new.txt');
    const host = setup(async prompt => {
      expect(fs.readFileSync(source, 'utf8')).toBe('first\n'); expect(fs.existsSync(target)).toBe(false);
      const selected = prompt.context.selections!.map(group => group.id);
      return { promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once', selected,
        selectionRevision: prompt.context.selectionPreview!(selected).revision };
    });
    await host.run('apply_patch', { input: `*** Begin Patch\n*** Update File: ${path.join(alias, 'source.txt')}\n@@\n-first\n+second\n*** Add File: ${target}\n+new\n*** End Patch` });
    expect(fs.readFileSync(source, 'utf8')).toBe('second\n'); expect(fs.readFileSync(target, 'utf8')).toBe('new\n');
    expect(host.approval).toHaveBeenCalledOnce(); expect(host.options.workspaceRoots).toBeUndefined();
  });

  it('rechecks session admission after one-time approval', async () => {
    let current = true;
    const target = path.join(outside, 'revoked.txt');
    const host = setup(async prompt => {
      current = false; return { promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once' };
    }, { admission: () => current ? undefined : 'The session binding changed.' });
    expect(JSON.stringify(await host.run('write', { path: target, content: 'unsafe' }))).toContain('session binding changed');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('retains the original configuration scope owner during external execution checks', async () => {
    const target = path.join(outside, 'scoped.txt');
    const source = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, JSON.stringify({ pathRules: [{ path: outside, settings: { denyRules: [] } }] }));
    const configScope = toolScopeBinding(getRuntimeConfig(primary)); expect(configScope).toBeDefined();
    const host = setup(undefined, { configScope });
    const result = await host.run('write', { path: target, content: 'approved' });
    expect(JSON.stringify(result)).not.toContain('scope selection changed');
    expect(fs.readFileSync(target, 'utf8')).toBe('approved'); expect(host.approval).toHaveBeenCalledOnce();
  });

  it('requires a fresh approval after the same argument object already executed', async () => {
    const args = { path: path.join(outside, 'saved.txt'), content: 'approved' };
    const host = setup(); await host.run('write', args);
    const tool = host.tools.find(tool => tool.name === 'write')!;
    expect((await tool.execute('call_external', args, undefined)).isError).toBe(true);
    expect(host.approval).toHaveBeenCalledOnce(); expect(fs.readFileSync(args.path, 'utf8')).toBe('approved');
  });

  it('does not apply an external patch with stale selection or relative escape', async () => {
    const target = path.join(outside, 'patch.txt');
    const host = setup(async prompt => ({ promptId: prompt.id, respondedAt: Date.now(), decision: 'allow-once',
      selected: prompt.context.selections!.map(group => group.id), selectionRevision: 'stale' }));
    await host.run('apply_patch', { input: `*** Begin Patch\n*** Add File: ${target}\n+unsafe\n*** End Patch` });
    expect(fs.existsSync(target)).toBe(false);
    await host.run('apply_patch', { input: '*** Begin Patch\n*** Add File: ../outside/escape.txt\n+unsafe\n*** End Patch' });
    expect(host.approval).toHaveBeenCalledOnce(); expect(fs.existsSync(path.join(outside, 'escape.txt'))).toBe(false);
  });
});
