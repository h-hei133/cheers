import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gitFixture, gitGate, gitCommandContext } from '../../../test-utils/git.js';
import { NativeGit } from '../read/native.js';
import { readGitSnapshot } from '../read/snapshot.js';
import { readGitDiff } from '../read/diff.js';
import { prepareFileChange, prepareCommit, prepareBranch } from './plan.js';
import { runNativeGit } from './gate.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import { gitRequestMode } from './policy.js';
import { assertSourceAccess } from '../../../core/query/sourcePolicy.js';
import { GitWorkbench } from '../service.js';
import { memoryGitStore } from '../../../test-utils/git.js';
import { GitCommitIntent } from './intent.js';

describe('exact native Git approval', () => {
  let fixture: ReturnType<typeof gitFixture>;
  beforeEach(() => { fixture = gitFixture(); for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'GIT_CEILING_DIRECTORIES', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']) vi.stubEnv(key, fixture.env[key as keyof typeof fixture.env]!); });
  afterEach(() => { vi.unstubAllEnvs(); fixture.cleanup(); });
  it('stages only a selected original hunk and unstage preserves every worktree byte', async () => {
    const original = fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'); const changed = original.replace('line 2\n', 'changed 2\n').replace('line 70\n', 'changed 70\n');
    fs.writeFileSync(path.join(fixture.root, 'a.txt'), changed); fs.writeFileSync(path.join(fixture.root, 'other.txt'), 'other\n');
    const git = new NativeGit(fixture.root); let snapshot = await readGitSnapshot(git); const diff = await readGitDiff(git, snapshot, 'unstaged', 'a.txt');
    expect(diff.hunks).toHaveLength(2);
    let result = await runNativeGit(git, await prepareFileChange(git, snapshot, 'stage', 'a.txt', diff.hunks[0]!.id), gitGate(fixture.root), () => {});
    expect(result.status).toBe('succeeded'); const staged = fixture.git(['show', ':a.txt']); expect(staged).toContain('changed 2'); expect(staged).not.toContain('changed 70'); expect(fixture.git(['diff', '--cached', '--name-only'])).not.toContain('other.txt');
    snapshot = await readGitSnapshot(git); const undo = await readGitDiff(git, snapshot, 'staged', 'a.txt');
    result = await runNativeGit(git, await prepareFileChange(git, snapshot, 'unstage', 'a.txt', undo.hunks[0]!.id), gitGate(fixture.root), () => {});
    expect(result.status).toBe('succeeded'); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8')).toBe(changed); expect(fixture.git(['show', ':a.txt'])).toBe(original);
  });
  it('keeps repository-relative diff, index actions and commit readback correct from a nested workspace', async () => {
    const nested = path.join(fixture.root, 'nested'); fs.mkdirSync(nested); fs.writeFileSync(path.join(nested, 'file.txt'), 'base\n'); fixture.git(['add', '--', 'nested/file.txt']); fixture.git(['commit', '-qm', 'nested base']);
    fs.writeFileSync(path.join(nested, 'file.txt'), 'selected\n'); fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'outside selected workspace\n');
    const git = new NativeGit(nested); let snapshot = await readGitSnapshot(git);
    expect(snapshot.files.map(file => file.path)).toEqual(['a.txt', 'nested/file.txt']);
    expect((await readGitDiff(git, snapshot, 'unstaged', 'nested/file.txt')).text).toContain('+selected');
    expect((await runNativeGit(git, await prepareFileChange(git, snapshot, 'stage', 'nested/file.txt'), gitGate(nested), () => {})).status).toBe('succeeded');
    snapshot = await readGitSnapshot(git);
    const result = await runNativeGit(git, await prepareCommit(git, snapshot, 'nested exact commit'), gitGate(nested), () => {});
    expect(result.status).toBe('succeeded'); expect(fixture.git(['show', 'HEAD:nested/file.txt'])).toBe('selected\n'); expect(fixture.git(['diff', '--name-only'])).toBe('a.txt\n');
  });
  it.each(['worktree', 'index', 'hooks', 'config'] as const)('rejects an external %s change after exact approval', async kind => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'first\n'); const git = new NativeGit(fixture.root); const plan = await prepareFileChange(git, await readGitSnapshot(git), 'stage', 'a.txt');
    const gate = gitGate(fixture.root, 'allow-once', { escalationPromptHandler: async prompt => {
      expect(prompt.context.preview).toContain(plan.snapshot.fingerprint);
      if (kind === 'worktree') fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'external\n');
      else if (kind === 'index') fixture.git(['add', '--', 'a.txt']);
      else if (kind === 'hooks') fs.writeFileSync(path.join(fixture.root, '.git', 'hooks', 'pre-commit'), '# changed\n');
      else fixture.git(['config', 'user.name', 'External']);
      return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() };
    } });
    const before = fixture.git(['show', ':a.txt']); const result = await runNativeGit(git, plan, gate, () => {}); expect(result.status).toBe('blocked'); expect(result.note).toContain('GIT_STATE_CHANGED');
    if (kind !== 'index') expect(fixture.git(['show', ':a.txt'])).toBe(before);
  });
  it('honors deny and pre-use hooks without writes; branch operations and exact commit readback share the gate', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'staged\n'); const git = new NativeGit(fixture.root); let state = await readGitSnapshot(git);
    const stage = await prepareFileChange(git, state, 'stage', 'a.txt'); expect((await runNativeGit(git, stage, gitGate(fixture.root, 'deny'), () => {})).status).toBe('denied');
    const hooks = new HookDispatcher(); hooks.registerInProcessHook({ event: 'PreToolUse', handler: async () => ({ decision: 'block', reason: 'fixture refusal' }) });
    expect((await runNativeGit(git, stage, gitGate(fixture.root, 'allow-once', { hooks }), () => {})).status).toBe('blocked'); expect(fixture.git(['diff', '--cached'])).toBe('');
    expect((await runNativeGit(git, stage, gitGate(fixture.root), () => {})).status).toBe('succeeded');
    fs.writeFileSync(path.join(fixture.root, 'leave-untracked.txt'), 'not in commit\n'); state = await readGitSnapshot(git);
    const result = await runNativeGit(git, await prepareCommit(git, state, 'exact commit\n\nbody'), gitGate(fixture.root), () => {});
    expect(result.status).toBe('succeeded'); expect(result.hash).toBe(fixture.git(['rev-parse', 'HEAD']).trim()); expect(fixture.git(['ls-tree', '--name-only', 'HEAD'])).not.toContain('leave-untracked');
    for (const [action, name] of [['create', 'topic'], ['switch', 'topic'], ['switch', 'main'], ['delete', 'topic']] as const) {
      state = await readGitSnapshot(git); expect((await runNativeGit(git, await prepareBranch(git, state, action, name), gitGate(fixture.root), () => {})).status).toBe('succeeded');
    }
  });
  it('binds external configured hooks and freezes the process environment across approval', async () => {
    const hookDir = path.join(fixture.base, 'custom-hooks'); fs.mkdirSync(hookDir); const hook = path.join(hookDir, 'pre-commit'); fs.writeFileSync(hook, '# original\n'); fixture.git(['config', 'core.hooksPath', hookDir]);
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'selected\n'); const execution = createDefaultExecutionService(); let mutationEnvironment: string | undefined;
    const git = new NativeGit(fixture.root, { runCommand: async request => { if (request.args.includes('add')) mutationEnvironment = request.env?.GIT_CONFIG_COUNT; return execution.runCommand(request); } });
    const plan = await prepareFileChange(git, await readGitSnapshot(git), 'stage', 'a.txt');
    const stale = await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { escalationPromptHandler: async prompt => { fs.appendFileSync(hook, '# external edit\n'); return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() }; } }), () => {});
    expect(stale.status).toBe('blocked'); expect(fixture.git(['diff', '--cached'])).toBe('');
    const fresh = await prepareFileChange(git, await readGitSnapshot(git), 'stage', 'a.txt');
    const frozen = await runNativeGit(git, fresh, gitGate(fixture.root, 'allow-once', { escalationPromptHandler: async prompt => { vi.stubEnv('GIT_CONFIG_COUNT', '1'); vi.stubEnv('GIT_CONFIG_KEY_0', 'user.name'); vi.stubEnv('GIT_CONFIG_VALUE_0', 'changed after approval'); return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() }; } }), () => {});
    expect(frozen.status).toBe('succeeded'); expect(mutationEnvironment).toBeUndefined();
  });
  it('narrows only the native review request through the existing plan gate and preserves normal build writes', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'review target\n'); const context = gitCommandContext(fixture.root);
    const review = await context.gitCommand(['review'], context);
    expect(review.kind).toBe('prompt'); if (review.kind !== 'prompt') throw new Error('Expected native review request.');
    expect(gitRequestMode({ role: 'user', content: review.prompt, metadata: review.promptMetadata })).toBe('plan');
    const git = new NativeGit(fixture.root); const plan = await prepareFileChange(git, await readGitSnapshot(git), 'stage', 'a.txt');
    const reviewMode = gitRequestMode({ role: 'user', content: review.prompt, metadata: review.promptMetadata }) ?? 'build';
    expect((await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { agentMode: reviewMode }), () => {})).status).toBe('blocked');
    expect(fixture.git(['diff', '--cached'])).toBe(''); expect(gitRequestMode({ role: 'user', content: 'Implement this change.' })).toBeUndefined();
    expect((await runNativeGit(git, plan, gitGate(fixture.root, 'allow-once', { agentMode: 'build' }), () => {})).status).toBe('succeeded');
  });
  it('retains real commit status/hash/receipts when final durable publication fails, without a second commit or save', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'staged\n'); fixture.git(['add', '--', 'a.txt']); const git = new NativeGit(fixture.root);
    const before = fixture.git(['rev-list', '--count', 'HEAD']); const published: string[] = [];
    const result = await runNativeGit(git, await prepareCommit(git, await readGitSnapshot(git), 'one actual commit'), gitGate(fixture.root), outcome => {
      published.push(outcome.status); if (outcome.status === 'succeeded') throw new Error('Synthetic receipt publication unavailable.');
    });
    expect(result.status).toBe('succeeded'); expect(result.hash).toBe(fixture.git(['rev-parse', 'HEAD']).trim()); expect(result.receipts).toHaveLength(1);
    expect(result.durability).toBe('unknown'); expect(result.note).toContain('could not be durably saved'); expect(published).toEqual(['permission-pending', 'succeeded']);
    expect(Number(fixture.git(['rev-list', '--count', 'HEAD']))).toBe(Number(before) + 1);
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'next staged\n'); fixture.git(['add', '--', 'a.txt']); const state = await readGitSnapshot(git); const plan = await prepareCommit(git, state, 'host commit');
    let id = ''; const store = memoryGitStore(); const intent = new GitCommitIntent({ ...store, write: () => { throw new Error('Synthetic final save unavailable.'); } }, () => ({ id: 's', cwd: fixture.root, prompt: { role: 'user', content: '/commit', metadata: { source: 'git-commit', gitCommitId: id } } }));
    id = intent.arm(state, plan.commitIndex!); const tool = intent.tools(git)[0]!; const prepared = tool.prepare!({ commitId: id, message: 'host actual commit' }, { workspaceRoot: fixture.root, taskId: 'prepare' });
    const executed = await prepared.execute({ workspaceRoot: fixture.root, taskId: 'execute' });
    expect(executed.success).toBe(true); expect(executed.metadata?.gitOperation).toMatchObject({ status: 'succeeded', durability: 'unknown', hash: fixture.git(['rev-parse', 'HEAD']).trim() }); expect(intent.tools(git)).toEqual([]);
  });
  it('stops before dispatch when pending durable publication fails', async () => {
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'selected\n'); const git = new NativeGit(fixture.root); const before = fixture.git(['show', ':a.txt']);
    const result = await runNativeGit(git, await prepareFileChange(git, await readGitSnapshot(git), 'stage', 'a.txt'), gitGate(fixture.root), () => { throw new Error('Synthetic storage outage.'); });
    expect(result.status).toBe('blocked'); expect(result.durability).toBe('unknown'); expect(fixture.git(['show', ':a.txt'])).toBe(before);
  });
  it.each(['info', 'configured', 'global'] as const)('binds %s attribute-policy bytes before staging CRLF content', async location => {
    const policy = location === 'info' ? path.join(fixture.root, '.git', 'info', 'attributes') : location === 'configured' ? path.join(fixture.home, 'configured-attributes') : path.join(fixture.home, '.config', 'git', 'attributes');
    fs.mkdirSync(path.dirname(policy), { recursive: true }); if (location === 'configured') fixture.git(['config', 'core.attributesFile', policy]);
    fs.writeFileSync(path.join(fixture.root, 'a.txt'), 'raw selected\r\n'); const git = new NativeGit(fixture.root); const before = fixture.git(['show', ':a.txt']);
    const result = await runNativeGit(git, await prepareFileChange(git, await readGitSnapshot(git), 'stage', 'a.txt'), gitGate(fixture.root, 'allow-once', { escalationPromptHandler: async prompt => {
      fs.writeFileSync(policy, 'a.txt text eol=lf\n'); return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() };
    } }), () => {});
    expect(result.status).toBe('blocked'); expect(result.note).toContain('GIT_STATE_CHANGED'); expect(fixture.git(['show', ':a.txt'])).toBe(before); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8')).toBe('raw selected\r\n');
  });
  it('stages a granted nested file without reading protected outside bytes, and refuses protected model diff exposure', async () => {
    const nested = path.join(fixture.root, 'nested'); fs.mkdirSync(nested); fs.writeFileSync(path.join(nested, 'selected.txt'), 'selected\n'); fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'protected evidence\n');
    const denied = [{ tool: 'read', pattern: 'a.txt' }]; const sourceAccess = (absolute: string) => assertSourceAccess(absolute, nested, [], 'ask', denied);
    const git = new NativeGit(nested, undefined, sourceAccess); const snapshot = await readGitSnapshot(git);
    expect(snapshot.unreadablePaths).toEqual(['a.txt']); const before = fs.readFileSync(path.join(fixture.root, 'a.txt'));
    expect((await runNativeGit(git, await prepareFileChange(git, snapshot, 'stage', 'nested/selected.txt'), gitGate(nested, 'allow-once', { denyRules: denied }), () => {})).status).toBe('succeeded');
    await expect(readGitDiff(git, await readGitSnapshot(git), 'unstaged', 'a.txt')).rejects.toThrow();
    const host = new GitWorkbench({ sourceAccess, currentRoot: () => nested, store: memoryGitStore(), busy: () => false, armCommit: () => 'unused', binding: { owns: () => false, remember: () => {}, migrate: () => ({ changed: false, note: 'unused' }) }, execute: async () => { throw new Error('unused'); } });
    expect((await host.command(['review'], { cwd: nested })).kind).toBe('local'); fixture.git(['add', '--', 'a.txt']);
    const commit = await host.commit(''); expect(commit.kind).toBe('local'); expect(JSON.stringify(commit)).not.toContain('protected evidence'); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'))).toEqual(before);
  });
  it('discloses limited unreadable evidence in review and commit clean-state shortcuts without claiming the tree clean', async () => {
    const denied = [{ tool: 'read', pattern: 'a.txt' }]; const sourceAccess = (absolute: string) => assertSourceAccess(absolute, fixture.root, [], 'ask', denied);
    const armCommit = vi.fn(() => 'unused'); const execute = vi.fn(async () => { throw new Error('No native operation expected.'); });
    const host = new GitWorkbench({ sourceAccess, currentRoot: () => fixture.root, store: memoryGitStore(), busy: () => false, armCommit, binding: { owns: () => false, remember: () => {}, migrate: () => ({ changed: false, note: 'unused' }) }, execute });
    const beforeIndex = fs.readFileSync(path.join(fixture.root, '.git', 'index')); const beforeBytes = fs.readFileSync(path.join(fixture.root, 'a.txt')); const head = fixture.git(['rev-parse', 'HEAD']);
    const status = await host.command(['status'], { cwd: fixture.root }); expect(status.kind).toBe('local'); if (status.kind === 'local') expect(status.report?.facts.status).toBe('limited');
    for (const result of [await host.command(['review'], { cwd: fixture.root }), await host.commit('')]) {
      expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('evidence unavailable') }); if (result.kind !== 'local') throw new Error('Expected a limited local result.');
      expect(result.output).toContain('limited to native metadata/status'); expect(result.output).toContain('"a.txt"'); expect(result.output).toContain('source bytes were unreadable and not verified'); expect(result.output).not.toMatch(/tree(?: is)? clean/i);
    }
    expect(armCommit).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled(); expect(fs.readFileSync(path.join(fixture.root, '.git', 'index'))).toEqual(beforeIndex); expect(fs.readFileSync(path.join(fixture.root, 'a.txt'))).toEqual(beforeBytes); expect(fixture.git(['rev-parse', 'HEAD'])).toBe(head);
  });
});
