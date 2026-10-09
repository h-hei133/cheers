import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gitFixture } from '../../../test-utils/git.js';
import { NativeGit } from './native.js';
import { readGitSnapshot } from './snapshot.js';
import { readGitDiff } from './diff.js';
import { getWorkflowGitContext, getWorkflowGitDiagnostics } from '../../gitContext.js';

describe('native Git truth and safe passive inspection', () => {
  let fixture: ReturnType<typeof gitFixture>;
  beforeEach(() => { fixture = gitFixture(); for (const key of ['HOME', 'USERPROFILE', 'GIT_CEILING_DIRECTORIES', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']) vi.stubEnv(key, fixture.env[key as keyof typeof fixture.env]!); });
  afterEach(() => { vi.unstubAllEnvs(); fixture.cleanup(); });
  it('retains both index/worktree versions and NUL literal paths, rename and binary identity', async () => {
    const original = fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8');
    fs.writeFileSync(path.join(fixture.root, 'a.txt'), original.replace('line 2\n', 'staged 2\n')); fixture.git(['add', '--', 'a.txt']);
    fs.writeFileSync(path.join(fixture.root, 'a.txt'), original.replace('line 2\n', 'staged 2\n').replace('line 70\n', 'worktree 70\n'));
    fs.writeFileSync(path.join(fixture.root, 'literal *\tname\n.txt'), 'literal\n'); fs.writeFileSync(path.join(fixture.root, 'binary.bin'), Buffer.from([0, 255, 1]));
    fixture.git(['add', '--', 'binary.bin']);
    const git = new NativeGit(fixture.root); const snapshot = await readGitSnapshot(git);
    expect(snapshot.files.find(file => file.path === 'a.txt')).toMatchObject({ index: 'M', worktree: 'M' });
    expect(snapshot.files.some(file => file.path === 'literal *\tname\n.txt')).toBe(true);
    const staged = await readGitDiff(git, snapshot, 'staged', 'a.txt'); const unstaged = await readGitDiff(git, snapshot, 'unstaged', 'a.txt');
    expect(staged.text).toContain('+staged 2'); expect(staged.text).not.toContain('+worktree 70');
    expect(unstaged.hunks[0]?.newStart).toBe(67); expect(unstaged.text).toContain('+worktree 70');
    expect((await readGitDiff(git, snapshot, 'staged', 'binary.bin')).binary).toBe(true);
    fixture.git(['mv', '--', 'a.txt', 'renamed file.txt']); const renamed = await readGitSnapshot(git);
    expect(renamed.files.find(file => file.path === 'renamed file.txt')?.originalPath).toBe('a.txt');
  });
  it('never invokes configured filter/fsmonitor/extdiff helpers, including synchronous bootstrap', async () => {
    const marker = path.join(fixture.base, 'helper-ran'); const command = `touch ${marker}; cat`;
    fs.writeFileSync(path.join(fixture.root, '.gitattributes'), 'a.txt filter=fixture\n');
    fixture.git(['config', 'filter.fixture.clean', command]); fixture.git(['config', 'core.fsmonitor', `touch ${marker}`]); fixture.git(['config', 'diff.external', `touch ${marker}`]);
    await expect(readGitSnapshot(new NativeGit(fixture.root))).rejects.toThrow('filters require execution approval');
    expect(getWorkflowGitContext(fixture.root).isClean).toBeNull(); expect(getWorkflowGitDiagnostics(fixture.root).statusAvailable).toBe(false);
    expect(fs.existsSync(marker)).toBe(false);
    fixture.git(['config', '--unset', 'filter.fixture.clean']);
    fs.appendFileSync(path.join(fixture.root, 'a.txt'), 'change\n'); const git = new NativeGit(fixture.root); const snapshot = await readGitSnapshot(git);
    await readGitDiff(git, snapshot, 'unstaged', 'a.txt'); getWorkflowGitContext(fixture.root); expect(fs.existsSync(marker)).toBe(false);
  });
  it('returns unborn HEAD and refuses failed reads rather than claiming clean', async () => {
    const unborn = gitFixture(true);
    try { const state = await readGitSnapshot(new NativeGit(unborn.root)); expect(state.head).toBeNull(); expect(state.branch).toBe('main'); }
    finally { unborn.cleanup(); }
    await expect(readGitSnapshot(new NativeGit(path.join(fixture.base, 'missing')))).rejects.toThrow();
  });
});
