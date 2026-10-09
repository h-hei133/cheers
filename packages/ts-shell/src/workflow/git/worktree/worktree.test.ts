import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gitFixture, gitGate } from '../../../test-utils/git.js';
import { NativeGit } from '../read/native.js';
import { readGitSnapshot } from '../read/snapshot.js';
import { prepareWorktree, prepareWorktreeDelete, type WorktreeBinding } from './plan.js';
import { runNativeGit } from '../operation/gate.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import { checkoutIdentity, sameCheckout, type CheckoutIdentity } from './identity.js';
import { captureWorkspaceRoot } from '../../../core/workspace/roots.js';
import { assertSourceAccess } from '../../../core/query/sourcePolicy.js';

describe('owned worktree migration preserves source and destination truth', () => {
  let fixture: ReturnType<typeof gitFixture>;
  let owned: Map<string, CheckoutIdentity & { branch: string; head: string }>;
  beforeEach(() => { fixture = gitFixture(); owned = new Map(); for (const key of ['HOME', 'USERPROFILE', 'GIT_CEILING_DIRECTORIES', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']) vi.stubEnv(key, fixture.env[key as keyof typeof fixture.env]!); });
  afterEach(() => { vi.unstubAllEnvs(); fixture.cleanup(); });
  function binding(changed = true): WorktreeBinding { return {
    migrate: () => ({ changed, note: changed ? 'Same session binding migrated.' : 'Rebind did not commit.' }),
    owns: (target, branch, head) => { const item = owned.get(target); return !!item && sameCheckout(target, item) && (!branch || item.branch === branch) && (head === undefined || item.head === head); },
    remember: (target, branch, head) => owned.set(target, { ...checkoutIdentity(target), branch, head }), forget: target => { owned.delete(target); },
  }; }
  it('carries staged/unstaged CRLF rename, binary, untracked literal paths and executable modes without cleaning source', async () => {
    fs.writeFileSync(path.join(fixture.root, 'old.txt'), 'old\r\n'); fs.writeFileSync(path.join(fixture.root, 'binary.bin'), Buffer.from([0, 255, 1])); fixture.git(['add', '--', 'old.txt', 'binary.bin']); fixture.git(['commit', '-qm', 'binary and rename base']);
    fixture.git(['mv', '--', 'old.txt', 'new name.txt']); fs.writeFileSync(path.join(fixture.root, 'new name.txt'), 'changed\r\n');
    fs.writeFileSync(path.join(fixture.root, 'binary.bin'), Buffer.from([0, 254, 2])); fixture.git(['add', '--', 'binary.bin']); fs.appendFileSync(path.join(fixture.root, 'binary.bin'), Buffer.from([128]));
    fs.writeFileSync(path.join(fixture.root, 'literal *.txt'), 'literal\r\n'); fs.chmodSync(path.join(fixture.root, 'a.txt'), 0o755);
    const beforeIndex = fixture.git(['ls-files', '--stage', '-z']); const beforeStatus = fixture.git(['status', '--porcelain=v2', '-z']);
    const target = path.join(fixture.base, 'destination'); const nested = path.join(fixture.root, 'nested'); fs.mkdirSync(nested); const git = new NativeGit(nested);
    const plan = await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', binding());
    const result = await runNativeGit(git, plan, gitGate(nested, 'allow-once', { workspaceRoots: [captureWorkspaceRoot(fixture.root, nested, 'read')] }), () => {});
    expect(result.status).toBe('succeeded'); expect(fixture.git(['ls-files', '--stage', '-z'], target)).toBe(beforeIndex); expect(fixture.git(['status', '--porcelain=v2', '-z'], target)).toBe(beforeStatus);
    for (const name of ['new name.txt', 'binary.bin', 'literal *.txt', 'a.txt']) expect(fs.readFileSync(path.join(target, name))).toEqual(fs.readFileSync(path.join(fixture.root, name)));
    expect(fs.statSync(path.join(target, 'a.txt')).mode & 0o777).toBe(0o755); expect(fs.existsSync(path.join(target, 'old.txt'))).toBe(false);
    expect(fixture.git(['ls-files', '--stage', '-z'])).toBe(beforeIndex); expect(fixture.git(['status', '--porcelain=v2', '-z'])).toBe(beforeStatus);
  });
  it('retains dirty transferred target and source after failed rebind, and refuses conflicting destination or deletion', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'dirty\n'); const target = path.join(fixture.base, 'destination'); const git = new NativeGit(fixture.root);
    const result = await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', binding(false)), gitGate(fixture.root), () => {});
    expect(result.status).toBe('partial'); expect(fs.readFileSync(path.join(target, 'a.txt'))).toEqual(fs.readFileSync(path.join(fixture.root, 'a.txt')));
    await expect(prepareWorktree(git, await readGitSnapshot(git), 'create', target, 'another', binding())).rejects.toThrow('already exists');
    await expect(prepareWorktreeDelete(git, await readGitSnapshot(git), target, binding())).rejects.toThrow('Dirty');
  });
  it('rejects new target edits after creation instead of overwriting or force-cleaning them', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'source edit\n'); const target = path.join(fixture.base, 'destination'); const execution = createDefaultExecutionService();
    const git = new NativeGit(fixture.root, { runCommand: async request => {
      const result = await execution.runCommand(request);
      if (request.cwd === target && request.args.includes('read-tree')) fs.writeFileSync(path.join(target, 'a.txt'), 'concurrent user edit\n');
      return result;
    } });
    const result = await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', binding()), gitGate(fixture.root), () => {});
    expect(result.status).toBe('partial'); expect(fs.readFileSync(path.join(target, 'a.txt'), 'utf8')).toBe('concurrent user edit\n'); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8')).toContain('source edit');
  });
  it('non-forced cleanup removes only a clean owned inactive checkout and retains its branch', async () => {
    const target = path.join(fixture.base, 'destination'); const git = new NativeGit(fixture.root);
    expect((await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'create', target, 'topic', binding()), gitGate(fixture.root), () => {})).status).toBe('succeeded');
    expect((await runNativeGit(git, await prepareWorktreeDelete(git, await readGitSnapshot(git), target, binding()), gitGate(fixture.root), () => {})).status).toBe('succeeded');
    expect(fs.existsSync(target)).toBe(false); expect(fixture.git(['branch', '--list', 'topic'])).toContain('topic');
    expect(owned.has(target)).toBe(false);
  });
  it('retains ignored user bytes created in an owned clean destination during deletion approval', async () => {
    fs.writeFileSync(path.join(fixture.root, '.gitignore'), 'private.bin\n'); fixture.git(['add', '--', '.gitignore']); fixture.git(['commit', '-qm', 'ignore synthetic user content']);
    const target = path.join(fixture.base, 'destination'); const git = new NativeGit(fixture.root); const host = binding();
    expect((await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'create', target, 'topic', host), gitGate(fixture.root), () => {})).status).toBe('succeeded');
    const plan = await prepareWorktreeDelete(git, await readGitSnapshot(git), target, host); const bytes = Buffer.from([0, 255, 17]);
    const result = await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { escalationPromptHandler: async prompt => {
      fs.writeFileSync(path.join(target, 'private.bin'), bytes); return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() };
    } }), () => {});
    expect(result.status).toBe('blocked'); expect(result.note).toContain('ignored user files'); expect(fs.readFileSync(path.join(target, 'private.bin'))).toEqual(bytes);
    expect(fixture.git(['status', '--porcelain'], target)).toBe(''); expect(host.owns(target)).toBe(true);
  });
  it.each(['create', 'migrate'] as const)('retains ignored user bytes during failed %s compensation', async action => {
    fs.writeFileSync(path.join(fixture.root, '.gitignore'), 'private.bin\n'); fixture.git(['add', '--', '.gitignore']); fixture.git(['commit', '-qm', 'ignore synthetic user content']);
    const sourceIndex = fixture.git(['ls-files', '--stage', '-z']); const sourceBytes = fs.readFileSync(path.join(fixture.root, 'a.txt'));
    const target = path.join(fixture.base, 'destination'); const git = new NativeGit(fixture.root); const host = binding(); const bytes = Buffer.from([0, 254, 18]);
    const failedHost = { ...host, remember: (directory: string, branch: string, head: string) => {
      host.remember(directory, branch, head); fs.writeFileSync(path.join(directory, 'private.bin'), bytes); throw new Error('Synthetic post-create publication failure.');
    } };
    const result = await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), action, target, 'topic', failedHost), gitGate(fixture.root), () => {});
    expect(result.status).toBe('partial'); expect(result.note).toContain('ignored user files'); expect(fs.readFileSync(path.join(target, 'private.bin'))).toEqual(bytes);
    expect(fixture.git(['status', '--porcelain'], target)).toBe(''); expect(host.owns(target)).toBe(true);
    expect(fixture.git(['ls-files', '--stage', '-z'])).toBe(sourceIndex); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'))).toEqual(sourceBytes);
  });
  it('refuses a user checkout recreated at a previously owned path even with the same branch and HEAD', async () => {
    const target = path.join(fixture.base, 'destination'); const git = new NativeGit(fixture.root); const host = binding();
    expect((await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'create', target, 'topic', host), gitGate(fixture.root), () => {})).status).toBe('succeeded');
    const previous = owned.get(target)!;
    fixture.git(['worktree', 'remove', target]); fixture.git(['worktree', 'add', target, 'topic']);
    expect(sameCheckout(target, previous)).toBe(false);
    await expect(prepareWorktreeDelete(git, await readGitSnapshot(git), target, host)).rejects.toThrow('owned inactive');
    expect(fs.existsSync(target)).toBe(true); expect(fixture.git(['status', '--porcelain'], target)).toBe('');
  });
  it('rejects another ref changed during creation and compensates only its clean destination', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'source preserved\n'); const target = path.join(fixture.base, 'destination'); const execution = createDefaultExecutionService();
    const git = new NativeGit(fixture.root, { runCommand: async request => {
      const result = await execution.runCommand(request);
      if (request.args.includes('worktree') && request.args.includes('add')) fixture.git(['branch', 'external']);
      return result;
    } });
    const result = await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', binding()), gitGate(fixture.root), () => {});
    expect(result.status).toBe('failed'); expect(result.note).toContain('GIT_STATE_CHANGED'); expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8')).toContain('source preserved'); expect(fixture.git(['branch', '--list', 'external'])).toContain('external');
  });
  it('retains early user destination edits before transfer and does not rebind', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'source dirty\n'); const target = path.join(fixture.base, 'destination'); const git = new NativeGit(fixture.root); const host = binding(); const migrate = vi.fn(host.migrate);
    const sourceIndex = fs.readFileSync(path.join(fixture.root, '.git', 'index')); const sourceBytes = fs.readFileSync(path.join(fixture.root, 'a.txt'));
    const result = await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', { ...host, migrate, remember: (directory, branch, head) => { host.remember(directory, branch, head); fs.writeFileSync(path.join(directory, 'a.txt'), 'early user edit\n'); } }), gitGate(fixture.root), () => {});
    expect(result.status).toBe('partial'); expect(migrate).not.toHaveBeenCalled(); expect(fs.readFileSync(path.join(target, 'a.txt'), 'utf8')).toBe('early user edit\n');
    expect(fs.readFileSync(path.join(fixture.root, '.git', 'index'))).toEqual(sourceIndex); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'))).toEqual(sourceBytes);
  });
  it('retains original parked and replacement checkout identity, branch and bytes without rebind', async () => {
    fixture.git(['branch', 'spare']); fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'source dirty\n'); const target = path.join(fixture.base, 'destination'); const parked = path.join(fixture.base, 'parked'); const git = new NativeGit(fixture.root); const host = binding(); const migrate = vi.fn(host.migrate);
    const sourceIndex = fs.readFileSync(path.join(fixture.root, '.git', 'index')); const sourceBytes = fs.readFileSync(path.join(fixture.root, 'a.txt'));
    const result = await runNativeGit(git, await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', { ...host, migrate, remember: (directory, branch, head) => {
      host.remember(directory, branch, head); fixture.git(['worktree', 'move', directory, parked]); fixture.git(['worktree', 'add', '--', directory, 'spare']); fs.writeFileSync(path.join(directory, 'a.txt'), 'replacement user bytes\n');
    } }), gitGate(fixture.root), () => {});
    expect(result.status).toBe('partial'); expect(migrate).not.toHaveBeenCalled(); expect(fs.readFileSync(path.join(target, 'a.txt'), 'utf8')).toBe('replacement user bytes\n');
    expect(fixture.git(['symbolic-ref', '--short', 'HEAD'], target).trim()).toBe('spare'); expect(fixture.git(['symbolic-ref', '--short', 'HEAD'], parked).trim()).toBe('topic'); expect(fixture.git(['status', '--porcelain'], parked)).toBe('');
    expect(fs.readFileSync(path.join(fixture.root, '.git', 'index'))).toEqual(sourceIndex); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'))).toEqual(sourceBytes);
  });
  it('enforces migration source read denial during capture and ordinary gate execution', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'protected synthetic source\n'); const target = path.join(fixture.base, 'destination'); const denied = [{ tool: 'read', pattern: 'a.txt' }]; const host = binding(); const migrate = vi.fn(host.migrate);
    const protectedGit = new NativeGit(fixture.root, undefined, absolute => assertSourceAccess(absolute, fixture.root, [], 'ask', denied));
    await expect(prepareWorktree(protectedGit, await readGitSnapshot(protectedGit), 'migrate', target, 'topic', host)).rejects.toThrow(); expect(fs.existsSync(target)).toBe(false);
    const git = new NativeGit(fixture.root); const plan = await prepareWorktree(git, await readGitSnapshot(git), 'migrate', target, 'topic', { ...host, migrate });
    expect(plan.sources).toContain(path.join(fixture.root, 'a.txt')); const result = await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { denyRules: denied }), () => {});
    expect(result.status).toBe('blocked'); expect(fs.existsSync(target)).toBe(false); expect(migrate).not.toHaveBeenCalled(); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8')).toContain('protected synthetic source');
    expect(plan.nativeTargets).toContain(path.join(target, 'a.txt'));
    const targetDenied = await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { denyRules: [{ tool: 'write', pattern: path.join(target, 'a.txt') }] }), () => {});
    expect(targetDenied.status).toBe('blocked'); expect(fs.existsSync(target)).toBe(false);
  });
});
